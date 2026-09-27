import { NextResponse } from 'next/server';
import { mobileClient, unauthorized } from '@/lib/mobile/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { supabase, user } = await mobileClient();
  if (!user) return unauthorized();

  const { data: lists, error } = await supabase
    .from('lead_lists')
    .select('id, name')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ lists: [], error: error.message });

  const { data: rows } = await supabase
    .from('leads')
    .select('list_id, phone, sms_opt_out')
    .eq('user_id', user.id)
    .not('list_id', 'is', null)
    .not('phone', 'is', null)
    .not('phone', 'eq', '');

  const counts: Record<string, number> = {};
  for (const r of rows ?? []) {
    if (!r.list_id || r.sms_opt_out) continue;
    counts[r.list_id] = (counts[r.list_id] ?? 0) + 1;
  }

  return NextResponse.json({
    lists: (lists ?? []).map(l => ({
      id: l.id,
      name: l.name,
      phoneCount: counts[l.id] ?? 0,
    })),
  });
}
