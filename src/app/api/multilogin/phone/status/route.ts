import { NextResponse } from 'next/server';
import { MultiloginCloudPhoneProvider } from '@/lib/accounts/providers/multilogin';

/**
 * GET /api/multilogin/phone/status?profile_id=…
 *
 * Returns the run-state + adb info + minutes budget. Polled by the UI to
 * detect "phone booted" before driving ADB automation.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const profile_id = url.searchParams.get('profile_id');
    if (!profile_id) {
      return NextResponse.json({ ok: false, error: 'profile_id required' }, { status: 400 });
    }
    const ml = new MultiloginCloudPhoneProvider();
    const [statuses, adb, minutes] = await Promise.all([
      ml.mobileStatuses([profile_id]),
      ml.mobileAdbInfo([profile_id]),
      ml.mobileMinutesLimit().catch(() => null),
    ]);
    return NextResponse.json({ ok: true, profile_id, statuses, adb, minutes });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
