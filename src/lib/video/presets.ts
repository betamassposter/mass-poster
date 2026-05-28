import type { ExportPreset, Platform } from './types.ts';

/**
 * Platform-optimized export presets.
 * Sources:
 *  - skill `video-processing-editing` references/export-optimization
 *  - Instagram/TikTok/YouTube Shorts official specs (May 2026)
 */

export const PRESETS: Record<Platform, ExportPreset> = {
  instagram_reel: {
    platform: 'instagram_reel',
    width: 1080,
    height: 1920,
    fps: 30,
    max_duration_s: 90,
    crf: 22,
    preset: 'medium',
    audio_bitrate: '128k',
  },
  tiktok: {
    platform: 'tiktok',
    width: 1080,
    height: 1920,
    fps: 30,
    max_duration_s: 180,
    crf: 22,
    preset: 'medium',
    audio_bitrate: '128k',
  },
  youtube_shorts: {
    platform: 'youtube_shorts',
    width: 1080,
    height: 1920,
    fps: 30,
    max_duration_s: 60,
    crf: 20, // YT pays well for slightly better quality
    preset: 'medium',
    audio_bitrate: '192k',
  },
  linkedin: {
    platform: 'linkedin',
    width: 1080,
    height: 1080, // LinkedIn prefers 1:1 for feed
    fps: 30,
    max_duration_s: 600,
    crf: 22,
    preset: 'medium',
    audio_bitrate: '128k',
  },
  x: {
    platform: 'x',
    width: 1280,
    height: 720,
    fps: 30,
    max_duration_s: 140,
    crf: 23,
    preset: 'medium',
    audio_bitrate: '128k',
  },
};

export function getPreset(platform: Platform): ExportPreset {
  return PRESETS[platform];
}
