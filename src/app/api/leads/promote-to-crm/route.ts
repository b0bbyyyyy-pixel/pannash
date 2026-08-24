import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

// Moves a contact-list lead into the CRM dashboard by updating its fields
// and clearing list_id so it becomes a CRM lead.
export async function POST(req: NextRequest) {
  try {
    const { leadId, monthKey } = await req.json();
    if (!leadId) return NextResponse.json({ error: 'leadId required' }, { status: 400 });

    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const now = new Date().toISOString();
    const mk = monthKey || now.slice(0, 7);

    const { data, error } = await supabase
      .from('leads')
      .update({
        list_id: null,                        // remove from contact list
        stage: 'Offers/Follow up',
        value: 0,
        last_contact: now,
        timer_type: 'Display Date',
        timer_end_date: now,
        auto_email_frequency: 'Off',
        auto_text_frequency: 'Off',
        month_key: mk,
      })
      .eq('id', leadId)
      .eq('user_id', user.id)
      .select('id, name')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ lead: data });
  } catch (err) {
    console.error('[promote-to-crm]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
