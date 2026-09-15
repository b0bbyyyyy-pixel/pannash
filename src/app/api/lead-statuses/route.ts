import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

// ── Default full status list (seeded on first load) ────────────────────────────
export const DEFAULT_STATUSES: { name: string; color: string; bg_color: string }[] = [
  { name: 'New Lead',                    color: '#0369a1', bg_color: '#e0f2fe' },
  { name: 'Contacted',                   color: '#a16207', bg_color: '#fef9c3' },
  { name: 'Callback Scheduled',          color: '#7c3aed', bg_color: '#f5f3ff' },
  { name: 'Revisit',                     color: '#a16207', bg_color: '#fefce8' },
  { name: 'App Out',                     color: '#6d28d9', bg_color: '#ede9fe' },
  { name: 'Application Acknowledgement', color: '#0369a1', bg_color: '#dbeafe' },
  { name: 'Documents Acknowledgment',    color: '#0369a1', bg_color: '#dbeafe' },
  { name: 'Docs Requested',             color: '#c2410c', bg_color: '#fff7ed' },
  { name: 'Missing Docs/info',           color: '#b45309', bg_color: '#fef3c7' },
  { name: 'Needs More Docs',             color: '#b45309', bg_color: '#fef9c3' },
  { name: 'Docs In',                     color: '#047857', bg_color: '#d1fae5' },
  { name: 'Docs Received',              color: '#047857', bg_color: '#d1fae5' },
  { name: 'Submitted',                   color: '#1d4ed8', bg_color: '#dbeafe' },
  { name: 'Submitted To Non-MCA',        color: '#1d4ed8', bg_color: '#dbeafe' },
  { name: 'Submitted to Underwriting',   color: '#1e40af', bg_color: '#bfdbfe' },
  { name: 'In Underwriting',             color: '#166534', bg_color: '#dcfce7' },
  { name: 'Pre-Qualified',               color: '#065f46', bg_color: '#d1fae5' },
  { name: 'Conditionally Approved',      color: '#7e22ce', bg_color: '#f3e8ff' },
  { name: 'Approved',                    color: '#15803d', bg_color: '#bbf7d0' },
  { name: 'Contract Sent',               color: '#0f766e', bg_color: '#ccfbf1' },
  { name: 'Contract In',                 color: '#0f766e', bg_color: '#ccfbf1' },
  { name: 'Contract Signed',             color: '#059669', bg_color: '#a7f3d0' },
  { name: 'Contract Out',                color: '#0369a1', bg_color: '#bae6fd' },
  { name: 'Funded',                      color: '#166534', bg_color: '#86efac' },
  { name: 'Renewal Eligible',            color: '#047857', bg_color: '#d1fae5' },
  { name: 'Renewal In Progress',         color: '#0f766e', bg_color: '#ccfbf1' },
  { name: 'Renewal',                     color: '#0369a1', bg_color: '#e0f2fe' },
  { name: 'LOC',                         color: '#0369a1', bg_color: '#e0f2fe' },
  { name: 'Declined',                    color: '#b91c1c', bg_color: '#fee2e2' },
  { name: 'All Declined/Final',          color: '#991b1b', bg_color: '#fecaca' },
  { name: 'Merchant Declined Offer',     color: '#b91c1c', bg_color: '#fee2e2' },
  { name: 'Not Interested',              color: '#6b7280', bg_color: '#f3f4f6' },
  { name: 'Dead',                        color: '#4b5563', bg_color: '#e5e7eb' },
  { name: 'In Default',                  color: '#991b1b', bg_color: '#ffe4e6' },
  { name: 'Wood',                        color: '#92400e', bg_color: '#fef3c7' },
  { name: 'SPANISH SPEAKING ONLY',       color: '#374151', bg_color: '#f3f4f6' },
];

function makeClient(store: Awaited<ReturnType<typeof cookies>>) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => store.get(n)?.value, set: () => {}, remove: () => {} } }
  );
}

// GET — fetch statuses (seed defaults if none exist)
export async function GET() {
  const store   = await cookies();
  const supabase = makeClient(store);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('lead_statuses')
    .select('*')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Seed defaults on first visit
  if (!data || data.length === 0) {
    const rows = DEFAULT_STATUSES.map((s, i) => ({
      user_id:    user.id,
      name:       s.name,
      color:      s.color,
      bg_color:   s.bg_color,
      sort_order: i,
    }));
    const { data: seeded, error: seedErr } = await supabase
      .from('lead_statuses')
      .insert(rows)
      .select();
    if (seedErr) return NextResponse.json({ error: seedErr.message }, { status: 500 });
    return NextResponse.json({ statuses: seeded ?? [] });
  }

  return NextResponse.json({ statuses: data });
}

// POST — add a new status
export async function POST(request: Request) {
  const store   = await cookies();
  const supabase = makeClient(store);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { name, color, bg_color } = await request.json();
  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 });

  // Get max sort_order
  const { data: maxRow } = await supabase
    .from('lead_statuses')
    .select('sort_order')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .single();

  const { data, error } = await supabase
    .from('lead_statuses')
    .insert({
      user_id:    user.id,
      name:       name.trim(),
      color:      color      || '#6b6b6b',
      bg_color:   bg_color   || '#f5f5f5',
      sort_order: (maxRow?.sort_order ?? -1) + 1,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ status: data });
}

// DELETE — remove a status by id
export async function DELETE(request: Request) {
  const store   = await cookies();
  const supabase = makeClient(store);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { error } = await supabase
    .from('lead_statuses')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// PATCH — update color or reorder
export async function PATCH(request: Request) {
  const store   = await cookies();
  const supabase = makeClient(store);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, color, bg_color, sort_order } = await request.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (color      !== undefined) patch.color      = color;
  if (bg_color   !== undefined) patch.bg_color   = bg_color;
  if (sort_order !== undefined) patch.sort_order = sort_order;

  const { data, error } = await supabase
    .from('lead_statuses')
    .update(patch)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ status: data });
}
