import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/admin';
import { CURRENT_WORKSPACE_ID } from '@/lib/db/workspace';
import { requireSession } from '@/lib/auth/session';
import { revokeApiKey } from '@/lib/api-keys/manager';

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await ctx.params;

  const supabase = getSupabaseAdmin();
  // Verify the key belongs to the current workspace before revoking
  const { data: row } = await supabase
    .from('api_key')
    .select('id, workspace_id')
    .eq('id', id)
    .maybeSingle();
  if (!row || row.workspace_id !== CURRENT_WORKSPACE_ID) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await revokeApiKey(supabase, id);
  return NextResponse.json({ ok: true });
}
