import { NextResponse } from 'next/server';
import { z } from 'zod';
import { MultiloginCloudPhoneProvider } from '@/lib/accounts/providers/multilogin';
import { logger } from '@/lib/log';

const log = logger('api/multilogin/phone/start');

const schema = z.object({
  profile_id: z.string().min(1),
});

/**
 * Launch a Multilogin Cloud Phone for the given mobile profile.
 *
 * Starts the per-minute billing meter. The phone boots ~20-30s; poll
 * /api/multilogin/phone/status?profile_id=… until ADB info is "enabled"
 * before driving the device.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { profile_id } = schema.parse(body);
    const ml = new MultiloginCloudPhoneProvider();
    const result = await ml.launchMobile([profile_id]);
    log.info('phone launched', { profile_id });
    return NextResponse.json({ ok: true, profile_id, result: result.data });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: 'Invalid request', details: z.prettifyError(err) },
        { status: 400 },
      );
    }
    log.error('phone launch failed', { error: (err as Error).message });
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
