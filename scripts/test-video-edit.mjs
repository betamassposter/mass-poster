#!/usr/bin/env node
/**
 * Smoke test for the FFmpeg video editor.
 *
 * Generates synthetic clip + audio (so works without external assets), then
 * runs the full editor pipeline: concat → text overlays → audio mix → export.
 *
 * Output: tmp/test-reel.mp4 (9:16, ~10s)
 *
 * Usage: pnpm video:test
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegStatic from 'ffmpeg-static';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const tmpDir = join(repoRoot, 'tmp');
mkdirSync(tmpDir, { recursive: true });

const { VideoEditor } = await import('../src/lib/video/editor.ts');
const { getPreset } = await import('../src/lib/video/presets.ts');

const FFMPEG = ffmpegStatic;

// ─────────────────────────────────────────────────────────────
// Step 1: generate synthetic test assets
// ─────────────────────────────────────────────────────────────

const clip1 = join(tmpDir, 'clip1.mp4');
const clip2 = join(tmpDir, 'clip2.mp4');
const voiceover = join(tmpDir, 'voiceover.aac');
const music = join(tmpDir, 'music.aac');

console.log('🎬 Generating test assets…');

function ff(args) {
  const r = spawnSync(FFMPEG, ['-y', ...args], { stdio: 'pipe' });
  if (r.status !== 0) {
    const stderr = (r.stderr ?? Buffer.alloc(0)).toString();
    throw new Error(
      `ffmpeg failed (status ${r.status}):\n${stderr.slice(-1500)}`,
    );
  }
}

// Clip 1: 5s, red gradient
ff([
  '-f', 'lavfi',
  '-i', 'color=c=0xE74C3C:s=1280x720:d=5:r=30',
  '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
  clip1,
]);

// Clip 2: 5s, dark blue gradient
ff([
  '-f', 'lavfi',
  '-i', 'color=c=0x2C3E50:s=1280x720:d=5:r=30',
  '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
  clip2,
]);

// Voiceover: 10s sine sweep (placeholder for ElevenLabs output)
ff([
  '-f', 'lavfi',
  '-i', 'sine=frequency=440:duration=10',
  '-c:a', 'aac', '-b:a', '128k',
  voiceover,
]);

// Music: 10s lower-pitched sine (placeholder for background music)
ff([
  '-f', 'lavfi',
  '-i', 'sine=frequency=220:duration=10',
  '-c:a', 'aac', '-b:a', '128k',
  music,
]);

console.log('✅ Test assets generated\n');

// ─────────────────────────────────────────────────────────────
// Step 2: run the editor
// ─────────────────────────────────────────────────────────────

const editor = new VideoEditor();
const output = join(tmpDir, 'test-reel.mp4');

console.log('🎞️  Editing reel…');
const result = await editor.edit({
  clips: [
    { source: clip1, duration_s: 5 },
    { source: clip2, duration_s: 5 },
  ],
  voiceover_path: voiceover,
  music_path: music,
  music_ducking_volume: 0.15,
  text_overlays: [
    {
      text: 'Stop wasting hours on Maps',
      start_s: 0,
      duration_s: 3,
      position: 'top',
      font_size: 60,
    },
    {
      text: 'Try Maplo free',
      start_s: 7,
      duration_s: 3,
      position: 'bottom',
      font_size: 56,
    },
  ],
  export: getPreset('instagram_reel'),
  output_path: output,
});

console.log(`✅ Edit complete in ${result.encoding_ms}ms`);
console.log(`   Output:    ${result.output_path}`);
console.log(`   Size:      ${(result.size_bytes / 1024).toFixed(1)} KB`);
console.log(`   Dimension: ${result.width}x${result.height}`);
console.log(`   Duration:  ${result.duration_s}s (max ${getPreset('instagram_reel').max_duration_s}s)`);
console.log(`\n🎬 Watch with: open "${result.output_path}"`);
