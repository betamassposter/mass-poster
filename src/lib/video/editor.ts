import ffmpegStatic from 'ffmpeg-static';
import { spawn } from 'node:child_process';
import { mkdtempSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  EditResult,
  ExportPreset,
  TextOverlay,
  VideoEditRequest,
} from './types.ts';

if (!ffmpegStatic) {
  throw new Error(
    'ffmpeg-static binary not found. Run `cd node_modules/ffmpeg-static && node install.js`.',
  );
}
const FFMPEG_BIN: string = ffmpegStatic;

/**
 * Headless FFmpeg video editor.
 *
 * Single-pass approach: composes the entire timeline (clips + voiceover + music + text overlays)
 * in ONE ffmpeg invocation via filter_complex. No temp files, no cumulative re-encoding loss.
 *
 * Outputs MP4 H.264 + AAC, +faststart for progressive web playback.
 */
export class VideoEditor {
  async edit(req: VideoEditRequest): Promise<EditResult> {
    const started = Date.now();
    // Tmp dir for overlay textfiles; cleaned in finally.
    const overlayDir = mkdtempSync(join(tmpdir(), 'mp-overlay-'));
    try {
      // Write each overlay's text to a file (avoids all FFmpeg drawtext escape issues).
      const overlayFiles: string[] = [];
      if (req.text_overlays) {
        for (let i = 0; i < req.text_overlays.length; i++) {
          const fp = join(overlayDir, `overlay-${i}.txt`);
          writeFileSync(fp, req.text_overlays[i]!.text, 'utf-8');
          overlayFiles.push(fp);
        }
      }

      const args = this.buildFfmpegArgs(req, overlayFiles);
      const ffmpeg_command = `ffmpeg ${args.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`;
      await this.runFfmpeg(args);
      const encoding_ms = Date.now() - started;
      const stats = statSync(req.output_path);

      return {
        output_path: req.output_path,
        duration_s: this.estimateDuration(req),
        size_bytes: stats.size,
        width: req.export.width,
        height: req.export.height,
        encoding_ms,
        ffmpeg_command,
      };
    } finally {
      rmSync(overlayDir, { recursive: true, force: true });
    }
  }

  private estimateDuration(req: VideoEditRequest): number {
    return req.clips.reduce((sum, c) => sum + (c.duration_s ?? 5), 0);
  }

  private buildFfmpegArgs(req: VideoEditRequest, overlayFiles: string[]): string[] {
    const args: string[] = ['-y']; // overwrite

    // 1. Inputs: each clip + voiceover + music (if present)
    const numClips = req.clips.length;
    for (const clip of req.clips) {
      if (clip.start_s !== undefined) {
        args.push('-ss', String(clip.start_s));
      }
      if (clip.duration_s !== undefined) {
        args.push('-t', String(clip.duration_s));
      }
      args.push('-i', clip.source);
    }
    const voiceoverInputIdx = req.voiceover_path ? numClips : null;
    if (req.voiceover_path) args.push('-i', req.voiceover_path);
    const musicInputIdx = req.music_path
      ? numClips + (req.voiceover_path ? 1 : 0)
      : null;
    if (req.music_path) args.push('-i', req.music_path);

    // 2. Filter complex
    const filters: string[] = [];

    // 2a. Scale + concat video clips → [v_concat]
    const scaledLabels: string[] = [];
    for (let i = 0; i < numClips; i++) {
      const label = `v${i}`;
      filters.push(
        `[${i}:v]scale=${req.export.width}:${req.export.height}:force_original_aspect_ratio=increase,` +
          `crop=${req.export.width}:${req.export.height},` +
          `setsar=1,fps=${req.export.fps}[${label}]`,
      );
      scaledLabels.push(`[${label}]`);
    }

    let videoChainLabel: string;
    if (numClips === 1) {
      videoChainLabel = scaledLabels[0]!;
    } else {
      filters.push(
        `${scaledLabels.join('')}concat=n=${numClips}:v=1:a=0[v_concat]`,
      );
      videoChainLabel = '[v_concat]';
    }

    // 2b. Apply text overlays (drawtext, chained — via textfile= for escape safety)
    if (req.text_overlays && req.text_overlays.length > 0) {
      let prev = videoChainLabel;
      req.text_overlays.forEach((overlay, idx) => {
        const out = `[v_text${idx}]`;
        const textFilePath = overlayFiles[idx]!;
        filters.push(
          `${prev}${this.drawtextFilter(overlay, req.export, textFilePath)}${out}`,
        );
        prev = out;
      });
      videoChainLabel = prev;
    }

    // 2c. Audio mix: voiceover (full) + music (ducked)
    let audioChainLabel: string | null = null;
    if (voiceoverInputIdx !== null && musicInputIdx !== null) {
      // Both present: duck music under voiceover
      const duckVol = req.music_ducking_volume ?? 0.2;
      filters.push(
        `[${voiceoverInputIdx}:a]aresample=44100,asetpts=PTS-STARTPTS[a_voice]`,
      );
      filters.push(
        `[${musicInputIdx}:a]aresample=44100,volume=${duckVol},asetpts=PTS-STARTPTS[a_music]`,
      );
      filters.push(
        `[a_voice][a_music]amix=inputs=2:duration=first:dropout_transition=2[a_out]`,
      );
      audioChainLabel = '[a_out]';
    } else if (voiceoverInputIdx !== null) {
      filters.push(`[${voiceoverInputIdx}:a]aresample=44100[a_out]`);
      audioChainLabel = '[a_out]';
    } else if (musicInputIdx !== null) {
      filters.push(`[${musicInputIdx}:a]aresample=44100[a_out]`);
      audioChainLabel = '[a_out]';
    }

    args.push('-filter_complex', filters.join(';'));

    // 3. Maps
    args.push('-map', videoChainLabel);
    if (audioChainLabel) {
      args.push('-map', audioChainLabel);
    }

    // 4. Encoding: H.264 + AAC, +faststart
    args.push(
      '-c:v', 'libx264',
      '-preset', req.export.preset,
      '-crf', String(req.export.crf),
      '-pix_fmt', 'yuv420p',
      '-r', String(req.export.fps),
      '-color_primaries', 'bt709',
      '-color_trc', 'bt709',
      '-colorspace', 'bt709',
    );

    if (audioChainLabel) {
      args.push('-c:a', 'aac', '-b:a', req.export.audio_bitrate, '-ar', '44100');
    } else {
      args.push('-an');
    }

    // Trim to platform max duration if too long
    args.push('-t', String(req.export.max_duration_s));
    args.push('-movflags', '+faststart');
    args.push(req.output_path);
    return args;
  }

  private drawtextFilter(
    overlay: TextOverlay,
    exp: ExportPreset,
    textFilePath: string,
  ): string {
    const fontSize = overlay.font_size ?? 64;
    const fontColor = overlay.font_color ?? '0xFFFFFF';
    const boxColor = overlay.box_color ?? '0x000000@0.5';

    // Y position: top = 15%, center = (h-th)/2, bottom = 80%
    const yExpr =
      overlay.position === 'top'
        ? `${Math.round(exp.height * 0.15)}`
        : overlay.position === 'bottom'
          ? `${Math.round(exp.height * 0.8)}`
          : '(h-text_h)/2';

    // Escape the textfile path for FFmpeg filter syntax (`:` is arg separator,
    // `\` needs doubling, single quote inside filter arg)
    const escapedPath = textFilePath
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/:/g, '\\:');

    return (
      `drawtext=textfile='${escapedPath}':fontsize=${fontSize}:fontcolor=${fontColor}:` +
      `x=(w-text_w)/2:y=${yExpr}:` +
      `box=1:boxcolor=${boxColor}:boxborderw=20:` +
      `enable='between(t,${overlay.start_s},${overlay.start_s + overlay.duration_s})'`
    );
  }

  private runFfmpeg(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(FFMPEG_BIN, args, { stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      proc.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      proc.on('error', reject);
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else
          reject(
            new Error(
              `ffmpeg exited with code ${code}\n--- stderr (last 1500) ---\n${stderr.slice(-1500)}`,
            ),
          );
      });
    });
  }
}
