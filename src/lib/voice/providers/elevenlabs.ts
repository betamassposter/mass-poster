import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { createReadStream, createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type {
  VoiceCloneRequest,
  VoiceCloneResponse,
  VoiceGenRequest,
  VoiceGenResponse,
} from '../types.ts';
import { type VoiceProvider, VoiceError } from './base.ts';
import { env, requireEnv } from '../../env.ts';

/**
 * ElevenLabs voice provider.
 *
 * Models (May 2026):
 *  - eleven_v3:                  most expressive, slower, supports 70+ languages
 *  - eleven_turbo_v2_5:          fast, multilingue, low-latency, default for content gen
 *  - eleven_multilingual_v2:     balanced quality + language coverage
 *
 * Pricing (Creator/Pro tier, $/1k characters):
 *  - eleven_v3:                  ~$0.30/1k
 *  - eleven_turbo_v2_5:          ~$0.15/1k
 *
 * Free tier: 10k chars/month — enough for ~50 reel voiceovers a 200 chars each.
 */

const PRICING_PER_1K_CHARS_USD: Record<string, number> = {
  eleven_v3: 0.3,
  eleven_turbo_v2_5: 0.15,
  eleven_multilingual_v2: 0.2,
};
const USD_TO_EUR = 0.92;
const DEFAULT_MODEL = 'eleven_turbo_v2_5';

export class ElevenLabsProvider implements VoiceProvider {
  readonly name = 'elevenlabs';
  readonly default_model = DEFAULT_MODEL;
  private client: ElevenLabsClient;

  constructor() {
    requireEnv('ELEVENLABS_API_KEY');
    this.client = new ElevenLabsClient({ apiKey: env.ELEVENLABS_API_KEY });
  }

  async synthesize(req: VoiceGenRequest, outputPath: string): Promise<VoiceGenResponse> {
    const started = Date.now();
    const model = req.model_id ?? DEFAULT_MODEL;
    const characters = req.text.length;

    try {
      const audioStream = await this.client.textToSpeech.convert(req.voice_id, {
        text: req.text,
        modelId: model,
        outputFormat: req.output_format ?? 'mp3_44100_128',
        voiceSettings: {
          stability: req.stability ?? 0.5,
          similarityBoost: req.similarity_boost ?? 0.75,
          style: req.style ?? 0,
          useSpeakerBoost: true,
        },
      });

      // SDK returns a ReadableStream (web). Pipe to file.
      const nodeStream =
        audioStream instanceof Readable
          ? audioStream
          : Readable.fromWeb(audioStream as never);
      await pipeline(nodeStream, createWriteStream(outputPath));

      const cost_usd = (PRICING_PER_1K_CHARS_USD[model] ?? 0.2) * (characters / 1000);
      const cost_eur = Number((cost_usd * USD_TO_EUR).toFixed(6));

      return {
        local_path: outputPath,
        provider: this.name,
        model,
        voice_id: req.voice_id,
        characters,
        cost_eur,
        generation_ms: Date.now() - started,
      };
    } catch (err) {
      const msg = (err as Error).message ?? String(err);
      const transient = /timeout|503|502|504|rate.?limit|capacity/i.test(msg);
      throw new VoiceError(
        `ElevenLabs synthesize failed: ${msg}`,
        this.name,
        transient,
        err,
      );
    }
  }

  async cloneVoice(req: VoiceCloneRequest): Promise<VoiceCloneResponse> {
    try {
      const files = req.sample_paths.map((p) => {
        // SDK accepts Blob | File | ReadStream — Node ReadStream works.
        const stream = createReadStream(p);
        // Type assertion: SDK types want File-like, but at runtime accepts streams.
        return stream as unknown as File;
      });

      const created = await this.client.voices.ivc.create({
        name: req.name,
        description: req.description,
        files,
        labels: req.labels ? JSON.stringify(req.labels) : undefined,
      });

      const voice_id = created.voiceId;
      if (!voice_id) {
        throw new VoiceError('ElevenLabs clone returned no voice_id', this.name, true);
      }
      return { voice_id, name: req.name, provider: this.name };
    } catch (err) {
      if (err instanceof VoiceError) throw err;
      throw new VoiceError(
        `ElevenLabs clone failed: ${(err as Error).message ?? String(err)}`,
        this.name,
        true,
        err,
      );
    }
  }

  async listVoices() {
    try {
      const res = await this.client.voices.search({});
      const voices = res.voices ?? [];
      return voices.map((v) => ({
        voice_id: v.voiceId ?? '',
        name: v.name ?? '(unnamed)',
        category: v.category ?? 'unknown',
      }));
    } catch (err) {
      throw new VoiceError(
        `ElevenLabs listVoices failed: ${(err as Error).message ?? String(err)}`,
        this.name,
        true,
        err,
      );
    }
  }
}

// Pre-built voice IDs (ElevenLabs library, present in this account)
// Verified via `pnpm voice:list` 2026-05-28.
export const ELEVENLABS_DEFAULT_VOICES = {
  /** Liam — Energetic, Social Media Creator (default for reels). */
  liam: 'TX3LPaxmHKxFdv7VOQHJ',
  /** George — Warm, Captivating Storyteller. */
  george: 'JBFqnCBsd6RMkjVDRZzb',
  /** Charlie — Deep, Confident, Energetic. */
  charlie: 'IKne3meq5aSn9XLyUdCD',
  /** Sarah — Mature, Reassuring, Confident. */
  sarah: 'EXAVITQu4vr4xnSDxMaL',
  /** Laura — Enthusiast, Quirky Attitude. */
  laura: 'FGY2WhTYpPnrIDTdsKH5',
  /** River — Relaxed, Neutral, Informative. */
  river: 'SAz9YHcvj6GT2YYXdXww',
} as const;
