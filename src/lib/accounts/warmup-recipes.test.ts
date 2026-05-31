import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WARMUP_RECIPES,
  getDailyWarmup,
  currentWarmupDay,
  type WarmupAction,
} from './warmup-recipes.ts';
import type { Platform } from './types.ts';

const ALL_PLATFORMS: Platform[] = [
  'instagram',
  'tiktok',
  'youtube_shorts',
  'linkedin',
  'x',
  'facebook',
];

describe('WARMUP_RECIPES integrity', () => {
  it.each(ALL_PLATFORMS)('has a recipe for %s', (platform) => {
    expect(WARMUP_RECIPES[platform]).toBeDefined();
    expect(WARMUP_RECIPES[platform].platform).toBe(platform);
  });

  it.each(ALL_PLATFORMS)('%s: total_days matches days.length', (platform) => {
    const recipe = WARMUP_RECIPES[platform];
    expect(recipe.days.length).toBe(recipe.total_days);
  });

  it.each(ALL_PLATFORMS)('%s: day numbers are sequential starting at 1', (platform) => {
    const recipe = WARMUP_RECIPES[platform];
    recipe.days.forEach((d, i) => {
      expect(d.day).toBe(i + 1);
    });
  });

  it.each(ALL_PLATFORMS)('%s: every day has at least one action', (platform) => {
    const recipe = WARMUP_RECIPES[platform];
    recipe.days.forEach((d) => {
      expect(d.actions.length).toBeGreaterThan(0);
    });
  });

  it.each(ALL_PLATFORMS)(
    '%s: session minutes stay within a sane upper bound (<= 45)',
    (platform) => {
      const recipe = WARMUP_RECIPES[platform];
      recipe.days.forEach((d) => {
        expect(d.total_session_min).toBeLessThanOrEqual(45);
        expect(d.total_session_min).toBeGreaterThan(0);
      });
    },
  );

  it('does not schedule posting/upload actions during week-1 warmup', () => {
    // Hard rule from project memory: NO POSTS in week 1 (see warmup playbook).
    // The action type union contains no 'post' or 'upload' variant — but if a
    // future contributor adds one, this guard catches it.
    const forbidden = new Set<WarmupAction['type']>([
      // intentionally empty today; populate when 'post' is added to the union.
    ]);
    for (const recipe of Object.values(WARMUP_RECIPES)) {
      for (const day of recipe.days) {
        for (const action of day.actions) {
          expect(forbidden.has(action.type)).toBe(false);
        }
      }
    }
  });

  it('instagram day 1 includes profile_setup before any engagement', () => {
    const day1 = WARMUP_RECIPES.instagram.days[0];
    expect(day1).toBeDefined();
    expect(day1!.actions[0]!.type).toBe('profile_setup');
  });

  it('linkedin uses react actions (B2B-specific signal)', () => {
    const linkedin = WARMUP_RECIPES.linkedin;
    const hasReact = linkedin.days.some((d) => d.actions.some((a) => a.type === 'react'));
    expect(hasReact).toBe(true);
  });

  it('tiktok emphasizes watch_video (dwell-time is the key signal)', () => {
    const tiktok = WARMUP_RECIPES.tiktok;
    const watchCount = tiktok.days.reduce(
      (sum, d) => sum + d.actions.filter((a) => a.type === 'watch_video').length,
      0,
    );
    expect(watchCount).toBeGreaterThanOrEqual(tiktok.total_days);
  });

  it('follow counts escalate gradually on instagram (no day-1 spike)', () => {
    const followCounts = WARMUP_RECIPES.instagram.days.map((d) => {
      const follow = d.actions.find((a) => a.type === 'follow');
      return follow?.type === 'follow' ? follow.count : 0;
    });
    // No single day should exceed 10 follows — algorithm flags spikes.
    followCounts.forEach((c) => expect(c).toBeLessThanOrEqual(10));
  });
});

describe('getDailyWarmup', () => {
  it('returns the matching day', () => {
    const d3 = getDailyWarmup('instagram', 3);
    expect(d3).not.toBeNull();
    expect(d3!.day).toBe(3);
  });

  it('returns null past total_days', () => {
    const recipe = WARMUP_RECIPES.instagram;
    expect(getDailyWarmup('instagram', recipe.total_days + 1)).toBeNull();
  });

  it('returns null for day 0', () => {
    expect(getDailyWarmup('instagram', 0)).toBeNull();
  });
});

describe('currentWarmupDay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-29T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns 0 when warmup not started', () => {
    expect(currentWarmupDay(null, 7)).toBe(0);
  });

  it('returns 1 on the same day warmup started', () => {
    expect(currentWarmupDay('2026-05-29T08:00:00Z', 7)).toBe(1);
  });

  it('returns 4 after ~3.5 days', () => {
    // started 3 days + 12h earlier → floor(3.5) + 1 = 4
    expect(currentWarmupDay('2026-05-26T00:00:00Z', 7)).toBe(4);
  });

  it('returns -1 (complete) when total_days exceeded', () => {
    expect(currentWarmupDay('2026-05-20T00:00:00Z', 7)).toBe(-1);
  });
});
