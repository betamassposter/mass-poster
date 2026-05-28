import type {
  VoiceCloneRequest,
  VoiceCloneResponse,
  VoiceGenRequest,
  VoiceGenResponse,
} from '../types.ts';

export interface VoiceProvider {
  readonly name: string;
  readonly default_model: string;

  /** Text-to-speech. Writes audio to `outputPath` and returns metadata. */
  synthesize(req: VoiceGenRequest, outputPath: string): Promise<VoiceGenResponse>;

  /** Instant voice clone from sample(s). Returns voice_id usable in `synthesize`. */
  cloneVoice(req: VoiceCloneRequest): Promise<VoiceCloneResponse>;

  /** List voices available on this account (cloned + library). */
  listVoices(): Promise<Array<{ voice_id: string; name: string; category: string }>>;
}

export class VoiceError extends Error {
  readonly provider: string;
  readonly transient: boolean;
  readonly cause?: unknown;
  constructor(message: string, provider: string, transient: boolean, cause?: unknown) {
    super(message);
    this.name = 'VoiceError';
    this.provider = provider;
    this.transient = transient;
    this.cause = cause;
  }
}
