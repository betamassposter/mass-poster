import type { SupabaseClient } from '@supabase/supabase-js';
import { getPostingProvider } from './client.ts';
import type {
  PostStatus,
  Platform,
  PostingProvider,
  ScheduleRequest,
  TickResult,
} from './types.ts';

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
   * Process all due posts (scheduled_at <= now, status='scheduled').
   * Each is sent to the posting provider; status updated accordingly.
   */
  async tick(limit = 50): Promise<TickResult> {
    const provider = getPostingProvider();
    const nowIso = new Date().toISOString();

    const { data: due, error } = await this.supabase
      .from('post')
      .select('id, content_id, account_id, caption_variant, hashtags_variant')
      .eq('workspace_id', this.workspaceId)
      .eq('status', 'scheduled')
      .lte('scheduled_at', nowIso)
      .order('scheduled_at', { ascending: true })
      .limit(limit);
    if (error) throw new Error(`Failed to query due posts: ${error.message}`);

    const result: TickResult = {
      processed: due?.length ?? 0,
      published: 0,
      failed: 0,
      details: [],
    };

    for (const post of due ?? []) {
      try {
        // Mark publishing first (avoid double-pickup on concurrent ticks)
        const { error: lockErr } = await this.supabase
          .from('post')
          .update({ status: 'publishing' })
          .eq('id', post.id)
          .eq('workspace_id', this.workspaceId)
          .eq('status', 'scheduled'); // optimistic lock
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
        const caption = post.caption_variant ?? content.caption ?? '';
        const hashtags = (post.hashtags_variant ?? content.hashtags) as string[];

        // Publish
        const publishResult = await provider.publish({
          platform_account_id: platformAccountId,
          platform: account.platform as Platform,
          video_url: videoUrl,
          caption,
          hashtags,
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
          })
          .eq('id', post.id);

        if (isPublished) result.published++;
        result.details.push({ post_id: post.id, status: publishResult.status });
      } catch (err) {
        result.failed++;
        const msg = (err as Error).message;
        await this.supabase
          .from('post')
          .update({
            status: 'failed',
            error_log: { error: msg, occurred_at: new Date().toISOString() },
            retries: 1, // TODO: increment via RPC for exact-once
          })
          .eq('id', post.id);
        result.details.push({ post_id: post.id, status: 'failed', error: msg });
      }
    }
    return result;
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
