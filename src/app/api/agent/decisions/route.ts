import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );
}

// GET — fetch decisions for the current user
export async function GET(req: NextRequest) {
  try {
    const supabase = await getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || 'pending';
    const limit = parseInt(searchParams.get('limit') || '50');

    let query = supabase
      .from('agent_decisions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (status === 'pending') {
      // Include snoozed cards whose snooze_until has passed
      query = query.or(`status.eq.pending,and(status.eq.snoozed,snooze_until.lte.${new Date().toISOString()})`);
    } else {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ decisions: data || [] });
  } catch (err) {
    console.error('[agent/decisions GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST — create a new agent decision card
export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const {
      lead_id, lead_name, company, type, priority,
      proposal, draft_content, draft_type, conversation_id, metadata,
    } = body;

    if (!lead_name || !type || !proposal) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('agent_decisions')
      .insert({
        user_id: user.id,
        lead_id: lead_id || null,
        lead_name,
        company: company || null,
        type,
        priority: priority || 'normal',
        proposal,
        draft_content: draft_content || null,
        draft_type: draft_type || null,
        conversation_id: conversation_id || null,
        metadata: metadata || {},
        status: 'pending',
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ decision: data });
  } catch (err) {
    console.error('[agent/decisions POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
