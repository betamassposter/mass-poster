import type { VideoGenRequest, VideoGenResponse } from '../types.ts';

export interface VideoGenProvider {
  readonly name: string;
  readonly default_model: string;

  /** Generate a video. Returns hosted URL + cost. Downloads locally if `downloadTo` set. */
  generate(req: VideoGenRequest, downloadTo?: string): Promise<VideoGenResponse>;
}

export class VideoGenError extends Error {
  readonly provider: string;
  readonly transient: boolean;
  readonly cause?: unknown;
  constructor(message: string, provider: string, transient: boolean, cause?: unknown) {
    super(message);
    this.name = 'VideoGenError';
    this.provider = provider;
    this.transient = transient;
    this.cause = cause;
  }
}
