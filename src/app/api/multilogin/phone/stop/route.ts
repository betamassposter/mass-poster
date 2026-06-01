import { NextResponse } from 'next/server';
import { z } from 'zod';
import { MultiloginCloudPhoneProvider } from '@/lib/accounts/providers/multilogin';
import { logger } from '@/lib/log';

const log = logger('api/multilogin/phone/stop');

const schema = z.object({
  profile_id: z.string().min(1),
});

/** Stop a running Multilogin Cloud Phone (halts per-minute billing). */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { profile_id } = schema.parse(body);
    const ml = new MultiloginCloudPhoneProvider();
    await ml.shutdownMobile([profile_id]);
    log.info('phone stopped', { profile_id });
    return NextResponse.json({ ok: true, profile_id });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: 'Invalid request', details: z.prettifyError(err) },
        { status: 400 },
      );
    }
    log.error('phone stop failed', { error: (err as Error).message });
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
