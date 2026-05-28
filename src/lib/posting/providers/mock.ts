import type {
  PostStatus,
  PostingProviderInterface,
  PublishRequest,
  PublishResult,
} from '../types.ts';

/**
 * Mock posting provider — simulates Zernio without making network calls.
 * Useful before Zernio key is configured or for unit tests.
 *
 * Behavior:
 *  - publish() → returns `published` if scheduled_at is in the past/now,
 *    else `scheduled`. Generates a fake platform URL.
 *  - getStatus() → keeps in-memory map of mock posts, returns last state.
 *  - cancel() → removes from map.
 */
export class MockPostingProvider implements PostingProviderInterface {
  readonly name = 'mock' as const;
  private posts = new Map<string, PublishResult & { req: PublishRequest }>();
  private counter = 0;

  async isReady(): Promise<boolean> {
    return true;
  }

  async publish(req: PublishRequest): Promise<PublishResult> {
    const id = `mock-post-${(++this.counter).toString().padStart(4, '0')}`;
    const shouldPublishNow =
      !req.scheduled_at || new Date(req.scheduled_at).getTime() <= Date.now();
    const status: PostStatus = shouldPublishNow ? 'published' : 'scheduled';
    const result: PublishResult = {
      provider_post_id: id,
      platform_post_url: shouldPublishNow
        ? `https://${req.platform}.example.com/p/${id}`
        : null,
      status,
    };
    this.posts.set(id, { ...result, req });
    return result;
  }

  async getStatus(provider_post_id: string): Promise<PublishResult> {
    const post = this.posts.get(provider_post_id);
    if (!post) {
      return {
        provider_post_id,
        platform_post_url: null,
        status: 'failed',
      };
    }
    return {
      provider_post_id: post.provider_post_id,
      platform_post_url: post.platform_post_url,
      status: post.status,
    };
  }

  async cancel(provider_post_id: string): Promise<void> {
    this.posts.delete(provider_post_id);
  }
}
