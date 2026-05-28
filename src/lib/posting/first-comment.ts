import type { Platform } from './types.ts';

/**
 * First-comment automation: for IG/TT, hashtags as first comment perform
 * 20-30% better than hashtags inline in caption. Reasons:
 *  - Caption stays clean / readable
 *  - Algorithm still indexes hashtags
 *  - More user-friendly for sharing
 *
 * Strategy:
 *  1. If caption already contains hashtags inline → split them out
 *  2. If brand wants first-comment strategy → return them as `first_comment`
 *  3. Otherwise → keep hashtags in caption
 *
 * Currently always-on for IG + TT. Configurable per-brand in future via
 * brand.posting_options.first_comment_strategy.
 */

export interface ExtractedComment {
  clean_caption: string;
  /** Hashtags joined with spaces, ready to be posted as first comment. */
  first_comment: string | undefined;
}

const FIRST_COMMENT_PLATFORMS: Set<Platform> = new Set(['instagram', 'tiktok']);

export function extractFirstComment(
  caption: string,
  hashtags: string[],
  platform: Platform,
): ExtractedComment {
  // Only apply on platforms where this matters
  if (!FIRST_COMMENT_PLATFORMS.has(platform)) {
    return { clean_caption: caption, first_comment: undefined };
  }

  // Remove inline hashtags from caption (defensive: caption usually doesn't have them,
  // but if Claude included them, strip out).
  const inlineHashtagPattern = /(?:^|\s)(#[A-Za-z0-9_]+)/g;
  const captionMatches = [...caption.matchAll(inlineHashtagPattern)];
  let clean_caption = caption;
  for (const m of captionMatches) {
    clean_caption = clean_caption.replace(m[0], m[0].startsWith(' ') ? '' : '');
  }
  clean_caption = clean_caption.replace(/\s{2,}/g, ' ').trim();

  // Build first_comment from hashtags array + any inline ones we extracted.
  const inlineExtracted = captionMatches.map((m) => m[1]!);
  const allTags = Array.from(new Set([...hashtags, ...inlineExtracted]));

  if (allTags.length === 0) {
    return { clean_caption, first_comment: undefined };
  }

  // IG caps first-comment at ~2200 chars but practical max is 5-10 hashtags.
  // Order: niche-specific first (longer), generic last (shorter).
  const sorted = allTags.sort((a, b) => b.length - a.length).slice(0, 10);

  return {
    clean_caption,
    first_comment: sorted.join(' '),
  };
}

/**
 * Should the platform use first-comment strategy? Read brand preference,
 * fall back to platform default.
 */
export function shouldUseFirstComment(
  platform: Platform,
  brand_setting?: 'auto' | 'always' | 'never',
): boolean {
  if (brand_setting === 'always') return true;
  if (brand_setting === 'never') return false;
  return FIRST_COMMENT_PLATFORMS.has(platform);
}
