import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/db/admin';
import { CURRENT_WORKSPACE_ID } from '@/lib/db/workspace';
import { getProxyProvider } from '@/lib/accounts/client';
import { AccountOrchestrator } from '@/lib/accounts/orchestrator';

/**
 * Force IP rotation on a mobile proxy session, then re-run the reputation
 * gate against the new egress IP. Persists the new verdict and increments
 * rotation_count.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  try {
    const { id } = await params;
    const supabase = getSupabaseAdmin();

    const { data: row, error } = await supabase
      .from('proxy')
      .select('id, provider, host, port, username, password_encrypted, country, rotation_count')
      .eq('id', id)
      .eq('workspace_id', CURRENT_WORKSPACE_ID)
      .single();
    if (error || !row) {
      return NextResponse.json({ ok: false, error: 'Proxy not found' }, { status: 404 });
    }

    const provider = getProxyProvider();
    if (!provider.rotateIp) {
      return NextResponse.json(
        { ok: false, error: `Provider ${provider.name} does not support rotation` },
        { status: 400 },
      );
    }

    const rotation = await provider.rotateIp({
      host: row.host,
      port: row.port,
      username: row.username ?? undefined,
      password: row.password_encrypted ?? undefined,
      type: 'http',
      country: row.country ?? undefined,
      provider: row.provider,
    });

    if (!rotation.ok) {
      return NextResponse.json({ ok: false, error: 'Rotation failed at vendor' }, { status: 502 });
    }

    await supabase
      .from('proxy')
      .update({ rotation_count: (row.rotation_count ?? 0) + 1 })
      .eq('id', id)
      .eq('workspace_id', CURRENT_WORKSPACE_ID);

    const orchestrator = new AccountOrchestrator(supabase, CURRENT_WORKSPACE_ID);
    const verdict = await orchestrator.validateProxy(id, 'post_rotation');

    return NextResponse.json({
      ok: true,
      rotated: true,
      new_ip: rotation.new_ip ?? verdict.ip,
      verdict: verdict.status,
      clean: verdict.clean,
      failure_reasons: verdict.failure_reasons,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
