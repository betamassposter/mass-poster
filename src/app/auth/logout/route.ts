import { NextResponse } from 'next/server';
import { getSupabaseRouteClient } from '@/lib/auth/session';

export async function POST(req: Request) {
  const supabase = await getSupabaseRouteClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/login', req.url), { status: 303 });
}
