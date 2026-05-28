import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/db/admin';
import { CURRENT_WORKSPACE_ID } from '@/lib/db/workspace';
import { AccountOrchestrator } from '@/lib/accounts/orchestrator';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  try {
    const { id } = await params;
    const supabase = getSupabaseAdmin();
    const orchestrator = new AccountOrchestrator(supabase, CURRENT_WORKSPACE_ID);
    const verdict = await orchestrator.validateProxy(id, 'manual');
    return NextResponse.json({
      ok: true,
      verdict: verdict.status,
      ip: verdict.ip,
      clean: verdict.clean,
      failure_reasons: verdict.failure_reasons,
      duration_ms: verdict.duration_ms,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
