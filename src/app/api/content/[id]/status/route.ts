import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/db/admin';
import { CURRENT_WORKSPACE_ID } from '@/lib/db/workspace';

const schema = z.object({
  status: z.enum(['draft', 'generated', 'approved', 'published', 'archived', 'rejected']),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const body = await req.json();
    const { status } = schema.parse(body);
    const { error } = await getSupabaseAdmin()
      .from('content')
      .update({ status })
      .eq('id', id)
      .eq('workspace_id', CURRENT_WORKSPACE_ID);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: 'Invalid status' }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
