import { mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ContentPipeline } from './ai/pipeline.ts';
import { getTextProvider } from './ai/client.ts';
import { getVideoGenProvider } from './video-gen/client.ts';
import { getVoiceProvider, ELEVENLABS_DEFAULT_VOICES } from './voice/client.ts';
import { VideoEditor } from './video/editor.ts';
import { getPreset } from './video/presets.ts';
import type { Platform as ExportPlatform } from './video/types.ts';

/** Platform name used by the AI ideation pipeline (matches Claude prompts + DB enum). */
export type PipelinePlatform =
  | 'instagram'
  | 'tiktok'
  | 'youtube_shorts'
  | 'linkedin'
  | 'x';

/**
 * Reel pipeline end-to-end:
 *
 *   brand_slug + N
 *     ↓
 *   [1] Claude generates N ideas (hook + script + caption + hashtag + thumbnail concept)
 *     ↓                            ← persisted to `content` table (Blocco 5a)
 *   [2] For each idea (or top K):
 *       a) FAL video gen (using thumbnail_concept as prompt) → tmp/<id>.mp4
 *       b) ElevenLabs TTS (using script/caption as text) → tmp/<id>.mp3
 *       c) FFmpeg edit: video + voiceover + text overlay (hook) → tmp/<id>-final.mp4
 *     ↓
 *   [3] Update `content.assets.final_edit_url` (local path for now; Supabase Storage later)
 *
 * No video upload to Supabase Storage yet — local paths only. Storage upload comes
 * with Blocco 7 (posting) when we need a hosted URL for Zernio.
 */

export interface ReelPipelineOptions {
  brand_slug: string;
  /** How many ideas to generate AND fully render. */
  count: number;
  /** Target platform (used both for AI ideation style + export preset). */
  platform: PipelinePlatform;
  /** Voice ID for TTS — defaults to ElevenLabs "Brian" (friendly male). */
  voice_id?: string;
  /** Video duration per reel in seconds — must be supported by Kling (5 or 10). */
  video_duration_s?: 5 | 10;
  /** Output directory for intermediate + final files. */
  output_dir: string;
  /** Workspace id (multi-tenant). */
  workspace_id: string;
}

export interface ReelPipelineResult {
  brand_slug: string;
  reels: Array<{
    content_id: string;
    hook: string;
    final_path: string;
    video_url: string;
    voice_path: string;
    duration_s: number;
    cost_eur: number;
    encoding_ms: number;
  }>;
  total_cost_eur: number;
  total_duration_ms: number;
}

const PLATFORM_TO_VIDEO_AR: Record<PipelinePlatform, '9:16' | '16:9' | '1:1'> = {
  instagram: '9:16',
  tiktok: '9:16',
  youtube_shorts: '9:16',
  linkedin: '1:1',
  x: '16:9',
};

const PLATFORM_TO_PRESET_KEY: Record<PipelinePlatform, ExportPlatform> = {
  instagram: 'instagram_reel',
  tiktok: 'tiktok',
  youtube_shorts: 'youtube_shorts',
  linkedin: 'linkedin',
  x: 'x',
};

export async function runReelPipeline(
  supabase: SupabaseClient,
  opts: ReelPipelineOptions,
): Promise<ReelPipelineResult> {
  const started = Date.now();
  mkdirSync(opts.output_dir, { recursive: true });

  // ─── 1) Generate ideas via Claude ─────────────────────────────────────
  const textProvider = getTextProvider();
  const contentPipeline = new ContentPipeline(
    supabase,
    textProvider,
    opts.workspace_id,
  );

  console.log(`📝 [1/4] Generating ${opts.count} ideas (${textProvider.name})…`);
  const ideation = await contentPipeline.generateForBrand(opts.brand_slug, {
    count: opts.count,
    platform: opts.platform,
    persist: true,
  });
  console.log(
    `   ✓ ${ideation.batch.ideas.length} ideas · €${ideation.cost_eur.toFixed(4)} · cache ${ideation.cache_read_pct}% · ${ideation.duration_ms}ms`,
  );

  // ─── 2) For each idea → FAL video + ElevenLabs voice + FFmpeg edit ────
  const videoProvider = getVideoGenProvider();
  const voiceProvider = getVoiceProvider();
  const editor = new VideoEditor();

  const aspect = PLATFORM_TO_VIDEO_AR[opts.platform];
  const exportPreset = getPreset(PLATFORM_TO_PRESET_KEY[opts.platform]);
  const videoDur = opts.video_duration_s ?? 5;
  const voiceId = opts.voice_id ?? ELEVENLABS_DEFAULT_VOICES.liam;

  const reels: ReelPipelineResult['reels'] = [];

  for (let i = 0; i < ideation.batch.ideas.length; i++) {
    const idea = ideation.batch.ideas[i]!;
    const contentId = ideation.inserted_content_ids[i] ?? `idx-${i}`;
    const tag = contentId.slice(0, 8);

    console.log(`\n🎬 [Reel ${i + 1}/${ideation.batch.ideas.length}] ${idea.hook.slice(0, 60)}…`);

    // 2a) Video gen
    const videoPath = join(opts.output_dir, `${tag}-video.mp4`);
    console.log(`   [2a] FAL video (${videoProvider.name}, ${videoDur}s, ${aspect})…`);
    const videoPromise = videoProvider.generate(
      {
        prompt: this_buildVideoPrompt(idea.thumbnail_concept, idea.hook),
        duration_s: videoDur,
        aspect_ratio: aspect,
      },
      videoPath,
    );

    // 2b) Voice gen — runs in parallel with video gen (FAL is the bottleneck)
    const voicePath = join(opts.output_dir, `${tag}-voice.mp3`);
    const voiceText = pickVoiceText(idea.hook, idea.caption);
    console.log(`   [2b] Voice (${voiceProvider.name}, ${voiceText.length} chars)…`);
    const voicePromise = voiceProvider.synthesize(
      { text: voiceText, voice_id: voiceId },
      voicePath,
    );

    const [videoResult, voiceResult] = await Promise.all([videoPromise, voicePromise]);
    console.log(
      `      ✓ video: €${videoResult.cost_eur.toFixed(4)} · ${videoResult.generation_ms}ms`,
    );
    console.log(
      `      ✓ voice: €${voiceResult.cost_eur.toFixed(4)} · ${voiceResult.generation_ms}ms`,
    );

    // 2c) FFmpeg edit
    const finalPath = join(opts.output_dir, `${tag}-final.mp4`);
    console.log(`   [2c] Editing…`);
    const editResult = await editor.edit({
      clips: [{ source: videoPath, duration_s: videoDur }],
      voiceover_path: voicePath,
      text_overlays: [
        {
          text: idea.hook.slice(0, 80),
          start_s: 0,
          duration_s: Math.min(3, videoDur),
          position: 'top',
          font_size: 56,
        },
        {
          text: idea.cta_used,
          start_s: Math.max(0, videoDur - 2.5),
          duration_s: 2.5,
          position: 'bottom',
          font_size: 52,
        },
      ],
      export: exportPreset,
      output_path: finalPath,
    });
    const stats = statSync(finalPath);
    console.log(
      `      ✓ final: ${(stats.size / 1024).toFixed(1)} KB · ${editResult.encoding_ms}ms`,
    );

    // 2d) Update content row
    const reelCost =
      ideation.cost_eur / ideation.batch.ideas.length +
      videoResult.cost_eur +
      voiceResult.cost_eur;
    await supabase
      .from('content')
      .update({
        assets: {
          thumbnail_concept: idea.thumbnail_concept,
          raw_video_path: videoPath,
          voice_path: voicePath,
          final_edit_url: finalPath,
          video_provider_url: videoResult.video_url,
        },
        cost_eur: Number(reelCost.toFixed(6)),
      })
      .eq('id', contentId)
      .eq('workspace_id', opts.workspace_id);

    reels.push({
      content_id: contentId,
      hook: idea.hook,
      final_path: finalPath,
      video_url: videoResult.video_url,
      voice_path: voicePath,
      duration_s: editResult.duration_s,
      cost_eur: Number(reelCost.toFixed(6)),
      encoding_ms: editResult.encoding_ms,
    });
  }

  const total_cost_eur = reels.reduce((sum, r) => sum + r.cost_eur, 0);

  return {
    brand_slug: opts.brand_slug,
    reels,
    total_cost_eur: Number(total_cost_eur.toFixed(6)),
    total_duration_ms: Date.now() - started,
  };
}

/**
 * Build the FAL video prompt from the thumbnail concept + hook.
 * Kling responds well to: subject + action + style + camera direction + mood.
 */
function this_buildVideoPrompt(thumbnail_concept: string, hook: string): string {
  return [
    thumbnail_concept,
    'Cinematic short-form vertical reel.',
    'High contrast, modern, fast cuts.',
    'Mood matches:',
    hook,
  ].join(' ');
}

/**
 * Pick the text to TTS. For short reels (5-10s), use hook + first line of caption,
 * capped at ~250 chars (~10s at 25 chars/sec).
 */
function pickVoiceText(hook: string, caption: string): string {
  const firstLine = caption.split('\n')[0] ?? caption;
  const combined = `${hook}. ${firstLine}`;
  return combined.length > 250 ? combined.slice(0, 247) + '…' : combined;
}
