import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/db/admin';
import { CURRENT_WORKSPACE_ID } from '@/lib/db/workspace';
import { AccountOrchestrator } from '@/lib/accounts/orchestrator';

const schema = z.object({
  count: z.number().int().min(1).max(50),
  country: z.string().length(2).default('IT'),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = schema.parse(body);
    const supabase = getSupabaseAdmin();
    const orchestrator = new AccountOrchestrator(supabase, CURRENT_WORKSPACE_ID);
    const proxies = await orchestrator.provisionProxyPool(parsed.count, parsed.country);
    return NextResponse.json({ ok: true, count: proxies.length, proxies });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: 'Invalid request', details: z.prettifyError(err) },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
