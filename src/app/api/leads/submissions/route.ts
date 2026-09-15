import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

function makeClient(store: Awaited<ReturnType<typeof cookies>>) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => store.get(n)?.value, set: () => {}, remove: () => {} } }
  );
}

// GET /api/leads/submissions?leadId=X  — fetch all submissions for a lead
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const leadId = searchParams.get('leadId');
  if (!leadId) return NextResponse.json({ error: 'Missing leadId' }, { status: 400 });

  const store   = await cookies();
  const supabase = makeClient(store);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('lender_submissions')
    .select('*')
    .eq('lead_id', leadId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ submissions: data || [] });
}

// PATCH /api/leads/submissions  — update status or ai_response
export async function PATCH(request: Request) {
  const store   = await cookies();
  const supabase = makeClient(store);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, status, ai_response } = await request.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (status      !== undefined) patch.status      = status;
  if (ai_response !== undefined) patch.ai_response = ai_response;

  const { data, error } = await supabase
    .from('lender_submissions')
    .update(patch)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // ── Auto-trigger lead status based on submission outcome ──────────────────
  if (status && data?.lead_id) {
    const leadId = data.lead_id;
    if (status === 'Approved') {
      // Any approval → lead becomes Approved
      await supabase.from('leads').update({ lead_status: 'Approved' }).eq('id', leadId).eq('user_id', user.id);
    } else if (status === 'Needs Docs') {
      // Lender needs more docs → lead status
      const { data: lr } = await supabase.from('leads').select('lead_status').eq('id', leadId).eq('user_id', user.id).single();
      const safeStatuses = new Set(['Approved', 'Funded', 'Contract Signed', 'Contract In', 'Contract Out', 'All Declined/Final']);
      if (!safeStatuses.has(lr?.lead_status || '')) {
        await supabase.from('leads').update({ lead_status: 'Needs More Docs' }).eq('id', leadId).eq('user_id', user.id);
      }
    } else if (status === 'Declined') {
      // Check if ALL submissions for this lead are now declined
      const { data: allSubs } = await supabase.from('lender_submissions').select('status').eq('lead_id', leadId).eq('user_id', user.id);
      const allDeclined = allSubs && allSubs.length > 0 && allSubs.every(s => s.status === 'Declined' || s.status === 'Failed');
      if (allDeclined) {
        await supabase.from('leads').update({ lead_status: 'All Declined/Final' }).eq('id', leadId).eq('user_id', user.id);
      }
    }
  }

  return NextResponse.json({ submission: data });
}
