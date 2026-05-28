import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/db/admin';
import { CURRENT_WORKSPACE_ID } from '@/lib/db/workspace';
import { getProxyProvider } from '@/lib/accounts/client';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  try {
    const { id } = await params;
    const supabase = getSupabaseAdmin();

    const { data: row, error } = await supabase
      .from('proxy')
      .select('id, status, provider, host, port, username, password_encrypted, country')
      .eq('id', id)
      .eq('workspace_id', CURRENT_WORKSPACE_ID)
      .single();
    if (error || !row) {
      return NextResponse.json({ ok: false, error: 'Proxy not found' }, { status: 404 });
    }
    if (row.status === 'in_use') {
      return NextResponse.json(
        { ok: false, error: 'Proxy is bound to an account — unbind it first' },
        { status: 409 },
      );
    }

    const provider = getProxyProvider();
    if (provider.releaseProxy) {
      try {
        await provider.releaseProxy({
          host: row.host,
          port: row.port,
          username: row.username ?? undefined,
          password: row.password_encrypted ?? undefined,
          type: 'http',
          country: row.country ?? undefined,
          provider: row.provider,
        });
      } catch {
        // Continue with DB delete even if vendor release fails — log via UI toast.
      }
    }

    await supabase
      .from('proxy')
      .delete()
      .eq('id', id)
      .eq('workspace_id', CURRENT_WORKSPACE_ID);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
