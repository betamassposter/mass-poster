import { spawn } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import type {
  VoiceCloneRequest,
  VoiceCloneResponse,
  VoiceGenRequest,
  VoiceGenResponse,
} from '../types.ts';
import { type VoiceProvider, VoiceError } from './base.ts';

/**
 * Mock voice provider — generates a silent (or tone) audio track via FFmpeg.
 * For dev without ElevenLabs key. Duration computed from text length (~140 chars/sec speech).
 */
export class MockVoiceProvider implements VoiceProvider {
  readonly name = 'mock';
  readonly default_model = 'mock-tone';

  async synthesize(req: VoiceGenRequest, outputPath: string): Promise<VoiceGenResponse> {
    const started = Date.now();
    // Estimate duration: ~140 chars/sec for natural speech (~3 words/sec)
    const duration_s = Math.max(2, Math.min(60, req.text.length / 18));

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(
        ffmpegStatic as string,
        [
          '-y',
          '-f', 'lavfi',
          '-i', `sine=frequency=440:duration=${duration_s}`,
          '-c:a', 'libmp3lame', '-b:a', '128k',
          outputPath,
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
              new VoiceError(
                `Mock TTS ffmpeg failed (${code}): ${stderr.slice(-400)}`,
                this.name,
                false,
              ),
            ),
      );
    });

    return {
      local_path: outputPath,
      provider: this.name,
      model: this.default_model,
      voice_id: req.voice_id,
      characters: req.text.length,
      cost_eur: 0,
      generation_ms: Date.now() - started,
    };
  }

  async cloneVoice(req: VoiceCloneRequest): Promise<VoiceCloneResponse> {
    return {
      voice_id: `mock-voice-${req.name.toLowerCase().replace(/\s+/g, '-')}`,
      name: req.name,
      provider: this.name,
    };
  }

  async listVoices() {
    return [
      { voice_id: 'mock-default', name: 'Mock Default', category: 'mock' },
    ];
  }
}
