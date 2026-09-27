import { NextResponse } from 'next/server';
import { mobileClient, unauthorized } from '@/lib/mobile/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { supabase, user } = await mobileClient();
  if (!user) return unauthorized();

  const { data, error } = await supabase
    .from('text_templates')
    .select('id, name, body')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ templates: [], error: error.message });
  return NextResponse.json({ templates: data ?? [] });
}
