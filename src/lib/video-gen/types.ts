/**
 * Video AI generation types (FAL.AI Kling / Veo / etc.)
 */

export type AspectRatio = '9:16' | '16:9' | '1:1';

export interface VideoGenRequest {
  /** Text prompt describing the desired video. */
  prompt: string;
  /** Optional negative prompt — what to avoid. */
  negative_prompt?: string;
  /** Optional reference image URL (for image-to-video models). */
  reference_image_url?: string;
  /** Duration in seconds. Kling supports 5s or 10s. */
  duration_s: 5 | 10;
  /** Aspect ratio. */
  aspect_ratio: AspectRatio;
  /** Model selector — provider-specific string. Default: kling-v2.5-turbo. */
  model?: string;
}

export interface VideoGenResponse {
  /** Public URL of the generated video (FAL hosts for ~24h). */
  video_url: string;
  /** Optional local cached path (after download). */
  local_path?: string;
  provider: string;
  model: string;
  duration_s: number;
  cost_eur: number;
  generation_ms: number;
}

export type VideoGenProviderName = 'fal' | 'replicate' | 'mock';
