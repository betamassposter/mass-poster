/**
 * Voice synthesis types (ElevenLabs primary).
 */

export interface VoiceGenRequest {
  /** Text to synthesize. Max ~5000 chars per call. */
  text: string;
  /** ElevenLabs voice ID (cloned voice ID or pre-built voice ID). */
  voice_id: string;
  /** Model — default eleven_turbo_v2_5 (fast + multilingue). */
  model_id?: string;
  /** Stability 0-1 (default 0.5). Higher = more consistent, less expressive. */
  stability?: number;
  /** Similarity boost 0-1 (default 0.75). Higher = closer to voice sample. */
  similarity_boost?: number;
  /** Style 0-1 (default 0). For v3 expressive control. */
  style?: number;
  /** Output format. mp3_44100_128 default. */
  output_format?: 'mp3_44100_128' | 'mp3_44100_192' | 'pcm_44100';
}

export interface VoiceGenResponse {
  local_path: string;
  provider: string;
  model: string;
  voice_id: string;
  characters: number;
  cost_eur: number;
  generation_ms: number;
}

export interface VoiceCloneRequest {
  /** Display name for the cloned voice. */
  name: string;
  /** 1+ audio file paths (mp3/wav, total 1+ minute of clean speech recommended). */
  sample_paths: string[];
  /** Description (e.g. brand voice / language / use case). */
  description?: string;
  /** Labels (optional ElevenLabs metadata). */
  labels?: Record<string, string>;
}

export interface VoiceCloneResponse {
  voice_id: string;
  name: string;
  provider: string;
}
