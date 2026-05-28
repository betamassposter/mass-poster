import type { BrandConfig } from '../brand/schema.ts';
import type { GeneratedIdea } from './types.ts';

/**
 * Quality gates AI — runs after content generation, before persisting.
 *
 * Catches issues that would either get the post shadowbanned (engagement bait,
 * banned hashtags) OR break brand voice consistency (banned words, off-tone).
 *
 * Returns a structured report so the caller can decide: persist + flag,
 * persist with warnings, or reject + re-generate.
 */

export type IssueSeverity = 'error' | 'warning' | 'info';

export interface QualityIssue {
  severity: IssueSeverity;
  category:
    | 'banned_words'
    | 'banned_hashtag'
    | 'engagement_bait'
    | 'brand_voice'
    | 'cta_compliance'
    | 'length'
    | 'duplicate_hook';
  message: string;
  /** Field on the idea that triggered it. */
  field: 'hook' | 'caption' | 'hashtags' | 'cta_used' | 'thumbnail_concept';
}

export interface QualityReport {
  /** 0-100; >= 70 = pass, 50-69 = warn, < 50 = reject. */
  score: number;
  passed: boolean;
  issues: QualityIssue[];
  /** Stats for telemetry. */
  stats: {
    banned_words_hit: number;
    banned_hashtags_hit: number;
    bait_phrases_hit: number;
    brand_voice_alignment: number; // 0-1
  };
}

// Platform-banned hashtags (spam / shadowban triggers — May 2026)
const PLATFORM_BANNED_HASHTAGS = new Set([
  '#fyp',
  '#foryou',
  '#foryoupage',
  '#viral',
  '#explore',
  '#follow4follow',
  '#like4like',
  '#followforfollow',
  '#likeforlike',
  '#instagood',
  '#instalike',
  '#instafollow',
  '#tagsforlikes',
]);

// Engagement bait patterns — IG explicitly penalizes
const ENGAGEMENT_BAIT_PATTERNS = [
  /\bmetti(?:\s+un)?\s+like\b/i,
  /\blike\s+(?:if|se)\b/i,
  /\btag\s+(?:a\s+)?friend/i,
  /\btagga\s+(?:un\s+)?amic/i,
  /\bdm\s+(?:me|us)\s+for\b/i,
  /\bcomment\s+(?:below|sotto)\b/i,
  /\bdouble\s+tap\s+if\b/i,
  /\bswipe\s+up\b/i, // link in bio era, deprecated
];

const SPAM_PHRASES = [
  /\bbuy\s+now\b/i,
  /\bclick\s+here\b/i,
  /\b100%\s+guaranteed\b/i,
  /\bact\s+fast\b/i,
  /\blimited\s+time\b/i, // sometimes legit, but flag
];

const TEXT_FIELDS: Array<{ field: QualityIssue['field']; get: (i: GeneratedIdea) => string }> = [
  { field: 'hook', get: (i) => i.hook },
  { field: 'caption', get: (i) => i.caption },
  { field: 'cta_used', get: (i) => i.cta_used },
  { field: 'thumbnail_concept', get: (i) => i.thumbnail_concept },
];

export function checkQuality(
  idea: GeneratedIdea,
  brand: BrandConfig,
  options: {
    /** Other ideas in the same batch — used for duplicate-hook detection. */
    siblings?: GeneratedIdea[];
    /** Reject threshold (default 50). */
    reject_below?: number;
    /** Pass threshold (default 70). */
    pass_above?: number;
  } = {},
): QualityReport {
  const issues: QualityIssue[] = [];
  const stats = {
    banned_words_hit: 0,
    banned_hashtags_hit: 0,
    bait_phrases_hit: 0,
    brand_voice_alignment: 0,
  };

  const bannedWords = brand.voice_config.banned_words.map((w) => w.toLowerCase());
  const vocabPref = brand.voice_config.vocab_pref.map((w) => w.toLowerCase());
  const signaturePhrases = brand.voice_config.signature_phrases.map((p) => p.toLowerCase());

  // ── 1. Banned words ────────────────────────────────────────────────
  for (const tf of TEXT_FIELDS) {
    const text = tf.get(idea).toLowerCase();
    for (const word of bannedWords) {
      if (!word) continue;
      const re = new RegExp(`\\b${escapeRegex(word)}\\b`, 'i');
      if (re.test(text)) {
        stats.banned_words_hit++;
        issues.push({
          severity: 'error',
          category: 'banned_words',
          message: `Banned word "${word}" detected in ${tf.field}`,
          field: tf.field,
        });
      }
    }
  }

  // ── 2. Banned hashtags ─────────────────────────────────────────────
  for (const tag of idea.hashtags) {
    if (PLATFORM_BANNED_HASHTAGS.has(tag.toLowerCase())) {
      stats.banned_hashtags_hit++;
      issues.push({
        severity: 'error',
        category: 'banned_hashtag',
        message: `Platform-banned hashtag "${tag}" — will trigger shadowban`,
        field: 'hashtags',
      });
    }
  }
  if (idea.hashtags.length > 15) {
    issues.push({
      severity: 'warning',
      category: 'length',
      message: `${idea.hashtags.length} hashtags — over 15 looks spammy on IG`,
      field: 'hashtags',
    });
  }

  // ── 3. Engagement bait ─────────────────────────────────────────────
  for (const tf of TEXT_FIELDS) {
    const text = tf.get(idea);
    for (const pattern of ENGAGEMENT_BAIT_PATTERNS) {
      if (pattern.test(text)) {
        stats.bait_phrases_hit++;
        issues.push({
          severity: 'warning',
          category: 'engagement_bait',
          message: `Possible engagement bait in ${tf.field}: ${pattern.source}`,
          field: tf.field,
        });
      }
    }
    for (const pattern of SPAM_PHRASES) {
      if (pattern.test(text)) {
        issues.push({
          severity: 'warning',
          category: 'engagement_bait',
          message: `Spam phrase pattern in ${tf.field}: ${pattern.source}`,
          field: tf.field,
        });
      }
    }
  }

  // ── 4. Brand voice alignment ───────────────────────────────────────
  // Count vocab_pref hits and signature_phrase hits across all text.
  const fullText = TEXT_FIELDS.map((tf) => tf.get(idea)).join(' ').toLowerCase();
  let vocabHits = 0;
  for (const w of vocabPref) {
    if (w && fullText.includes(w.toLowerCase())) vocabHits++;
  }
  let sigHits = 0;
  for (const p of signaturePhrases) {
    if (p && fullText.includes(p.toLowerCase())) sigHits++;
  }
  // Alignment formula: 0.5 base + 0.3 * vocab coverage + 0.2 * has at least 1 signature
  const vocabCoverage = vocabPref.length === 0 ? 0.5 : Math.min(1, vocabHits / Math.min(3, vocabPref.length));
  stats.brand_voice_alignment = Math.min(1, 0.5 + 0.3 * vocabCoverage + (sigHits > 0 ? 0.2 : 0));

  if (stats.brand_voice_alignment < 0.6) {
    issues.push({
      severity: 'warning',
      category: 'brand_voice',
      message: `Brand voice alignment low (${(stats.brand_voice_alignment * 100).toFixed(0)}%). Add vocab_pref words or signature phrases.`,
      field: 'caption',
    });
  }

  // ── 5. CTA compliance — must be present in caption ──────────────────
  if (idea.cta_used) {
    const ctaWords = idea.cta_used.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    const captionLower = idea.caption.toLowerCase();
    const ctaInCaption = ctaWords.some((w) => captionLower.includes(w));
    if (!ctaInCaption) {
      issues.push({
        severity: 'warning',
        category: 'cta_compliance',
        message: `cta_used "${idea.cta_used}" doesn't appear in caption text`,
        field: 'caption',
      });
    }
  }

  // ── 6. Length checks ────────────────────────────────────────────────
  if (idea.hook.length < 15) {
    issues.push({
      severity: 'warning',
      category: 'length',
      message: `Hook is very short (${idea.hook.length} chars) — likely won't catch attention`,
      field: 'hook',
    });
  }
  if (idea.caption.length < 80) {
    issues.push({
      severity: 'info',
      category: 'length',
      message: `Caption is short (${idea.caption.length} chars) — IG rewards 120-300 char captions`,
      field: 'caption',
    });
  }

  // ── 7. Duplicate hook detection (within batch) ──────────────────────
  if (options.siblings) {
    const otherHooks = options.siblings.filter((s) => s !== idea).map((s) => s.hook);
    for (const other of otherHooks) {
      const sim = jaccardSimilarity(idea.hook, other);
      if (sim > 0.7) {
        issues.push({
          severity: 'error',
          category: 'duplicate_hook',
          message: `Hook too similar to another in batch (jaccard ${(sim * 100).toFixed(0)}%)`,
          field: 'hook',
        });
        break;
      }
    }
  }

  // ── Score calculation ──────────────────────────────────────────────
  // Start at 100, subtract for issues.
  let score = 100;
  for (const issue of issues) {
    if (issue.severity === 'error') score -= 25;
    else if (issue.severity === 'warning') score -= 10;
    else score -= 3;
  }
  score = Math.max(0, Math.min(100, score));

  const rejectBelow = options.reject_below ?? 50;
  const passAbove = options.pass_above ?? 70;
  const passed = score >= passAbove;

  return {
    score,
    passed,
    issues,
    stats,
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Token-set Jaccard similarity over lowercased words. */
function jaccardSimilarity(a: string, b: string): number {
  const toSet = (s: string) =>
    new Set(s.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
  const sa = toSet(a);
  const sb = toSet(b);
  if (sa.size === 0 && sb.size === 0) return 1;
  let inter = 0;
  for (const w of sa) if (sb.has(w)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}
