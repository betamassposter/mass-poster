import { NextResponse } from 'next/server';
import { z } from 'zod';
import { runWarmupFull } from '@/lib/automation/warmup-runner';
import { logger } from '@/lib/log';

const log = logger('api/automation/warmup/run');

const schema = z.object({
  profile_id: z.string().min(1),
  platform: z.enum(['instagram', 'tiktok', 'youtube_shorts', 'linkedin', 'x', 'facebook']),
  day: z.number().int().min(1).max(7),
  keep_running: z.boolean().optional().default(false),
});

/**
 * Run one day of warmup recipe on a Cloud Phone.
 *
 * Long-running endpoint — Instagram day 1 takes ~15 min of session time.
 * Caller should set a long timeout (30+ min) and surface progress via
 * the response payload's actions_executed array.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = schema.parse(body);
    log.info('warmup run start', parsed);
    const result = await runWarmupFull(parsed);
    log.info('warmup run done', {
      profile_id: parsed.profile_id,
      elapsed_min: Math.round(result.total_elapsed_ms / 60_000),
      actions_ok: result.actions_executed.filter((a) => a.ok).length,
      actions_failed: result.actions_executed.filter((a) => !a.ok).length,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: 'Invalid request', details: z.prettifyError(err) },
        { status: 400 },
      );
    }
    log.error('warmup run failed', { error: (err as Error).message });
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}

export const maxDuration = 1800;
