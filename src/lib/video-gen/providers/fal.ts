import { fal } from '@fal-ai/client';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { VideoGenRequest, VideoGenResponse } from '../types.ts';
import { type VideoGenProvider, VideoGenError } from './base.ts';
import { env, requireEnv } from '../../env.ts';

/**
 * FAL.AI video generation provider.
 *
 * Default model: kling-video/v2.5-turbo/pro/text-to-video
 * Pricing reference (FAL May 2026):
 *   - Kling 2.5 Turbo Pro: ~$0.21/5s, ~$0.35/10s (1080p)
 *   - Kling 2.1 Standard image-to-video: ~$0.50/5s
 *   - Veo 3: ~$0.50-1.50/5s (higher quality, slower)
 *
 * We use Kling 2.5 Turbo by default — best price/quality for short reels.
 */

const PRICING_PER_SECOND_USD: Record<string, number> = {
  'fal-ai/kling-video/v2.5-turbo/pro/text-to-video': 0.042, // ~$0.21/5s
  'fal-ai/kling-video/v2.1/standard/image-to-video': 0.1,    // ~$0.50/5s
  'fal-ai/veo3/text-to-video': 0.25,                          // ~$1.25/5s
};
const USD_TO_EUR = 0.92;
const DEFAULT_MODEL = 'fal-ai/kling-video/v2.5-turbo/pro/text-to-video';

interface FalVideoOutput {
  video: { url: string };
}

export class FalVideoProvider implements VideoGenProvider {
  readonly name = 'fal';
  readonly default_model = DEFAULT_MODEL;

  constructor() {
    requireEnv('FAL_KEY');
    fal.config({ credentials: env.FAL_KEY });
  }

  async generate(req: VideoGenRequest, downloadTo?: string): Promise<VideoGenResponse> {
    const started = Date.now();
    const model = req.model ?? DEFAULT_MODEL;

    // Map request to FAL endpoint input shape.
    // Kling expects: prompt, duration (string "5" or "10"), aspect_ratio.
    const input: Record<string, unknown> = {
      prompt: req.prompt,
      duration: String(req.duration_s),
      aspect_ratio: req.aspect_ratio,
    };
    if (req.negative_prompt) input.negative_prompt = req.negative_prompt;
    if (req.reference_image_url) input.image_url = req.reference_image_url;

    try {
      const result = await fal.subscribe(model, {
        input,
        logs: false,
      });

      const data = result.data as FalVideoOutput;
      const video_url = data.video?.url;
      if (!video_url) {
        throw new VideoGenError('FAL returned no video URL', this.name, true);
      }

      let local_path: string | undefined;
      if (downloadTo) {
        await this.download(video_url, downloadTo);
        local_path = downloadTo;
      }

      const generation_ms = Date.now() - started;
      const cost_usd = (PRICING_PER_SECOND_USD[model] ?? 0.05) * req.duration_s;
      const cost_eur = Number((cost_usd * USD_TO_EUR).toFixed(6));

      return {
        video_url,
        local_path,
        provider: this.name,
        model,
        duration_s: req.duration_s,
        cost_eur,
        generation_ms,
      };
    } catch (err) {
      if (err instanceof VideoGenError) throw err;
      const msg = (err as Error).message ?? String(err);
      // FAL errors are usually transient (queue full, model warming up)
      const transient =
        /timeout|503|502|504|rate|queue|capacity|overloaded/i.test(msg);
      throw new VideoGenError(`FAL generate failed: ${msg}`, this.name, transient, err);
    }
  }

  private async download(url: string, destPath: string): Promise<void> {
    const res = await fetch(url);
    if (!res.ok || !res.body) {
      throw new VideoGenError(
        `Failed to download video: HTTP ${res.status}`,
        this.name,
        true,
      );
    }
    await pipeline(Readable.fromWeb(res.body as never), createWriteStream(destPath));
  }
}
