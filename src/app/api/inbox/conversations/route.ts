import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // All CRM leads (month_key set) with phone numbers
    // Note: sms_opt_out omitted here — added separately once column exists
    const { data: leads, error } = await supabase
      .from('leads')
      .select('id, name, company, phone, stage, month_key, last_contact, notes')
      .eq('user_id', user.id)
      .not('phone', 'is', null)
      .not('phone', 'eq', '')
      .not('month_key', 'is', null)
      .order('last_contact', { ascending: false, nullsFirst: false });

    if (error) {
      console.error('[inbox/conversations] leads query error:', error.message);
      return NextResponse.json({ leads: [], phoneConnection: null, dbError: error.message });
    }

    // Try to get opt-out status (column may not exist until SQL is run)
    let optOutMap: Record<string, boolean> = {};
    try {
      const { data: optOuts } = await supabase
        .from('leads')
        .select('id, sms_opt_out')
        .eq('user_id', user.id)
        .not('month_key', 'is', null);
      for (const r of optOuts ?? []) {
        optOutMap[r.id] = r.sms_opt_out ?? false;
      }
    } catch {
      // Column not created yet — ignore
    }

    // Try to fetch conversations (table may not exist until SQL is run)
    let convMap: Record<string, any> = {};
    try {
      const { data: convs } = await supabase
        .from('inbox_conversations')
        .select('*')
        .eq('user_id', user.id);
      for (const c of convs ?? []) convMap[c.lead_id] = c;
    } catch {
      // Table not created yet — ignore
    }

    // Merge
    const merged = (leads || []).map(lead => ({
      ...lead,
      sms_opt_out: optOutMap[lead.id] ?? false,
      conversation: convMap[lead.id] ?? null,
    }));

    // Sort: leads with recent messages first, then by last_contact
    merged.sort((a, b) => {
      const aTime = a.conversation?.last_message_at ?? a.last_contact ?? '0';
      const bTime = b.conversation?.last_message_at ?? b.last_contact ?? '0';
      return bTime > aTime ? 1 : -1;
    });

    // Check if user has a Twilio connection
    let phoneConn = null;
    try {
      const { data } = await supabase
        .from('phone_connections')
        .select('phone_number, provider')
        .eq('user_id', user.id)
        .single();
      phoneConn = data ?? null;
    } catch {
      // No connection table or no row — fine
    }

    return NextResponse.json({ leads: merged, phoneConnection: phoneConn });
  } catch (err: any) {
    console.error('[inbox/conversations] unexpected error:', err);
    return NextResponse.json({ leads: [], phoneConnection: null, dbError: err?.message ?? 'Unknown error' });
  }
}
