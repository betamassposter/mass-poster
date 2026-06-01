import { AdbDriver } from './adb';
import { logger } from '../log';
import { MultiloginCloudPhoneProvider } from '../accounts/providers/multilogin';
import { getDailyWarmup, type WarmupAction, type WarmupDay } from '../accounts/warmup-recipes';
import type { Platform } from '../accounts/types';
import {
  closeInstagram,
  doubleTapLike,
  isInstagramForeground,
  openInstagram,
  saveCurrentPost,
  scrollFeed,
  tapHomeTab,
  tapReelsTab,
} from './instagram';
import { humanScrollFeed, sleep } from './humanize';

const log = logger('warmup-runner');

export interface WarmupRunResult {
  profile_id: string;
  platform: Platform;
  day: number;
  total_session_min: number;
  actions_executed: Array<{
    action: WarmupAction;
    ok: boolean;
    result?: unknown;
    error?: string;
    elapsed_ms: number;
  }>;
  total_elapsed_ms: number;
  notes: string;
}

const SUPPORTED_ACTIONS: Array<WarmupAction['type']> = ['scroll', 'like', 'save'];

/**
 * Execute a single day's warmup recipe on a running Cloud Phone.
 *
 * Caller pre-conditions:
 *   - Phone is running (status=0) — wait via /api/multilogin/phone/status
 *   - ADB is enabled — POST /api/multilogin/phone/adb { enabled: true }
 *   - The target social app is installed + logged in on the phone
 *
 * Currently supports the subset of WarmupAction the user authorized for
 * full automation: scroll, like, save. Other actions (follow/comment/
 * profile_setup) are skipped and recorded as ok=false with note "manual".
 */
export async function runWarmupDay(opts: {
  profile_id: string;
  platform: Platform;
  day: number;
}): Promise<WarmupRunResult> {
  const recipe = getDailyWarmup(opts.platform, opts.day);
  if (!recipe) {
    throw new Error(
      `No warmup recipe for ${opts.platform} day ${opts.day} (likely past the warmup window).`,
    );
  }
  if (opts.platform !== 'instagram') {
    throw new Error(
      `Warmup automation currently supports instagram only — ${opts.platform} requires the platform-specific runner.`,
    );
  }
  return runInstagramDay(opts.profile_id, recipe);
}

async function runInstagramDay(
  profileId: string,
  day: WarmupDay,
): Promise<WarmupRunResult> {
  const adb = new AdbDriver(profileId);
  await adb.ensureConnected();
  log.info('warmup start', { profile: profileId, day: day.day });

  const start = Date.now();
  const executed: WarmupRunResult['actions_executed'] = [];

  await openInstagram(adb);
  if (!(await isInstagramForeground(adb))) {
    throw new Error('Instagram not foreground after launch — app missing or not logged in?');
  }

  const likeBudget = sumByType(day.actions, 'like');
  const saveBudget = sumByType(day.actions, 'save');
  const totalScrollSec = day.actions
    .filter((a): a is Extract<WarmupAction, { type: 'scroll' }> => a.type === 'scroll')
    .reduce((a, b) => a + b.duration_sec, 0);

  for (const action of day.actions) {
    const aStart = Date.now();
    try {
      if (!SUPPORTED_ACTIONS.includes(action.type)) {
        executed.push({
          action,
          ok: false,
          error: 'manual: action type not automated',
          elapsed_ms: 0,
        });
        continue;
      }
      let result: unknown = null;
      if (action.type === 'scroll') {
        const likeChance =
          totalScrollSec > 0 ? likeBudget / Math.max(totalScrollSec / 4, 1) : 0;
        const saveChance =
          totalScrollSec > 0 ? saveBudget / Math.max(totalScrollSec / 4, 1) : 0;
        result = await scrollFeed(adb, action.duration_sec * 1000, {
          likeChance: Math.min(likeChance, 0.4),
          saveChance: Math.min(saveChance, 0.2),
        });
      } else if (action.type === 'like') {
        for (let i = 0; i < action.count; i++) {
          await humanScrollFeed(adb, 1);
          const { width, height } = await adb.screenSize();
          await doubleTapLike(adb, width / 2, height * 0.42);
          await sleep(1200, 3500);
        }
        result = { likes: action.count };
      } else if (action.type === 'save') {
        for (let i = 0; i < action.count; i++) {
          await humanScrollFeed(adb, 1);
          await saveCurrentPost(adb);
          await sleep(1500, 3500);
        }
        result = { saves: action.count };
      }
      executed.push({ action, ok: true, result, elapsed_ms: Date.now() - aStart });
    } catch (e) {
      executed.push({
        action,
        ok: false,
        error: (e as Error).message,
        elapsed_ms: Date.now() - aStart,
      });
    }
  }

  await closeInstagram(adb);

  return {
    profile_id: profileId,
    platform: 'instagram',
    day: day.day,
    total_session_min: day.total_session_min,
    actions_executed: executed,
    total_elapsed_ms: Date.now() - start,
    notes: day.notes,
  };
}

function sumByType<T extends WarmupAction['type']>(
  actions: WarmupAction[],
  type: T,
): number {
  return actions
    .filter((a) => a.type === type)
    .reduce((acc, a) => acc + ('count' in a ? a.count : 0), 0);
}

/**
 * Full pipeline: ensure phone running → enable ADB → run warmup day → stop phone.
 *
 * The "stop phone" step is on by default to halt per-minute billing. Pass
 * `keep_running: true` to leave the phone up after the run.
 */
export async function runWarmupFull(opts: {
  profile_id: string;
  platform: Platform;
  day: number;
  keep_running?: boolean;
}): Promise<WarmupRunResult & { phone_minutes_used?: number }> {
  const ml = new MultiloginCloudPhoneProvider();
  await ml.launchMobile([opts.profile_id]);
  await ml.waitForMobileRunning(opts.profile_id);
  await ml.setMobileAdb([opts.profile_id], true);
  await sleep(2_000, 4_000);

  const result = await runWarmupDay({
    profile_id: opts.profile_id,
    platform: opts.platform,
    day: opts.day,
  });

  if (!opts.keep_running) {
    await ml.shutdownMobile([opts.profile_id]);
  }
  return result;
}
