import type { SupabaseClient } from '@supabase/supabase-js';
import { getPostingProvider } from './client.ts';
import type {
  PostStatus,
  Platform,
  PostingProvider,
  ScheduleRequest,
  TickResult,
} from './types.ts';
import { fireEvent } from '../webhooks/dispatcher.ts';
import { extractFirstComment } from './first-comment.ts';

/**
 * Scheduler service.
 *
 * Responsibilities:
 *  1. schedule(content_id, account_id, when) → creates `post` row in DB with
 *     status='scheduled' and scheduled_at=when.
 *  2. tick() → finds all posts with scheduled_at <= now AND status='scheduled',
 *     calls posting provider for each, updates status accordingly.
 *
 * Called via:
 *  - CLI: `pnpm post:tick` (for manual cron during dogfood)
 *  - Future: Vercel Cron / Inngest / Supabase pg_cron (every minute)
 */

export class PostingScheduler {
  private supabase: SupabaseClient;
  private workspaceId: string;

  constructor(supabase: SupabaseClient, workspaceId: string) {
    this.supabase = supabase;
    this.workspaceId = workspaceId;
  }

  /** Create a scheduled post row (no posting yet — happens on tick()). */
  async schedule(req: ScheduleRequest) {
    // Verify the content + account exist and belong to this workspace
    const { data: content } = await this.supabase
      .from('content')
      .select('id, brand_id')
      .eq('id', req.content_id)
      .eq('workspace_id', this.workspaceId)
      .single();
    if (!content) throw new Error(`Content ${req.content_id} not found`);

    const { data: account } = await this.supabase
      .from('account')
      .select('id, brand_id, status, daily_post_cap')
      .eq('id', req.account_id)
      .eq('workspace_id', this.workspaceId)
      .single();
    if (!account) throw new Error(`Account ${req.account_id} not found`);
    if (account.brand_id !== content.brand_id) {
      throw new Error(
        `Account ${req.account_id} belongs to a different brand than content ${req.content_id}`,
      );
    }

    const provider = getPostingProvider();
    const { data: post, error } = await this.supabase
      .from('post')
      .insert({
        workspace_id: this.workspaceId,
        content_id: req.content_id,
        account_id: req.account_id,
        scheduled_at: req.scheduled_at.toISOString(),
        status: 'scheduled' as PostStatus,
        posting_provider: provider.name as PostingProvider,
        caption_variant: req.caption_variant ?? null,
        hashtags_variant: req.hashtags_variant ?? null,
      })
      .select('id, scheduled_at')
      .single();
    if (error || !post) throw new Error(`Failed to schedule post: ${error?.message}`);
    return post;
  }

  /**
   * Process all due posts (scheduled_at <= now, status='scheduled' OR
   * status='failed' AND retries < max_retries AND now() >= next_retry_at).
   *
   * Retry policy: exponential backoff (5s, 30s, 5min, 30min, 6h).
   * After max_retries the post stays 'failed' (treated as dead-letter).
   */
  async tick(limit = 50): Promise<TickResult> {
    const provider = getPostingProvider();
    const now = new Date();
    const nowIso = now.toISOString();
    const MAX_RETRIES = 4;
    // Backoff schedule in ms: 5s, 30s, 5min, 30min, 6h
    const BACKOFF_SCHEDULE_MS = [5_000, 30_000, 5 * 60_000, 30 * 60_000, 6 * 60 * 60_000];

    // 1. Pick due posts: brand-new (status=scheduled) OR retry-eligible failed.
    //    We query both and merge.
    const [{ data: newDue, error: newErr }, { data: retryDue, error: retryErr }] = await Promise.all([
      this.supabase
        .from('post')
        .select('id, content_id, account_id, caption_variant, hashtags_variant, retries')
        .eq('workspace_id', this.workspaceId)
        .eq('status', 'scheduled')
        .lte('scheduled_at', nowIso)
        .order('scheduled_at', { ascending: true })
        .limit(limit),
      this.supabase
        .from('post')
        .select('id, content_id, account_id, caption_variant, hashtags_variant, retries, error_log')
        .eq('workspace_id', this.workspaceId)
        .eq('status', 'failed')
        .lt('retries', MAX_RETRIES)
        .order('updated_at', { ascending: true })
        .limit(limit),
    ]);
    if (newErr || retryErr) {
      throw new Error(`Failed to query due posts: ${(newErr ?? retryErr)?.message}`);
    }

    // Filter retry-eligible by next_retry_at (computed from error_log + retries)
    const retryEligible = (retryDue ?? []).filter((p) => {
      const log = p.error_log as { last_attempt_at?: string } | null;
      const lastAttempt = log?.last_attempt_at ? new Date(log.last_attempt_at) : null;
      if (!lastAttempt) return true; // never attempted? treat as ready
      const waitMs = BACKOFF_SCHEDULE_MS[Math.min(p.retries, BACKOFF_SCHEDULE_MS.length - 1)]!;
      return now.getTime() - lastAttempt.getTime() >= waitMs;
    });

    const due = [...(newDue ?? []), ...retryEligible].slice(0, limit);

    const result: TickResult = {
      processed: due.length,
      published: 0,
      failed: 0,
      details: [],
    };

    for (const post of due) {
      const currentRetries = (post as { retries: number }).retries ?? 0;
      try {
        // Mark publishing first (avoid double-pickup on concurrent ticks).
        // We use the post's CURRENT status (scheduled OR failed) as optimistic lock.
        const previousStatus = (post as { error_log?: unknown }).error_log ? 'failed' : 'scheduled';
        const { error: lockErr } = await this.supabase
          .from('post')
          .update({ status: 'publishing' })
          .eq('id', post.id)
          .eq('workspace_id', this.workspaceId)
          .eq('status', previousStatus); // optimistic lock
        if (lockErr) throw new Error(`Lock failed: ${lockErr.message}`);

        // Load content + account in parallel
        const [{ data: content }, { data: account }] = await Promise.all([
          this.supabase
            .from('content')
            .select('id, caption, hashtags, hook, assets')
            .eq('id', post.content_id)
            .eq('workspace_id', this.workspaceId)
            .single(),
          this.supabase
            .from('account')
            .select('id, platform, handle, zernio_account_id')
            .eq('id', post.account_id)
            .eq('workspace_id', this.workspaceId)
            .single(),
        ]);
        if (!content || !account) throw new Error('Content/account vanished');

        const assets = content.assets as { final_edit_url?: string } | null;
        const videoUrl = assets?.final_edit_url;
        if (!videoUrl) throw new Error('Content has no final_edit_url asset');

        const platformAccountId = account.zernio_account_id ?? account.handle;
        const rawCaption = post.caption_variant ?? content.caption ?? '';
        const hashtags = (post.hashtags_variant ?? content.hashtags) as string[];

        // First-comment trick: on IG/TT, hashtags in 1st comment perform better
        // than inline in caption. Extract + post separately.
        const { clean_caption, first_comment } = extractFirstComment(
          rawCaption,
          hashtags,
          account.platform as Platform,
        );

        // Publish
        const publishResult = await provider.publish({
          platform_account_id: platformAccountId,
          platform: account.platform as Platform,
          video_url: videoUrl,
          caption: clean_caption,
          hashtags,
          first_comment,
        });

        // Update row with provider id + status
        const isPublished = publishResult.status === 'published';
        await this.supabase
          .from('post')
          .update({
            platform_post_id: publishResult.provider_post_id,
            platform_post_url: publishResult.platform_post_url,
            status: publishResult.status,
            published_at: isPublished ? new Date().toISOString() : null,
            error_log: null, // clear on success
          })
          .eq('id', post.id);

        if (isPublished) {
          result.published++;
          // Fire webhook event (non-blocking)
          void fireEvent(this.supabase, this.workspaceId, 'post.published', {
            post_id: post.id,
            content_id: post.content_id,
            account_id: post.account_id,
            platform: account.platform,
            platform_post_id: publishResult.provider_post_id,
            platform_post_url: publishResult.platform_post_url,
            posted_at: new Date().toISOString(),
          });
        }
        result.details.push({ post_id: post.id, status: publishResult.status });
      } catch (err) {
        result.failed++;
        const msg = (err as Error).message;
        const newRetries = currentRetries + 1;
        const isDeadLetter = newRetries >= MAX_RETRIES;
        const nextBackoffIdx = Math.min(newRetries, BACKOFF_SCHEDULE_MS.length - 1);
        const nextRetryMs = BACKOFF_SCHEDULE_MS[nextBackoffIdx]!;
        const errorLog = {
          error: msg,
          last_attempt_at: new Date().toISOString(),
          next_retry_in_ms: isDeadLetter ? null : nextRetryMs,
          attempt_history: [
            // We keep only last 5 attempts to bound log size
            ...((((post as { error_log?: { attempt_history?: unknown[] } }).error_log
              ?.attempt_history) ?? []) as unknown[]).slice(-4),
            {
              attempt: newRetries,
              error: msg.slice(0, 200),
              at: new Date().toISOString(),
            },
          ],
          dead_letter: isDeadLetter,
        };
        await this.supabase
          .from('post')
          .update({
            status: 'failed',
            error_log: errorLog,
            retries: newRetries,
          })
          .eq('id', post.id);
        result.details.push({
          post_id: post.id,
          status: 'failed',
          error: `${msg}${isDeadLetter ? ' [DEAD LETTER]' : ` (retry ${newRetries}/${MAX_RETRIES} in ${Math.round(nextRetryMs / 1000)}s)`}`,
        });
        // Fire dead-letter webhook
        if (isDeadLetter) {
          void fireEvent(this.supabase, this.workspaceId, 'post.dead_letter', {
            post_id: post.id,
            content_id: post.content_id,
            account_id: post.account_id,
            error: msg,
            attempts: newRetries,
          });
        }
      }
    }
    return result;
  }

  /** List dead-letter posts (failed + retries maxed out) — needs human review. */
  async listDeadLetter(limit = 20) {
    const { data, error } = await this.supabase
      .from('post')
      .select('id, content_id, account_id, scheduled_at, retries, error_log, updated_at')
      .eq('workspace_id', this.workspaceId)
      .eq('status', 'failed')
      .gte('retries', 4)
      .order('updated_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(`Failed to query dead-letter: ${error.message}`);
    return data ?? [];
  }

  /** Reset a dead-letter post: zero retries, status=scheduled, scheduled_at=now. */
  async revivePost(post_id: string) {
    await this.supabase
      .from('post')
      .update({
        status: 'scheduled',
        retries: 0,
        error_log: null,
        scheduled_at: new Date().toISOString(),
      })
      .eq('id', post_id)
      .eq('workspace_id', this.workspaceId);
  }

  /** Cancel a scheduled post (only if status='scheduled'). */
  async cancel(post_id: string): Promise<void> {
    const provider = getPostingProvider();
    const { data: post } = await this.supabase
      .from('post')
      .select('id, status, platform_post_id')
      .eq('id', post_id)
      .eq('workspace_id', this.workspaceId)
      .single();
    if (!post) throw new Error(`Post ${post_id} not found`);
    if (post.status !== 'scheduled') {
      throw new Error(`Post ${post_id} is ${post.status}, cannot cancel`);
    }
    if (post.platform_post_id) {
      try {
        await provider.cancel(post.platform_post_id);
      } catch {
        // best-effort
      }
    }
    await this.supabase
      .from('post')
      .update({ status: 'retracted' as PostStatus })
      .eq('id', post_id);
  }
}
