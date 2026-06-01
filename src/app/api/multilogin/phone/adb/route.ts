import { NextResponse } from 'next/server';
import { z } from 'zod';
import { MultiloginCloudPhoneProvider } from '@/lib/accounts/providers/multilogin';
import { logger } from '@/lib/log';

const log = logger('api/multilogin/phone/adb');

const schema = z.object({
  profile_id: z.string().min(1),
  enabled: z.boolean(),
  /** If true (default), wait for the phone to reach status=0 before toggling. */
  wait_for_running: z.boolean().optional().default(true),
});

interface AdbInfoResp {
  data?: {
    items?: Array<{
      id: string;
      status: string;
      code?: number;
      adb_host?: string;
      adb_port?: number;
    }>;
  };
}

/**
 * Toggle ADB on a running Cloud Phone.
 *
 * Pipeline: optional waitForMobileRunning → setMobileAdb → poll adbInfo until
 * host:port appears (or 15s timeout). Returns adb connection details so the
 * caller can dispatch them to the ADB driver.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { profile_id, enabled, wait_for_running } = schema.parse(body);
    const ml = new MultiloginCloudPhoneProvider();

    if (wait_for_running && enabled) {
      await ml.waitForMobileRunning(profile_id);
    }

    const result = await ml.setMobileAdb([profile_id], enabled);
    if (result.fail_amount > 0) {
      const fail = result.fail_details[0];
      log.warn('adb toggle failed', { profile_id, code: fail?.code, msg: fail?.msg });
      return NextResponse.json(
        { ok: false, profile_id, fail: fail ?? null },
        { status: 502 },
      );
    }

    let adb: AdbInfoResp = {};
    if (enabled) {
      const start = performance.now();
      while (performance.now() - start < 15_000) {
        adb = (await ml.mobileAdbInfo([profile_id])) as AdbInfoResp;
        const item = adb.data?.items?.find((it) => it.id === profile_id);
        if (item && item.status !== 'disabled') break;
        await new Promise((r) => setTimeout(r, 1_500));
      }
    } else {
      adb = (await ml.mobileAdbInfo([profile_id])) as AdbInfoResp;
    }

    log.info('adb toggled', { profile_id, enabled });
    return NextResponse.json({ ok: true, profile_id, enabled, adb });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: 'Invalid request', details: z.prettifyError(err) },
        { status: 400 },
      );
    }
    log.error('adb toggle error', { error: (err as Error).message });
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
