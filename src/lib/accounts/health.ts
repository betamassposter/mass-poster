import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Account health scoring (0-100).
 *
 * Composite of:
 *  - Age & warm-up completion (older + warmed-up = higher)
 *  - Posting frequency vs daily_post_cap (over-cap = penalty)
 *  - Recent rate-limit / ban-detection events (hits drop score fast)
 *  - Engagement velocity (when metric_snapshot data available)
 *  - Failed posts (in `post` table with status='failed')
 *
 * Used to:
 *  - Auto-pause accounts trending toward ban (score < 30)
 *  - Round-robin scheduler to prefer healthier accounts
 *  - Surface "burn rate" KPI in /accounts dashboard
 */

export interface HealthBreakdown {
  score: number;          // 0-100
  factors: {
    age_bonus: number;        // 0-15
    warmup_bonus: number;     // 0-10
    activity_health: number;  // -25 to +10 (penalty if over-cap)
    no_recent_errors: number; // -40 to +5
    failed_post_penalty: number; // -20 to 0
    explicit_status: number;  // -100 to 0 (banned/shadowbanned override)
  };
  signals: string[];        // human-readable summary
}

export interface AccountForHealth {
  id: string;
  status: string;
  warmup_started_at: string | null;
  activated_at: string | null;
  daily_post_cap: number;
  created_at: string;
  health_score: number;
}

const NOW = () => new Date();
const HOURS = (n: number) => n * 60 * 60 * 1000;
const DAYS = (n: number) => n * 24 * HOURS(1);

export async function computeHealthScore(
  supabase: SupabaseClient,
  account: AccountForHealth,
): Promise<HealthBreakdown> {
  const signals: string[] = [];
  const factors = {
    age_bonus: 0,
    warmup_bonus: 0,
    activity_health: 0,
    no_recent_errors: 0,
    failed_post_penalty: 0,
    explicit_status: 0,
  };

  // ── Explicit status override (banned/shadowbanned = floor) ─────────
  if (account.status === 'banned' || account.status === 'retired') {
    factors.explicit_status = -100;
    signals.push(`status=${account.status} — health floored`);
    return finalize(factors, signals);
  }
  if (account.status === 'shadowbanned') {
    factors.explicit_status = -50;
    signals.push('shadowbanned — major penalty');
  }

  // ── Age bonus (older account = more trust) ─────────────────────────
  const ageMs = NOW().getTime() - new Date(account.created_at).getTime();
  const ageDays = ageMs / DAYS(1);
  if (ageDays > 30) {
    factors.age_bonus = 15;
    signals.push(`age >30d (trusted)`);
  } else if (ageDays > 14) {
    factors.age_bonus = 10;
  } else if (ageDays > 7) {
    factors.age_bonus = 5;
  }

  // ── Warmup bonus ───────────────────────────────────────────────────
  if (account.activated_at) {
    factors.warmup_bonus = 10;
    signals.push('warmup completed');
  } else if (account.warmup_started_at) {
    const warmupMs = NOW().getTime() - new Date(account.warmup_started_at).getTime();
    const warmupDays = warmupMs / DAYS(1);
    if (warmupDays >= 7) {
      factors.warmup_bonus = 8;
      signals.push('warmup ≥ 7d (ready)');
    } else {
      factors.warmup_bonus = Math.round(warmupDays);
    }
  }

  // ── Activity health (posts in last 24h vs cap) ─────────────────────
  const since24h = new Date(NOW().getTime() - HOURS(24)).toISOString();
  const { count: posts24h } = await supabase
    .from('post')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', account.id)
    .in('status', ['published', 'publishing'])
    .gte('published_at', since24h);

  const ratio = (posts24h ?? 0) / Math.max(1, account.daily_post_cap);
  if (ratio === 0 && (account.status === 'active')) {
    factors.activity_health = -5; // active but idle = could be dormant
    signals.push('active but no posts 24h');
  } else if (ratio <= 1) {
    factors.activity_health = 10;
  } else if (ratio <= 1.5) {
    factors.activity_health = -5;
    signals.push(`over cap (${posts24h}/${account.daily_post_cap})`);
  } else {
    factors.activity_health = -25;
    signals.push(`SEVERELY over cap (${posts24h}/${account.daily_post_cap}) — burn risk`);
  }

  // ── Recent error events (account_event) ────────────────────────────
  const since7d = new Date(NOW().getTime() - DAYS(7)).toISOString();
  const { data: events } = await supabase
    .from('account_event')
    .select('event_type')
    .eq('account_id', account.id)
    .in('event_type', ['rate_limit', 'ban_detected', 'shadowban_suspected'])
    .gte('occurred_at', since7d);
  const errorCount = events?.length ?? 0;
  if (errorCount === 0) {
    factors.no_recent_errors = 5;
  } else if (errorCount === 1) {
    factors.no_recent_errors = -10;
    signals.push('1 rate-limit/shadowban event in 7d');
  } else if (errorCount <= 3) {
    factors.no_recent_errors = -25;
    signals.push(`${errorCount} platform events in 7d`);
  } else {
    factors.no_recent_errors = -40;
    signals.push(`${errorCount} platform events in 7d — high risk`);
  }

  // ── Failed posts (publish failures recent) ─────────────────────────
  const { count: failed7d } = await supabase
    .from('post')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', account.id)
    .eq('status', 'failed')
    .gte('updated_at', since7d);

  if ((failed7d ?? 0) >= 3) {
    factors.failed_post_penalty = -20;
    signals.push(`${failed7d} failed posts last 7d`);
  } else if ((failed7d ?? 0) >= 1) {
    factors.failed_post_penalty = -8;
  }

  return finalize(factors, signals);
}

function finalize(
  factors: HealthBreakdown['factors'],
  signals: string[],
): HealthBreakdown {
  const sum = Object.values(factors).reduce((s, v) => s + v, 0);
  const score = Math.max(0, Math.min(100, 60 + sum)); // baseline 60 + factors
  return { score, factors, signals };
}

/**
 * Recompute health for all accounts in a workspace and persist `health_score`.
 * Run via cron / CLI / on-demand from UI.
 */
export async function recomputeAllHealth(
  supabase: SupabaseClient,
  workspace_id: string,
): Promise<Array<{ account_id: string; old: number; new: number; signals: string[] }>> {
  const { data: accounts } = await supabase
    .from('account')
    .select('id, status, warmup_started_at, activated_at, daily_post_cap, created_at, health_score')
    .eq('workspace_id', workspace_id);

  const results: Array<{ account_id: string; old: number; new: number; signals: string[] }> = [];

  for (const acct of accounts ?? []) {
    const breakdown = await computeHealthScore(supabase, acct as AccountForHealth);
    const oldScore = (acct as AccountForHealth).health_score;
    if (oldScore !== breakdown.score) {
      await supabase
        .from('account')
        .update({ health_score: breakdown.score })
        .eq('id', acct.id)
        .eq('workspace_id', workspace_id);
    }
    results.push({
      account_id: acct.id,
      old: oldScore,
      new: breakdown.score,
      signals: breakdown.signals,
    });
  }
  return results;
}
