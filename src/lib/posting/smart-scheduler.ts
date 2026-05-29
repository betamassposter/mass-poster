import type { SupabaseClient } from '@supabase/supabase-js';
import type { Platform } from './types.ts';

/**
 * Smart scheduling — distribute N posts across accounts and time without
 * patterns that IG/TT detect as bot activity.
 *
 * Rules:
 *  1. Per-platform daily cadence cap (IG: 2/day, TT: 4/day, YT: 1/day, X: 5/day, LI: 1/day)
 *  2. Min gap between two posts from same account (1.5h default)
 *  3. Min gap between two posts on same brand+platform across accounts (15 min)
 *  4. Jitter ±15min on each slot to avoid second-precise pattern
 *  5. Respect each account's daily_post_cap
 *  6. Avoid burst windows: max 3 posts brand-wide per 30min window
 *  7. Prefer healthier accounts (use health_score)
 *  8. Posting window: 8:00-23:00 local timezone (no 3am bot pattern)
 */

const PLATFORM_DAILY_CAP: Record<Platform, number> = {
  instagram: 2,
  tiktok: 4,
  youtube_shorts: 1,
  x: 5,
  linkedin: 1,
  facebook: 2,
};

const POSTING_HOUR_START = 8; // 08:00 local
const POSTING_HOUR_END = 23; // 23:00 local
const MIN_GAP_SAME_ACCOUNT_MS = 90 * 60 * 1000; // 1.5h
const MIN_GAP_SAME_BRAND_PLATFORM_MS = 15 * 60 * 1000; // 15min
const BURST_WINDOW_MS = 30 * 60 * 1000;
const MAX_PER_BURST_WINDOW = 3;
const JITTER_RANGE_MS = 15 * 60 * 1000; // ±15min

export interface AccountForScheduling {
  id: string;
  platform: Platform;
  daily_post_cap: number;
  health_score: number;
  status: string;
  brand_id: string;
}

export interface PlannedSlot {
  account_id: string;
  scheduled_at: Date;
  content_index: number;
  rationale: string;
}

export interface SchedulePlan {
  slots: PlannedSlot[];
  unscheduled_content: number[];
  warnings: string[];
}

export interface PlanOptions {
  /** Content IDs (or just indices) to schedule. */
  content_count: number;
  /** Start of the planning window. Default: now (or next available 08:00). */
  start: Date;
  /** End of the window. Default: start + 24h. */
  end: Date;
  /** Random seed for jitter reproducibility. */
  seed?: number;
}

/**
 * Plan a schedule given a set of healthy accounts and a content batch.
 *
 * Returns a list of slots (account + datetime) plus warnings (unscheduled content).
 */
export function planSchedule(
  accounts: AccountForScheduling[],
  options: PlanOptions,
  existingPostsByAccount: Map<string, Date[]> = new Map(),
): SchedulePlan {
  const warnings: string[] = [];
  const slots: PlannedSlot[] = [];
  const seed = options.seed ?? Date.now();
  const rng = mulberry32(seed);

  // Filter healthy + active accounts
  const eligibleAccounts = accounts
    .filter((a) => a.status === 'active' && a.health_score >= 50)
    .sort((a, b) => b.health_score - a.health_score);

  if (eligibleAccounts.length === 0) {
    return {
      slots: [],
      unscheduled_content: Array.from({ length: options.content_count }, (_, i) => i),
      warnings: ['No active accounts with health_score >= 50'],
    };
  }

  // Track per-account post counts (today) and last-post timestamps
  const todayCount = new Map<string, number>();
  const lastPostTime = new Map<string, Date>();
  for (const acct of eligibleAccounts) {
    todayCount.set(acct.id, 0);
    const past = existingPostsByAccount.get(acct.id) ?? [];
    if (past.length > 0) {
      lastPostTime.set(acct.id, past[past.length - 1]!);
    }
  }

  // Track brand+platform congestion (for cross-account burst prevention)
  const brandPlatformTimes = new Map<string, Date[]>(); // key: `${brand_id}|${platform}`
  // Track overall burst window (anywhere in workspace)
  const allScheduled: Date[] = [];

  // Build available time slots: every 15 min from start to end, within 08-23h
  const candidateTimes: Date[] = [];
  for (
    let t = new Date(options.start.getTime());
    t < options.end;
    t = new Date(t.getTime() + 15 * 60 * 1000)
  ) {
    const hour = t.getHours();
    if (hour >= POSTING_HOUR_START && hour < POSTING_HOUR_END) {
      candidateTimes.push(new Date(t));
    }
  }

  if (candidateTimes.length === 0) {
    warnings.push('No candidate times in 08-23h window — adjust start/end');
    return { slots, unscheduled_content: Array.from({ length: options.content_count }, (_, i) => i), warnings };
  }

  // Round-robin content over accounts, scoring each slot
  for (let i = 0; i < options.content_count; i++) {
    let best: { acct: AccountForScheduling; time: Date; score: number; reason: string } | null = null;

    for (const acct of eligibleAccounts) {
      // Skip if already at daily cap
      const platformCap = Math.min(acct.daily_post_cap, PLATFORM_DAILY_CAP[acct.platform]);
      if ((todayCount.get(acct.id) ?? 0) >= platformCap) continue;

      const lastTime = lastPostTime.get(acct.id);

      for (const candidate of candidateTimes) {
        // Min gap from last post on this account
        if (lastTime && candidate.getTime() - lastTime.getTime() < MIN_GAP_SAME_ACCOUNT_MS) {
          continue;
        }
        // Min gap from any post on same brand+platform
        const bpKey = `${acct.brand_id}|${acct.platform}`;
        const bpTimes = brandPlatformTimes.get(bpKey) ?? [];
        const tooClose = bpTimes.some(
          (t) => Math.abs(t.getTime() - candidate.getTime()) < MIN_GAP_SAME_BRAND_PLATFORM_MS,
        );
        if (tooClose) continue;

        // Burst-window check: no more than MAX_PER_BURST_WINDOW within ±30min
        const burstCount = allScheduled.filter(
          (t) => Math.abs(t.getTime() - candidate.getTime()) < BURST_WINDOW_MS,
        ).length;
        if (burstCount >= MAX_PER_BURST_WINDOW) continue;

        // Apply jitter (deterministic) to spread within the 15-min slot
        const jitter = (rng() - 0.5) * 2 * JITTER_RANGE_MS;
        const finalTime = new Date(candidate.getTime() + jitter);
        if (finalTime < options.start || finalTime > options.end) continue;

        // Score: prefer earlier slots + healthier accounts (small tiebreaker)
        const score = -finalTime.getTime() + acct.health_score * 60_000;
        if (!best || score > best.score) {
          best = {
            acct,
            time: finalTime,
            score,
            reason: `health=${acct.health_score} burst=${burstCount}/${MAX_PER_BURST_WINDOW}`,
          };
        }
      }
    }

    if (!best) {
      warnings.push(`No slot for content ${i} — try widening time window or adding accounts`);
      continue;
    }

    slots.push({
      account_id: best.acct.id,
      scheduled_at: best.time,
      content_index: i,
      rationale: best.reason,
    });

    // Update trackers
    todayCount.set(best.acct.id, (todayCount.get(best.acct.id) ?? 0) + 1);
    lastPostTime.set(best.acct.id, best.time);
    const bpKey = `${best.acct.brand_id}|${best.acct.platform}`;
    brandPlatformTimes.set(bpKey, [...(brandPlatformTimes.get(bpKey) ?? []), best.time]);
    allScheduled.push(best.time);
  }

  const unscheduled = Array.from({ length: options.content_count }, (_, i) => i).filter(
    (i) => !slots.some((s) => s.content_index === i),
  );

  return { slots, unscheduled_content: unscheduled, warnings };
}

/** Mulberry32 — small, fast, deterministic PRNG from a 32-bit seed. */
function mulberry32(seed: number) {
  let s = seed >>> 0;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Load existing posts per account from DB so the planner respects already-scheduled work.
 */
export async function fetchExistingPostsByAccount(
  supabase: SupabaseClient,
  workspace_id: string,
  account_ids: string[],
  after: Date,
  before: Date,
): Promise<Map<string, Date[]>> {
  const { data } = await supabase
    .from('post')
    .select('account_id, scheduled_at, status')
    .eq('workspace_id', workspace_id)
    .in('account_id', account_ids)
    .in('status', ['scheduled', 'publishing', 'published'])
    .gte('scheduled_at', after.toISOString())
    .lte('scheduled_at', before.toISOString());

  const map = new Map<string, Date[]>();
  for (const p of data ?? []) {
    const arr = map.get(p.account_id) ?? [];
    arr.push(new Date(p.scheduled_at));
    map.set(p.account_id, arr);
  }
  for (const v of map.values()) v.sort((a, b) => a.getTime() - b.getTime());
  return map;
}
