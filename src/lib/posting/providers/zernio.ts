import type {
  Platform,
  PostStatus,
  PostingProviderInterface,
  PublishRequest,
  PublishResult,
} from '../types.ts';
import { requireEnv } from '../../env.ts';

/**
 * Zernio API wrapper.
 *
 * Endpoint base assumed (verify against docs once you have the key):
 *   https://api.zernio.com/v1
 *
 * Auth: Bearer token in `Authorization` header.
 *
 * Endpoints used (educated guess from Zernio public materials, May 2026):
 *   GET  /accounts                       → list connected social accounts
 *   POST /posts                          → create post (schedule or immediate)
 *   GET  /posts/{id}                     → poll status
 *   DELETE /posts/{id}                   → cancel scheduled
 *
 * If the real Zernio API differs slightly, this wrapper is the single place
 * to adjust: edit `publish()`/`getStatus()`/`cancel()` request bodies + paths.
 */

const DEFAULT_BASE = 'https://api.zernio.com/v1';

interface ZernioPostBody {
  account_id: string;
  platforms?: Platform[]; // some setups: multi-target from one call
  media: { type: 'video' | 'image'; url: string }[];
  caption: string;
  hashtags?: string[];
  scheduled_at?: string; // ISO; omit for immediate
  first_comment?: string;
}

interface ZernioPostResponse {
  id: string;
  status: string; // zernio statuses: queued | publishing | published | failed
  platform_url?: string;
  error?: string;
}

const ZERNIO_TO_INTERNAL: Record<string, PostStatus> = {
  queued: 'scheduled',
  scheduled: 'scheduled',
  publishing: 'publishing',
  published: 'published',
  failed: 'failed',
  cancelled: 'retracted',
};

export class ZernioProvider implements PostingProviderInterface {
  readonly name = 'zernio' as const;
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl?: string) {
    this.apiKey = requireEnv('ZERNIO_API_KEY');
    this.baseUrl = baseUrl ?? DEFAULT_BASE;
  }

  async isReady(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/accounts`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async publish(req: PublishRequest): Promise<PublishResult> {
    const body: ZernioPostBody = {
      account_id: req.platform_account_id,
      platforms: [req.platform],
      media: [{ type: 'video', url: req.video_url }],
      caption: req.caption,
      hashtags: req.hashtags,
      scheduled_at: req.scheduled_at,
      first_comment: req.first_comment,
    };
    const res = await this.request<ZernioPostResponse>('POST', '/posts', body);
    return this.map(res);
  }

  async getStatus(provider_post_id: string): Promise<PublishResult> {
    const res = await this.request<ZernioPostResponse>(
      'GET',
      `/posts/${encodeURIComponent(provider_post_id)}`,
    );
    return this.map(res);
  }

  async cancel(provider_post_id: string): Promise<void> {
    await this.request<unknown>(
      'DELETE',
      `/posts/${encodeURIComponent(provider_post_id)}`,
    );
  }

  private map(r: ZernioPostResponse): PublishResult {
    return {
      provider_post_id: r.id,
      platform_post_url: r.platform_url ?? null,
      status: ZERNIO_TO_INTERNAL[r.status] ?? 'failed',
    };
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const init: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    };
    if (body !== undefined) init.body = JSON.stringify(body);
    const res = await fetch(`${this.baseUrl}${path}`, init);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Zernio ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
    }
    return (await res.json()) as T;
  }
}
