import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) { return cookieStore.get(name)?.value; },
          set() {},
          remove() {},
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { leadId, type } = await request.json();

    if (!leadId || !type) {
      return NextResponse.json({ error: 'Missing leadId or type' }, { status: 400 });
    }
    if (type !== 'sms' && type !== 'call') {
      return NextResponse.json({ error: 'type must be "sms" or "call"' }, { status: 400 });
    }

    // Fetch current value to determine toggle direction
    const col = type === 'sms' ? 'sms_sent_at' : 'call_made_at';
    const { data: existing, error: fetchErr } = await supabase
      .from('leads')
      .select(col)
      .eq('id', leadId)
      .eq('user_id', user.id)
      .single();

    if (fetchErr || !existing) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    const currentVal = (existing as Record<string, string | null>)[col];
    const newVal = currentVal ? null : new Date().toISOString();

    const { data: updated, error: updateErr } = await supabase
      .from('leads')
      .update({ [col]: newVal })
      .eq('id', leadId)
      .eq('user_id', user.id)
      .select()
      .single();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ lead: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
