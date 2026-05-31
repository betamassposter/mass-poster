/**
 * Posting integration types (Zernio primary, Browser-Use fallback).
 */

export type Platform =
  | 'instagram'
  | 'tiktok'
  | 'youtube_shorts'
  | 'x'
  | 'linkedin'
  | 'facebook';

export type PostStatus =
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'retracted';

export type PostingProvider = 'zernio' | 'browser_use' | 'manual' | 'mock';

// ─────────────────────────────────────────────────────────────
// Provider request/response shapes
// ─────────────────────────────────────────────────────────────

export interface PublishRequest {
  /** Platform-specific account ID (Zernio's internal handle). */
  platform_account_id: string;
  platform: Platform;
  /** Public video URL (Supabase Storage or FAL hosted). */
  video_url: string;
  caption: string;
  /** Optional hashtag array; some platforms allow inline in caption. */
  hashtags?: string[];
  /** ISO timestamp. If null/now → publish immediately. */
  scheduled_at?: string;
  /** Optional first comment (IG/TT trick to keep hashtags out of caption). */
  first_comment?: string;
  /**
   * Dry-run mode. Provider validates the request shape but does NOT make any
   * network call to the platform. Returns a fake provider_post_id prefixed
   * `dry-run-…`. Use this to rehearse the full scheduler pipeline before any
   * real account is at risk.
   */
  dry_run?: boolean;
  /**
   * Idempotency key. If the provider has already seen this key, it returns
   * the previous result instead of re-publishing. Recommended on every call
   * from the scheduler (use `post.id` as the key).
   */
  idempotency_key?: string;
}

export interface PublishResult {
  /** Provider-side post id (Zernio job id or platform id when posted). */
  provider_post_id: string;
  /** Final platform post URL once published. May be null at schedule-time. */
  platform_post_url: string | null;
  status: PostStatus;
}

export interface PostingProviderInterface {
  readonly name: PostingProvider;
  /** Health check. */
  isReady(): Promise<boolean>;
  /** Publish or schedule a post. */
  publish(req: PublishRequest): Promise<PublishResult>;
  /** Poll status of a posted item. */
  getStatus(provider_post_id: string): Promise<PublishResult>;
  /** Cancel a scheduled (not yet published) post. */
  cancel(provider_post_id: string): Promise<void>;
}

// ─────────────────────────────────────────────────────────────
// Scheduler types
// ─────────────────────────────────────────────────────────────

export interface ScheduleRequest {
  content_id: string;
  account_id: string;
  scheduled_at: Date;
  /** Per-account variant of caption (anti-duplicate across accounts). */
  caption_variant?: string;
  /** Per-account variant of hashtags. */
  hashtags_variant?: string[];
  /**
   * Client-generated UUID. If a post row already exists with this key, the
   * scheduler returns it instead of inserting a duplicate. Critical for any
   * batch scheduler that may retry on transient DB errors.
   */
  idempotency_key?: string;
}

export interface TickOptions {
  /**
   * When true, run the full tick flow but pass dry_run=true to each provider
   * publish() call. Posts get a fake provider_post_id `dry-run-…` so the row
   * is distinguishable from a real publish. Use to rehearse the scheduler
   * pipeline against real DB state without any platform-side side effect.
   */
  dry_run?: boolean;
  /** Override the upper bound for "now" (testing). */
  now?: Date;
}

export interface TickResult {
  processed: number;
  published: number;
  failed: number;
  details: Array<{
    post_id: string;
    status: PostStatus;
    error?: string;
  }>;
}
