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
