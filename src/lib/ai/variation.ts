import type { BrandConfig, Persona } from '../brand/schema.ts';

/**
 * Content variation engine — takes 1 seed idea and produces N "natural" variants
 * for posting on multiple accounts/platforms without IG/TT duplicate-content ban.
 *
 * Strategy:
 *  - Same core insight, different copywriting framework
 *  - Different opening hook angle (number-first, contrarian, question, story)
 *  - Different caption structure (short/medium/long)
 *  - Different hashtag combination (no exact-set repeat across variants)
 *  - Per-persona angle (Mario the agency founder vs Luca the freelance dev)
 *
 * Note: this builds the *plan* (list of variation prompts to feed Claude).
 * The actual generation goes through ContentPipeline → ClaudeProvider.
 *
 * Use case: 1 hot insight → 10 variants → distribute across 10 accounts so
 * each gets a different post but they're all promoting the same offer angle.
 */

export type HookAngle =
  | 'pain_agitation'
  | 'contrarian'
  | 'mistake_fix'
  | 'tutorial'
  | 'case_study'
  | 'listicle'
  | 'comparison'
  | 'behind_the_scenes';

export type CaptionLength = 'short' | 'medium' | 'long';

export interface VariationSpec {
  variant_index: number;
  hook_angle: HookAngle;
  caption_length: CaptionLength;
  persona_focus?: string; // persona name, optional
  hashtag_subset: string[]; // 5-8 hashtags rotated from brand pool
  framework_hint: string;
}

const ALL_ANGLES: HookAngle[] = [
  'pain_agitation',
  'contrarian',
  'mistake_fix',
  'tutorial',
  'case_study',
  'listicle',
  'comparison',
  'behind_the_scenes',
];

const LENGTHS: CaptionLength[] = ['short', 'medium', 'long'];

/**
 * Plan N variations of a single seed idea.
 *
 * Algorithm:
 *  - Cycle through hook angles (no two consecutive variants share angle)
 *  - Cycle through caption lengths
 *  - Round-robin personas (if multiple)
 *  - Shuffle hashtag subset with at least 2 hashtags rotated vs previous
 */
export function planVariations(
  brand: BrandConfig,
  hashtag_pool: string[],
  count: number,
  seed_offset = 0,
): VariationSpec[] {
  const personas = brand.target_personas;
  const specs: VariationSpec[] = [];

  // Shuffle angles starting from seed_offset
  const anglesShuffled = rotateArray(ALL_ANGLES, seed_offset);

  for (let i = 0; i < count; i++) {
    const angle = anglesShuffled[i % anglesShuffled.length]!;
    const length = LENGTHS[i % LENGTHS.length]!;
    const persona = personas.length > 0 ? personas[i % personas.length] : undefined;

    // Hashtag subset: 5-7 random, with seeded shuffle so it's deterministic per i
    const subsetSize = 5 + (i % 3); // 5, 6, or 7
    const subset = pickHashtagSubset(hashtag_pool, subsetSize, seed_offset + i);

    specs.push({
      variant_index: i,
      hook_angle: angle,
      caption_length: length,
      persona_focus: persona?.name,
      hashtag_subset: subset,
      framework_hint: frameworkInstructions(angle, length, persona),
    });
  }

  return specs;
}

/**
 * Build the user-prompt augmentation string to inject into the ideation
 * prompt for this specific variant.
 *
 * The base system prompt already lists the 8 frameworks; this just tells
 * Claude WHICH framework + WHICH length + WHICH persona to focus on for
 * variant i.
 */
export function variationPromptSuffix(spec: VariationSpec): string {
  return `

## VARIANT ${spec.variant_index + 1} SPECIFICATIONS
Hook framework: **${spec.hook_angle}** (${spec.framework_hint})
Caption length: **${spec.caption_length}** (${captionLengthGuide(spec.caption_length)})
${spec.persona_focus ? `Persona focus: **${spec.persona_focus}** — address them by name in opening line.\n` : ''}Use only these hashtags (in this order): ${spec.hashtag_subset.join(' ')}

Stay STRICTLY within these constraints. The core insight must come across, but the execution
(hook style, structure, length) is fully determined by the framework above.`;
}

function frameworkInstructions(
  angle: HookAngle,
  _length: CaptionLength,
  persona?: Persona,
): string {
  const personaTag = persona ? ` Speaking to "${persona.name}".` : '';
  switch (angle) {
    case 'pain_agitation':
      return `Open with the prospect's specific pain (numbers, time wasted). Agitate why it's worse than they think. Reveal insight. CTA.${personaTag}`;
    case 'contrarian':
      return `"Everyone says X. They're wrong. Here's what actually works." Strong opinion, defended in 2-3 lines.${personaTag}`;
    case 'mistake_fix':
      return `Identify a common mistake the prospect makes. Show the fix in 1 sentence. Show the result.${personaTag}`;
    case 'tutorial':
      return `"How to [outcome] in [timeframe]." Numbered steps (Step 1... Step 2...). Outcome-focused.${personaTag}`;
    case 'case_study':
      return `"[Specific person/company] did X. Result: Y." Concrete numbers. Then "here's how you can too".${personaTag}`;
    case 'listicle':
      return `"N [things] that [outcome]." Use exactly N items. Numbered, scannable.${personaTag}`;
    case 'comparison':
      return `"A vs B" structure. Side-by-side. Declare winner with reason.${personaTag}`;
    case 'behind_the_scenes':
      return `"This is what we tested last week" — build-in-public, raw, with screenshots-mood.${personaTag}`;
  }
}

function captionLengthGuide(l: CaptionLength): string {
  switch (l) {
    case 'short':
      return 'aim for 80-150 chars. 2-3 short lines max. Punchy.';
    case 'medium':
      return 'aim for 150-300 chars. 3-5 lines. Hook + body + CTA.';
    case 'long':
      return 'aim for 300-600 chars. 6-10 lines. Story arc, with line breaks.';
  }
}

function rotateArray<T>(arr: readonly T[], offset: number): T[] {
  const o = ((offset % arr.length) + arr.length) % arr.length;
  return [...arr.slice(o), ...arr.slice(0, o)];
}

/** Deterministic hashtag subset picker using seed. */
function pickHashtagSubset(pool: string[], size: number, seed: number): string[] {
  if (pool.length === 0) return [];
  // Linear-congruential generator for deterministic shuffle
  let state = (seed * 9301 + 49297) % 233280;
  const next = () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  return shuffled.slice(0, Math.min(size, shuffled.length));
}

/**
 * Default hashtag pool for a brand — until we have a curated pool table,
 * we fall back to extracting from existing brand voice_config or providing
 * a generic B2B SaaS set.
 */
export function defaultHashtagPool(brand: BrandConfig): string[] {
  // Could pull from a `brand.hashtag_pool` field in future. For now, a sensible
  // B2B-ish default that the user can override at the brand level later.
  const generic = [
    '#leadgen',
    '#b2b',
    '#growth',
    '#automation',
    '#saas',
    '#startup',
    '#productivity',
    '#sales',
    '#marketing',
    '#agency',
    '#freelance',
    '#smallbusiness',
    '#founder',
    '#indiehacker',
  ];

  // If brand niche is set, add hashtag based on niche keywords
  if (brand.niche) {
    const nicheWords = brand.niche
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 4);
    for (const w of nicheWords) {
      generic.unshift(`#${w}`);
    }
  }
  // Dedupe + return
  return Array.from(new Set(generic));
}
