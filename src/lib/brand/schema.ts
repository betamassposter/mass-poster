import { z } from 'zod';

/**
 * Brand config schema (Zod).
 *
 * Un brand è l'unità "creativa": definisce voice, personas, offer e
 * piattaforme target. La pipeline AI riceve un brand config in input
 * e produce contenuti coerenti con esso.
 *
 * Salvato in `brand.voice_config` (jsonb), `brand.target_personas` (jsonb),
 * `brand.default_platforms` (enum[]) — vedi migration 0003.
 */

// ─────────────────────────────────────────────────────────────
// Enums (mirror dei tipi Postgres)
// ─────────────────────────────────────────────────────────────

export const platformSchema = z.enum([
  'instagram',
  'tiktok',
  'youtube_shorts',
  'x',
  'linkedin',
  'facebook',
]);
export type Platform = z.infer<typeof platformSchema>;

export const brandStatusSchema = z.enum([
  'draft',
  'active',
  'paused',
  'archived',
]);
export type BrandStatus = z.infer<typeof brandStatusSchema>;

export const offerTypeSchema = z.enum([
  'saas',
  'ecommerce',
  'digital_product',
  'community',
  'other',
]);
export type OfferType = z.infer<typeof offerTypeSchema>;

// ─────────────────────────────────────────────────────────────
// Voice config
// ─────────────────────────────────────────────────────────────

export const voiceToneSchema = z.enum([
  'expert',
  'friendly',
  'edgy',
  'inspirational',
]);
export type VoiceTone = z.infer<typeof voiceToneSchema>;

export const voiceConfigSchema = z.object({
  tone: voiceToneSchema,
  formality: z.number().int().min(1).max(5).default(3),
  pov: z.enum(['first', 'second', 'third']).default('second'),
  emoji_policy: z.enum(['none', 'sparse', 'moderate', 'heavy']).default('sparse'),

  vocab_pref: z.array(z.string()).default([]),       // parole "on-brand"
  banned_words: z.array(z.string()).default([]),     // mai usare
  signature_phrases: z.array(z.string()).default([]),// frasi ricorrenti

  // Risposte alle 12 domande brand-voice (template del vault Mass Poster)
  // Compilabili gradualmente — tutte opzionali, libere come testo
  answers: z
    .object({
      what_we_sell: z.string().optional(),
      who_we_help: z.string().optional(),
      what_we_believe: z.string().optional(),
      what_we_hate: z.string().optional(),
      tone_in_3_words: z.string().optional(),
      what_we_never_say: z.string().optional(),
      reference_brand: z.string().optional(),
      anti_reference_brand: z.string().optional(),
      taboo_topics: z.string().optional(),
      humor_level: z.string().optional(),
      preferred_format: z.string().optional(),
      catchphrases: z.string().optional(),
    })
    .default({}),
});
export type VoiceConfig = z.infer<typeof voiceConfigSchema>;

// ─────────────────────────────────────────────────────────────
// Target personas
// ─────────────────────────────────────────────────────────────

export const personaSchema = z.object({
  name: z.string(),
  role: z.string(),                              // "Founder", "Head of Ops", ...
  company_size: z.string().optional(),           // "Solo", "1-10", "11-50", ...
  industry: z.string().optional(),
  age_range: z.string().optional(),
  pain_points: z.array(z.string()).default([]),
  desires: z.array(z.string()).default([]),
  triggers: z.array(z.string()).default([]),     // cosa li fa cliccare
  objections: z.array(z.string()).default([]),   // cosa li blocca
  platforms_active_on: z.array(platformSchema).default([]),
});
export type Persona = z.infer<typeof personaSchema>;

// ─────────────────────────────────────────────────────────────
// Brand (top-level config)
// ─────────────────────────────────────────────────────────────

export const brandConfigSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9-]+$/, 'lowercase + numbers + dashes only'),
  name: z.string().min(2).max(120),
  niche: z.string().optional(),
  voice_config: voiceConfigSchema,
  target_personas: z.array(personaSchema).default([]),
  default_platforms: z.array(platformSchema).default(['instagram', 'tiktok']),
  status: brandStatusSchema.default('draft'),
});
export type BrandConfig = z.infer<typeof brandConfigSchema>;

// ─────────────────────────────────────────────────────────────
// Offer schema (figlia di brand)
// ─────────────────────────────────────────────────────────────

export const ctaSchema = z.object({
  label: z.string(),                             // "Try Maplo free"
  weight: z.number().int().min(1).max(10).default(5),  // rotation weight
});
export type Cta = z.infer<typeof ctaSchema>;

export const offerSchema = z.object({
  type: offerTypeSchema,
  name: z.string().min(2).max(120),
  url: z.url().optional(),
  tracking_base_url: z.url().optional(),
  pitch_1_sentence: z.string().optional(),
  pitch_3_sentences: z.string().optional(),
  pitch_1_paragraph: z.string().optional(),
  cta_collection: z.array(ctaSchema).default([]),
  pricing_info: z
    .object({
      starts_from_eur: z.number().nonnegative().optional(),
      tier_labels: z.array(z.string()).default([]),
      has_free_tier: z.boolean().optional(),
      has_trial: z.boolean().optional(),
    })
    .default(() => ({ tier_labels: [] as string[] })),
  is_primary: z.boolean().default(false),
  active: z.boolean().default(true),
});
export type Offer = z.infer<typeof offerSchema>;

// ─────────────────────────────────────────────────────────────
// Full brand + offers bundle (utility per seed/import/export)
// ─────────────────────────────────────────────────────────────

export const brandWithOffersSchema = brandConfigSchema.extend({
  offers: z.array(offerSchema).default([]),
});
export type BrandWithOffers = z.infer<typeof brandWithOffersSchema>;
