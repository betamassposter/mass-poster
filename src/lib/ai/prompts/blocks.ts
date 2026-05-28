import type {
  BrandConfig,
  Offer,
  Persona,
  VoiceConfig,
} from '../../brand/schema.ts';

/**
 * Build the 3 prompt blocks fed to Claude:
 *   1. brand_voice_block (cached per brand)
 *   2. offer_block (cached per offer)
 *   3. user_prompt (volatile, per batch request)
 *
 * Keeping these deterministic is critical for prompt caching — any
 * non-stable input (timestamp, UUID, unsorted set iteration) in the
 * cached blocks will invalidate the cache. We sort arrays and avoid
 * any Date.now() / random.
 */

export function buildBrandVoiceBlock(brand: BrandConfig): string {
  const v: VoiceConfig = brand.voice_config;
  const lines = [
    `<brand>`,
    `Brand: ${brand.name}`,
    `Slug: ${brand.slug}`,
    `Niche: ${brand.niche ?? 'unspecified'}`,
    ``,
    `<voice>`,
    `Tone: ${v.tone}`,
    `Formality (1-5): ${v.formality}`,
    `POV: ${v.pov}`,
    `Emoji policy: ${v.emoji_policy}`,
    ``,
    `Vocab preferences: ${[...v.vocab_pref].sort().join(', ') || 'none'}`,
    `Banned words (NEVER use): ${[...v.banned_words].sort().join(', ') || 'none'}`,
    `Signature phrases (use 0-2 per caption, naturally): ${v.signature_phrases.join(' | ') || 'none'}`,
    ``,
    `<answers>`,
    `What we sell: ${v.answers.what_we_sell ?? 'n/a'}`,
    `Who we help: ${v.answers.who_we_help ?? 'n/a'}`,
    `What we believe: ${v.answers.what_we_believe ?? 'n/a'}`,
    `What we hate: ${v.answers.what_we_hate ?? 'n/a'}`,
    `Tone in 3 words: ${v.answers.tone_in_3_words ?? 'n/a'}`,
    `What we never say: ${v.answers.what_we_never_say ?? 'n/a'}`,
    `Reference brand: ${v.answers.reference_brand ?? 'n/a'}`,
    `Anti-reference brand: ${v.answers.anti_reference_brand ?? 'n/a'}`,
    `Taboo topics: ${v.answers.taboo_topics ?? 'n/a'}`,
    `Humor level: ${v.answers.humor_level ?? 'n/a'}`,
    `Preferred format: ${v.answers.preferred_format ?? 'n/a'}`,
    `Catchphrases: ${v.answers.catchphrases ?? 'n/a'}`,
    `</answers>`,
    `</voice>`,
    ``,
    `<personas>`,
    ...brand.target_personas.flatMap((p: Persona, i: number) => [
      `<persona id="${i + 1}">`,
      `Name: ${p.name}`,
      `Role: ${p.role}`,
      `Industry: ${p.industry ?? 'n/a'} · Company size: ${p.company_size ?? 'n/a'} · Age: ${p.age_range ?? 'n/a'}`,
      `Pain points: ${p.pain_points.join(' | ')}`,
      `Desires: ${p.desires.join(' | ')}`,
      `Triggers: ${p.triggers.join(' | ')}`,
      `Objections: ${p.objections.join(' | ')}`,
      `Platforms active on: ${[...p.platforms_active_on].sort().join(', ')}`,
      `</persona>`,
    ]),
    `</personas>`,
    `</brand>`,
  ];
  return lines.join('\n');
}

export function buildOfferBlock(offer: Offer): string {
  const lines = [
    `<offer>`,
    `Type: ${offer.type}`,
    `Name: ${offer.name}`,
    `URL: ${offer.url ?? 'n/a'}`,
    ``,
    `Pitch (1 sentence): ${offer.pitch_1_sentence ?? 'n/a'}`,
    `Pitch (3 sentences): ${offer.pitch_3_sentences ?? 'n/a'}`,
    `Pitch (1 paragraph): ${offer.pitch_1_paragraph ?? 'n/a'}`,
    ``,
    `CTA collection (pick one per caption; rotate across batch):`,
    ...[...offer.cta_collection]
      .sort((a, b) => b.weight - a.weight)
      .map((cta) => `  • "${cta.label}" (weight ${cta.weight})`),
    ``,
    `Pricing info: ${JSON.stringify(offer.pricing_info)}`,
    `</offer>`,
  ];
  return lines.join('\n');
}

export interface IdeationPromptOpts {
  count: number;
  platform: 'instagram' | 'tiktok' | 'youtube_shorts' | 'linkedin' | 'x';
  recent_winners?: string[];     // top-performing hooks to NOT repeat
  avoid_hooks?: string[];        // explicit ban list (already used)
  extra_context?: string;        // optional: time of day, trending topic, etc.
}

export function buildIdeationUserPrompt(opts: IdeationPromptOpts): string {
  const lines = [
    `Generate ${opts.count} short-form content ideas for platform: ${opts.platform}.`,
    ``,
    `Requirements:`,
    `- Each idea must use a different copywriting framework (pain agitation, contrarian, listicle, story, etc.).`,
    `- Hooks must be specific (numbers, named pain points, concrete outcomes) — not generic.`,
    `- Captions tailored to ${opts.platform} native style and length.`,
    `- Use ONE CTA per caption, picked from the offer's CTA collection (or a close variant).`,
    `- Hashtags: 5-10, mix of niche + broad. NO #fyp / #viral / #explore.`,
    `- thumbnail_concept: 1 sentence describing the reel cover visual (no AI image gen yet).`,
  ];

  if (opts.recent_winners?.length) {
    lines.push(
      ``,
      `Recent top-performing hooks (DO NOT repeat the angle, but learn from the structure):`,
      ...opts.recent_winners.map((h) => `  - ${h}`),
    );
  }
  if (opts.avoid_hooks?.length) {
    lines.push(
      ``,
      `Already-used hooks (DO NOT generate similar):`,
      ...opts.avoid_hooks.map((h) => `  - ${h}`),
    );
  }
  if (opts.extra_context) {
    lines.push(``, `Extra context: ${opts.extra_context}`);
  }

  lines.push(
    ``,
    `Output the JSON object matching the schema. No prose. No markdown fences. Just JSON.`,
  );
  return lines.join('\n');
}
