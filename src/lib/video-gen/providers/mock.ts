import { spawn } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import type { VideoGenRequest, VideoGenResponse } from '../types.ts';
import { type VideoGenProvider, VideoGenError } from './base.ts';

/**
 * Mock video gen — uses local FFmpeg to render a placeholder color clip.
 * Useful for dev without FAL key. Generates a 5s color clip at correct aspect ratio.
 */
export class MockVideoProvider implements VideoGenProvider {
  readonly name = 'mock';
  readonly default_model = 'mock-color-clip';

  async generate(req: VideoGenRequest, downloadTo?: string): Promise<VideoGenResponse> {
    if (!downloadTo) {
      throw new VideoGenError(
        'MockVideoProvider requires downloadTo (no hosted URL)',
        this.name,
        false,
      );
    }
    const started = Date.now();
    const { width, height } = this.resolution(req.aspect_ratio);
    const color = this.hashColor(req.prompt);

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(
        ffmpegStatic as string,
        [
          '-y',
          '-f', 'lavfi',
          '-i', `color=c=${color}:s=${width}x${height}:d=${req.duration_s}:r=30`,
          '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
          downloadTo,
        ],
        { stdio: ['ignore', 'ignore', 'pipe'] },
      );
      let stderr = '';
      proc.stderr.on('data', (c) => (stderr += c.toString()));
      proc.on('error', reject);
      proc.on('close', (code) =>
        code === 0
          ? resolve()
          : reject(
              new VideoGenError(
                `Mock ffmpeg failed (${code}): ${stderr.slice(-400)}`,
                this.name,
                false,
              ),
            ),
      );
    });

    return {
      video_url: `file://${downloadTo}`,
      local_path: downloadTo,
      provider: this.name,
      model: this.default_model,
      duration_s: req.duration_s,
      cost_eur: 0,
      generation_ms: Date.now() - started,
    };
  }

  private resolution(ar: VideoGenRequest['aspect_ratio']): { width: number; height: number } {
    if (ar === '9:16') return { width: 1080, height: 1920 };
    if (ar === '16:9') return { width: 1920, height: 1080 };
    return { width: 1080, height: 1080 };
  }

  /** Deterministic color per prompt → different mock clips look different. */
  private hashColor(s: string): string {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffffff;
    return '0x' + h.toString(16).padStart(6, '0');
  }
}
