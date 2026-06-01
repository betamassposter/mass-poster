import { AdbDriver } from './adb';
import { humanLongPress, humanScrollFeed, humanSwipe, humanTap, rand, sleep } from './humanize';

const IG_PACKAGE = 'com.instagram.android';

/** Bring Instagram to foreground; install/login is precondition (manual). */
export async function openInstagram(adb: AdbDriver): Promise<void> {
  await adb.startApp(IG_PACKAGE);
  await sleep(2500, 4500);
}

export async function closeInstagram(adb: AdbDriver): Promise<void> {
  await adb.shell(`am force-stop ${IG_PACKAGE}`);
}

/** Verify IG is the foreground app (returns true if currently running). */
export async function isInstagramForeground(adb: AdbDriver): Promise<boolean> {
  const pkg = await adb.currentForegroundApp();
  return pkg === IG_PACKAGE;
}

/**
 * Scroll the IG feed for `durationMs`. Performs random-sized swipes with
 * natural dwell between each — emulates browsing rhythm.
 */
export async function scrollFeed(
  adb: AdbDriver,
  durationMs: number,
  opts: { likeChance?: number; saveChance?: number } = {},
): Promise<{ likes: number; saves: number; scrolls: number }> {
  const likeChance = opts.likeChance ?? 0;
  const saveChance = opts.saveChance ?? 0;
  const { width, height } = await adb.screenSize();
  const start = Date.now();
  let likes = 0;
  let saves = 0;
  let scrolls = 0;
  while (Date.now() - start < durationMs) {
    if (likeChance > 0 && Math.random() < likeChance) {
      await doubleTapLike(adb, width / 2, height * 0.45);
      likes++;
      await sleep(800, 2000);
    }
    if (saveChance > 0 && Math.random() < saveChance) {
      const ok = await saveCurrentPost(adb);
      if (ok) saves++;
      await sleep(800, 2000);
    }
    await humanScrollFeed(adb, 1, { betweenSwipeMs: [2200, 6500] });
    scrolls++;
    if (Math.random() < 0.12) await sleep(3000, 8000);
  }
  return { likes, saves, scrolls };
}

/** Double-tap to like at (x,y). IG's gesture handler accepts 2 taps <300ms apart. */
export async function doubleTapLike(adb: AdbDriver, x: number, y: number): Promise<void> {
  await adb.tap(x, y);
  await sleep(60, 140);
  await adb.tap(x, y);
}

/**
 * Tap the heart icon on the currently-visible post.
 *
 * IG's heart is at a stable relative position bottom-left of each post.
 * Approximate: x≈8% of width, y depends on layout but the standard
 * action row sits ~16-22% from bottom.
 */
export async function likeCurrentPost(adb: AdbDriver): Promise<void> {
  const { width, height } = await adb.screenSize();
  const x = width * 0.085;
  const y = height * 0.78;
  await humanTap(adb, x, y);
}

/**
 * Tap the bookmark icon. Mirror of likeCurrentPost — bookmark sits
 * right-aligned on the action row.
 */
export async function saveCurrentPost(adb: AdbDriver): Promise<boolean> {
  const { width, height } = await adb.screenSize();
  const x = width * 0.91;
  const y = height * 0.78;
  await humanTap(adb, x, y);
  return true;
}

/** Tap the Home tab in the bottom navigation. */
export async function tapHomeTab(adb: AdbDriver): Promise<void> {
  const { width, height } = await adb.screenSize();
  await humanTap(adb, width * 0.1, height * 0.96);
}

/** Tap the Reels tab (4th icon in bottom nav). */
export async function tapReelsTab(adb: AdbDriver): Promise<void> {
  const { width, height } = await adb.screenSize();
  await humanTap(adb, width * 0.5, height * 0.96);
}

/**
 * Scroll the Reels feed. Reels use vertical swipes too but each "page" is
 * one full reel — so swipe range is taller.
 */
export async function scrollReels(
  adb: AdbDriver,
  durationMs: number,
  opts: { likeChance?: number } = {},
): Promise<{ likes: number; scrolls: number }> {
  const likeChance = opts.likeChance ?? 0;
  const { width, height } = await adb.screenSize();
  const cx = width / 2;
  const start = Date.now();
  let likes = 0;
  let scrolls = 0;
  while (Date.now() - start < durationMs) {
    const dwell = rand(4000, 12_000);
    await sleep(dwell);
    if (likeChance > 0 && Math.random() < likeChance) {
      await doubleTapLike(adb, cx, height * 0.5);
      likes++;
      await sleep(500, 1500);
    }
    await humanSwipe(adb, cx, height * 0.78, cx, height * 0.22, {
      durationMs: [320, 580],
      postDelayMs: [400, 900],
    });
    scrolls++;
  }
  return { likes, scrolls };
}
