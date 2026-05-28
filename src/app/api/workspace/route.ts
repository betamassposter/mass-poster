import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/db/admin';
import { CURRENT_WORKSPACE_ID } from '@/lib/db/workspace';

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  monthly_budget_eur: z.number().min(0).max(100000).optional(),
});

export async function PATCH(req: Request) {
  await requireSession();
  try {
    const body = await req.json();
    const parsed = patchSchema.parse(body);
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('workspace')
      .update(parsed)
      .eq('id', CURRENT_WORKSPACE_ID);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
