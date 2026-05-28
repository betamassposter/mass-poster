import type { Platform } from './types.ts';

/**
 * Warmup recipes per platform — day-by-day action sequences for new accounts.
 *
 * Each action is what to do that day. The actual execution is delegated to:
 *  - Manual (you, day 1-7 of dogfood) — print the checklist
 *  - Browser-Use Cloud (Blocco 9) — automate via headless agent
 *  - Playwright (custom future) — for fine-grained control
 *
 * Sources: Instagram/TikTok/LinkedIn community discussions (May 2026),
 * cross-checked with mass-posting playbooks. These are CONSERVATIVE rates
 * to maximize account longevity (target: 90%+ accounts survive 30 days).
 */

export type WarmupAction =
  | { type: 'scroll'; duration_sec: number; topic: string }
  | { type: 'like'; count: number; topic: string }
  | { type: 'save'; count: number }
  | { type: 'follow'; count: number; criteria: string }
  | { type: 'comment'; count: number; style: string }
  | { type: 'watch_video'; count: number; min_dwell_sec: number }
  | { type: 'profile_setup'; fields: string[] }
  | { type: 'react'; count: number; reaction: 'like' | 'celebrate' | 'support' | 'insightful' }
  | { type: 'connect'; count: number; criteria: string }
  | { type: 'idle'; rationale: string };

export interface WarmupDay {
  day: number;
  total_session_min: number;
  actions: WarmupAction[];
  notes: string;
}

export interface WarmupRecipe {
  platform: Platform;
  total_days: number;
  description: string;
  days: WarmupDay[];
}

// ─────────────────────────────────────────────────────────────
// Instagram (mobile-first; aggressive feed engagement, no posting)
// ─────────────────────────────────────────────────────────────

const INSTAGRAM_RECIPE: WarmupRecipe = {
  platform: 'instagram',
  total_days: 7,
  description: 'IG warmup — focus on signaling "real human" via varied engagement; NO POSTS in week 1.',
  days: [
    {
      day: 1,
      total_session_min: 15,
      actions: [
        { type: 'profile_setup', fields: ['bio', 'pfp', 'name', 'website_link'] },
        { type: 'scroll', duration_sec: 300, topic: 'niche feed' },
        { type: 'like', count: 5, topic: 'niche posts' },
        { type: 'follow', count: 5, criteria: '5 top creators in niche (>10k followers, niche-relevant)' },
      ],
      notes: 'First impression matters — complete the profile fully before any action.',
    },
    {
      day: 2,
      total_session_min: 12,
      actions: [
        { type: 'scroll', duration_sec: 480, topic: 'niche + explore mixed' },
        { type: 'like', count: 8, topic: 'organic interest signals' },
        { type: 'save', count: 2 },
      ],
      notes: 'No follows today. Pure consumption signal.',
    },
    {
      day: 3,
      total_session_min: 18,
      actions: [
        { type: 'scroll', duration_sec: 360, topic: 'reels + feed' },
        { type: 'like', count: 10, topic: 'mix reel/post' },
        { type: 'save', count: 3 },
        { type: 'follow', count: 3, criteria: 'mid-tier creators (1k-10k followers)' },
        { type: 'comment', count: 1, style: 'generic positive 5-12 words ("Love this!", "Need to try this!")' },
      ],
      notes: 'First comment day. Keep it short and generic — algorithm scrutinizes new accounts heavily.',
    },
    {
      day: 4,
      total_session_min: 15,
      actions: [
        { type: 'scroll', duration_sec: 400, topic: 'explore + reels' },
        { type: 'like', count: 12, topic: 'varied' },
        { type: 'save', count: 4 },
        { type: 'comment', count: 2, style: 'generic positive, different formats' },
      ],
      notes: 'No follows today.',
    },
    {
      day: 5,
      total_session_min: 20,
      actions: [
        { type: 'scroll', duration_sec: 600, topic: 'niche + reels' },
        { type: 'like', count: 15, topic: 'varied' },
        { type: 'save', count: 5 },
        { type: 'follow', count: 5, criteria: 'small accounts (100-1k followers, niche)' },
        { type: 'comment', count: 2, style: 'slightly longer (10-20 words) but still generic' },
      ],
      notes: 'Follow more small accounts — they often follow back, boost follower count organically.',
    },
    {
      day: 6,
      total_session_min: 20,
      actions: [
        { type: 'scroll', duration_sec: 500, topic: 'reels primary' },
        { type: 'like', count: 18, topic: 'reels emphasized' },
        { type: 'save', count: 6 },
        { type: 'comment', count: 3, style: 'mix of generic + niche-relevant short comments' },
      ],
      notes: 'Reel engagement signals to algorithm "user likes reels" → bias future visibility.',
    },
    {
      day: 7,
      total_session_min: 25,
      actions: [
        { type: 'scroll', duration_sec: 600, topic: 'normal use' },
        { type: 'like', count: 20, topic: 'organic' },
        { type: 'save', count: 6 },
        { type: 'follow', count: 4, criteria: 'mid-tier creators' },
        { type: 'comment', count: 3, style: 'genuine, niche-relevant' },
      ],
      notes: 'Final warmup day. Account is now ready for first POST (start with reel) on day 8.',
    },
  ],
};

// ─────────────────────────────────────────────────────────────
// TikTok (algorithm rewards dwell-time + watch-completion)
// ─────────────────────────────────────────────────────────────

const TIKTOK_RECIPE: WarmupRecipe = {
  platform: 'tiktok',
  total_days: 7,
  description: 'TikTok warmup — algorithm needs to learn your interests via watch behavior. ZERO posting.',
  days: [
    {
      day: 1,
      total_session_min: 20,
      actions: [
        { type: 'profile_setup', fields: ['username', 'bio', 'pfp'] },
        { type: 'watch_video', count: 10, min_dwell_sec: 15 },
        { type: 'like', count: 3, topic: 'videos watched to end' },
      ],
      notes: 'Algorithm watching this session as the "calibration" — must FULLY WATCH 80%+ of videos.',
    },
    {
      day: 2,
      total_session_min: 15,
      actions: [
        { type: 'watch_video', count: 15, min_dwell_sec: 10 },
        { type: 'like', count: 4, topic: 'niche-relevant videos' },
        { type: 'follow', count: 2, criteria: 'top niche creators only' },
      ],
      notes: 'First follows. Keep low — TikTok flags fast followers as bots.',
    },
    {
      day: 3,
      total_session_min: 18,
      actions: [
        { type: 'watch_video', count: 20, min_dwell_sec: 12 },
        { type: 'like', count: 6, topic: 'mix niche + general' },
        { type: 'save', count: 2 },
      ],
      notes: 'Saves are strong relevance signal.',
    },
    {
      day: 4,
      total_session_min: 20,
      actions: [
        { type: 'watch_video', count: 25, min_dwell_sec: 15 },
        { type: 'like', count: 8, topic: 'niche' },
        { type: 'follow', count: 3, criteria: 'mid creators' },
        { type: 'save', count: 3 },
      ],
      notes: 'Niche signals are strong now. Algorithm starts surfacing relevant content.',
    },
    {
      day: 5,
      total_session_min: 22,
      actions: [
        { type: 'watch_video', count: 25, min_dwell_sec: 18 },
        { type: 'like', count: 10, topic: 'mostly niche' },
        { type: 'comment', count: 1, style: 'short organic emoji + 3-5 words' },
        { type: 'save', count: 4 },
      ],
      notes: 'First comment. Keep ultra-light, emoji-rich.',
    },
    {
      day: 6,
      total_session_min: 25,
      actions: [
        { type: 'watch_video', count: 30, min_dwell_sec: 20 },
        { type: 'like', count: 12, topic: 'niche' },
        { type: 'comment', count: 2, style: 'short genuine' },
        { type: 'follow', count: 3, criteria: 'mid niche' },
      ],
      notes: 'Comment must be natural, not promotional or with URLs.',
    },
    {
      day: 7,
      total_session_min: 25,
      actions: [
        { type: 'watch_video', count: 35, min_dwell_sec: 20 },
        { type: 'like', count: 15, topic: 'niche' },
        { type: 'comment', count: 3, style: 'genuine + niche-specific' },
        { type: 'save', count: 5 },
      ],
      notes: 'Ready to post first reel on day 8. Continue 15-20 min daily engagement in addition to posting.',
    },
  ],
};

// ─────────────────────────────────────────────────────────────
// LinkedIn (B2B, much slower cadence, react before connect)
// ─────────────────────────────────────────────────────────────

const LINKEDIN_RECIPE: WarmupRecipe = {
  platform: 'linkedin',
  total_days: 7,
  description: 'LinkedIn warmup — much slower, much less risky. Focus profile completeness + reactions.',
  days: [
    {
      day: 1,
      total_session_min: 30,
      actions: [
        {
          type: 'profile_setup',
          fields: ['headline', 'about', 'experience (3 entries)', 'education', 'skills (5)', 'pfp', 'banner'],
        },
        { type: 'react', count: 3, reaction: 'insightful' },
      ],
      notes: 'LinkedIn shows skeleton profiles much less. Spend 30 min day 1 on profile.',
    },
    { day: 2, total_session_min: 10, actions: [{ type: 'react', count: 5, reaction: 'like' }], notes: '' },
    {
      day: 3,
      total_session_min: 10,
      actions: [{ type: 'react', count: 5, reaction: 'celebrate' }, { type: 'comment', count: 1, style: '1-line genuine react comment' }],
      notes: 'First comment — 1 line, genuine, no links',
    },
    {
      day: 4,
      total_session_min: 12,
      actions: [
        { type: 'react', count: 5, reaction: 'insightful' },
        { type: 'connect', count: 3, criteria: 'people in your niche, no message' },
      ],
      notes: 'First connections.',
    },
    {
      day: 5,
      total_session_min: 12,
      actions: [
        { type: 'react', count: 6, reaction: 'like' },
        { type: 'comment', count: 2, style: '1-line genuine' },
      ],
      notes: '',
    },
    {
      day: 6,
      total_session_min: 12,
      actions: [
        { type: 'react', count: 6, reaction: 'insightful' },
        { type: 'connect', count: 3, criteria: 'niche-relevant' },
      ],
      notes: '',
    },
    {
      day: 7,
      total_session_min: 15,
      actions: [
        { type: 'react', count: 8, reaction: 'celebrate' },
        { type: 'comment', count: 3, style: '2-line genuine' },
      ],
      notes: 'Ready to post day 8. LinkedIn posts: 3-5 per week MAX.',
    },
  ],
};

// ─────────────────────────────────────────────────────────────
// YouTube Shorts (light — most users post immediately on YT, but warmup helps)
// ─────────────────────────────────────────────────────────────

const YOUTUBE_RECIPE: WarmupRecipe = {
  platform: 'youtube_shorts',
  total_days: 5,
  description: 'YT Shorts warmup — minimal, mostly profile + subscribe behavior.',
  days: [
    {
      day: 1,
      total_session_min: 10,
      actions: [
        { type: 'profile_setup', fields: ['channel name', 'banner', 'about', 'channel art'] },
        { type: 'watch_video', count: 5, min_dwell_sec: 30 },
      ],
      notes: '',
    },
    {
      day: 2,
      total_session_min: 8,
      actions: [
        { type: 'watch_video', count: 8, min_dwell_sec: 20 },
        { type: 'like', count: 3, topic: 'niche shorts' },
      ],
      notes: '',
    },
    {
      day: 3,
      total_session_min: 8,
      actions: [
        { type: 'watch_video', count: 8, min_dwell_sec: 25 },
        { type: 'like', count: 4, topic: 'niche' },
        { type: 'follow', count: 2, criteria: 'niche creators (subscribe)' },
      ],
      notes: 'Subscribe = follow on YT.',
    },
    {
      day: 4,
      total_session_min: 10,
      actions: [
        { type: 'watch_video', count: 10, min_dwell_sec: 25 },
        { type: 'like', count: 5, topic: 'niche' },
        { type: 'comment', count: 1, style: 'short genuine' },
      ],
      notes: '',
    },
    {
      day: 5,
      total_session_min: 10,
      actions: [
        { type: 'watch_video', count: 12, min_dwell_sec: 30 },
        { type: 'like', count: 6, topic: 'niche' },
        { type: 'follow', count: 2, criteria: 'niche' },
      ],
      notes: 'Ready to upload first short on day 6.',
    },
  ],
};

// ─────────────────────────────────────────────────────────────
// X / Twitter (text-first, react + reply, minimal warmup)
// ─────────────────────────────────────────────────────────────

const X_RECIPE: WarmupRecipe = {
  platform: 'x',
  total_days: 5,
  description: 'X warmup — primarily profile + likes + small replies, no DMs.',
  days: [
    {
      day: 1,
      total_session_min: 12,
      actions: [
        { type: 'profile_setup', fields: ['display name', 'handle', 'bio', 'banner', 'pfp', 'location', 'website'] },
        { type: 'scroll', duration_sec: 180, topic: 'home + niche' },
        { type: 'like', count: 5, topic: 'niche tweets' },
        { type: 'follow', count: 5, criteria: 'top niche accounts' },
      ],
      notes: '',
    },
    {
      day: 2,
      total_session_min: 10,
      actions: [
        { type: 'scroll', duration_sec: 240, topic: 'home feed' },
        { type: 'like', count: 8, topic: 'mix' },
        { type: 'follow', count: 3, criteria: 'niche' },
      ],
      notes: '',
    },
    {
      day: 3,
      total_session_min: 10,
      actions: [
        { type: 'like', count: 10, topic: 'mix' },
        { type: 'comment', count: 1, style: 'short genuine reply 5-15 words' },
        { type: 'follow', count: 3, criteria: 'mid-tier' },
      ],
      notes: 'First reply.',
    },
    {
      day: 4,
      total_session_min: 12,
      actions: [
        { type: 'like', count: 12, topic: 'niche' },
        { type: 'comment', count: 2, style: 'short genuine replies' },
        { type: 'follow', count: 3, criteria: 'niche' },
      ],
      notes: '',
    },
    {
      day: 5,
      total_session_min: 12,
      actions: [
        { type: 'like', count: 12, topic: 'niche' },
        { type: 'comment', count: 3, style: 'genuine replies' },
        { type: 'follow', count: 3, criteria: 'niche' },
      ],
      notes: 'Ready to start posting day 6.',
    },
  ],
};

const FACEBOOK_RECIPE: WarmupRecipe = {
  platform: 'facebook',
  total_days: 5,
  description: 'Facebook warmup — group joins + reactions, slower than IG.',
  days: [
    {
      day: 1,
      total_session_min: 15,
      actions: [{ type: 'profile_setup', fields: ['name', 'pfp', 'banner', 'bio'] }, { type: 'like', count: 5, topic: 'niche pages' }],
      notes: '',
    },
    { day: 2, total_session_min: 10, actions: [{ type: 'like', count: 8, topic: 'mix' }], notes: '' },
    { day: 3, total_session_min: 12, actions: [{ type: 'react', count: 10, reaction: 'like' }, { type: 'comment', count: 1, style: 'short' }], notes: '' },
    { day: 4, total_session_min: 12, actions: [{ type: 'react', count: 10, reaction: 'celebrate' }, { type: 'comment', count: 2, style: 'short' }], notes: '' },
    { day: 5, total_session_min: 12, actions: [{ type: 'react', count: 12, reaction: 'like' }, { type: 'comment', count: 2, style: 'short' }], notes: '' },
  ],
};

export const WARMUP_RECIPES: Record<Platform, WarmupRecipe> = {
  instagram: INSTAGRAM_RECIPE,
  tiktok: TIKTOK_RECIPE,
  youtube_shorts: YOUTUBE_RECIPE,
  linkedin: LINKEDIN_RECIPE,
  x: X_RECIPE,
  facebook: FACEBOOK_RECIPE,
};

/**
 * Get the action checklist for a specific day of an account's warmup.
 * Returns null if day is past the recipe's total_days.
 */
export function getDailyWarmup(platform: Platform, day: number): WarmupDay | null {
  const recipe = WARMUP_RECIPES[platform];
  return recipe.days.find((d) => d.day === day) ?? null;
}

/**
 * Compute current warmup day for an account, given when warmup started.
 * Returns 0 if not started, 1+ for active warmup, or -1 if warmup complete.
 */
export function currentWarmupDay(warmup_started_at: string | null, total_days: number): number {
  if (!warmup_started_at) return 0;
  const ms = Date.now() - new Date(warmup_started_at).getTime();
  const day = Math.floor(ms / (24 * 60 * 60 * 1000)) + 1;
  if (day > total_days) return -1;
  return day;
}
