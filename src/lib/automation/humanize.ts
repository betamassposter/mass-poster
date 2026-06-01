import { AdbDriver } from './adb';

/** Random delay in [minMs, maxMs]. */
export function rand(minMs: number, maxMs: number): number {
  return minMs + Math.random() * (maxMs - minMs);
}

/** Async sleep for [minMs, maxMs] (default range = realistic UI dwell). */
export async function sleep(minMs: number, maxMs?: number): Promise<void> {
  const ms = maxMs !== undefined ? rand(minMs, maxMs) : minMs;
  return new Promise((r) => setTimeout(r, ms));
}

/** Tap with small position jitter + variable dwell before/after. */
export async function humanTap(
  adb: AdbDriver,
  x: number,
  y: number,
  opts: { jitter?: number; preDelayMs?: [number, number]; postDelayMs?: [number, number] } = {},
): Promise<void> {
  const j = opts.jitter ?? 6;
  const px = x + rand(-j, j);
  const py = y + rand(-j, j);
  await sleep(...(opts.preDelayMs ?? [150, 450]));
  await adb.tap(px, py);
  await sleep(...(opts.postDelayMs ?? [400, 900]));
}

/**
 * Swipe with speed variance. A scroll feels human at ~250-500ms duration
 * over ~40-70% of the screen height.
 */
export async function humanSwipe(
  adb: AdbDriver,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { durationMs?: [number, number]; jitter?: number; postDelayMs?: [number, number] } = {},
): Promise<void> {
  const j = opts.jitter ?? 10;
  const dur = rand(...(opts.durationMs ?? [280, 520]));
  await adb.swipe(x1 + rand(-j, j), y1 + rand(-j, j), x2 + rand(-j, j), y2 + rand(-j, j), dur);
  await sleep(...(opts.postDelayMs ?? [700, 1500]));
}

/**
 * Scroll the feed by `times` finger-swipes with natural pauses between
 * each. `direction` 'up' scrolls content upward (next post).
 */
export async function humanScrollFeed(
  adb: AdbDriver,
  times: number,
  opts: { direction?: 'up' | 'down'; betweenSwipeMs?: [number, number] } = {},
): Promise<void> {
  const { width, height } = await adb.screenSize();
  const dir = opts.direction ?? 'up';
  const cx = width / 2;
  const yStart = dir === 'up' ? height * 0.75 : height * 0.25;
  const yEnd = dir === 'up' ? height * 0.25 : height * 0.75;
  for (let i = 0; i < times; i++) {
    await humanSwipe(adb, cx, yStart, cx, yEnd, {
      durationMs: [350, 600],
      postDelayMs: opts.betweenSwipeMs ?? [1500, 4500],
    });
  }
}

/** Type text character-by-character with realistic per-char delay. */
export async function humanType(adb: AdbDriver, text: string): Promise<void> {
  for (const ch of text) {
    await adb.type(ch);
    await sleep(80, 220);
  }
}

/** Press and release with a long-press dwell time. */
export async function humanLongPress(
  adb: AdbDriver,
  x: number,
  y: number,
  holdMs = 800,
): Promise<void> {
  await adb.swipe(x, y, x, y, holdMs);
  await sleep(400, 800);
}
