import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseRouteClient } from '@/lib/auth/session';

const schema = z.object({
  email: z.email(),
  return_to: z.string().default('/'),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, return_to } = schema.parse(body);
    const supabase = await getSupabaseRouteClient();

    const origin = new URL(req.url).origin;
    const emailRedirectTo = `${origin}/auth/callback?return_to=${encodeURIComponent(return_to)}`;

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo,
        shouldCreateUser: true,
      },
    });
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: 'Invalid email' },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
