/**
 * Video editor types.
 *
 * Architettura: input = "ingredienti" + spec di montaggio,
 * output = file mp4 esportato per la piattaforma target.
 */

export type Platform = 'instagram_reel' | 'tiktok' | 'youtube_shorts' | 'linkedin' | 'x';

export interface ExportPreset {
  platform: Platform;
  width: number;
  height: number;
  fps: number;
  max_duration_s: number;
  crf: number;             // 18-23 quality (lower=better)
  preset: 'ultrafast' | 'fast' | 'medium' | 'slow';
  audio_bitrate: string;   // "128k"
}

export interface ClipSpec {
  /** Local file path or URL (will be downloaded by FFmpeg). */
  source: string;
  /** Optional trim — seconds from start of source clip. */
  start_s?: number;
  /** Optional trim — duration in seconds from start_s. */
  duration_s?: number;
}

export interface TextOverlay {
  text: string;
  /** When (in seconds, from final timeline start) the text appears. */
  start_s: number;
  /** Duration on screen, in seconds. */
  duration_s: number;
  /** Position: 'top' = upper third (hook), 'center', 'bottom' = lower third (CTA). */
  position: 'top' | 'center' | 'bottom';
  /** Font size px (default 64 for hook, 48 for CTA). */
  font_size?: number;
  /** Hex color (default white "0xFFFFFF"). */
  font_color?: string;
  /** Box background color hex with alpha "0x00000080" (default semi-transparent black). */
  box_color?: string;
}

export interface VideoEditRequest {
  /** Clips concat-ed in order (single clip = no concat). */
  clips: ClipSpec[];
  /** Voiceover track played over the concat'd clips (optional, lipsynced later in 5c). */
  voiceover_path?: string;
  /** Background music track (auto-ducked under voiceover, optional). */
  music_path?: string;
  /** Volume gain for music when voiceover is present (default 0.2 = -14dB). */
  music_ducking_volume?: number;
  /** Text overlays (hooks, CTA, captions). */
  text_overlays?: TextOverlay[];
  /** Export preset for target platform. */
  export: ExportPreset;
  /** Output file absolute path. */
  output_path: string;
}

export interface EditResult {
  output_path: string;
  duration_s: number;
  size_bytes: number;
  width: number;
  height: number;
  encoding_ms: number;
  ffmpeg_command: string;
}
