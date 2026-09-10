import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Admin client that bypasses Row Level Security
function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function POST(req: NextRequest) {
  // 1. Verify secret token
  const authHeader = req.headers.get('authorization') ?? '';
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Parse payload from One Funding lead form
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const fullName     = String(body.fullName     ?? '').trim();
  const email        = String(body.email        ?? '').trim();
  const phone        = String(body.phone        ?? '').trim();
  const businessName = String(body.businessName ?? '').trim();
  const monthlyRevenue  = String(body.monthlyRevenue  ?? '').trim();
  const timeInBusiness  = String(body.timeInBusiness  ?? '').trim();
  const useOfFunds      = String(body.useOfFunds      ?? '').trim();
  const smsOptIn        = body.smsOptIn === true;
  const submittedAt     = String(body.submittedAt ?? new Date().toISOString());

  if (!fullName || !email) {
    return NextResponse.json({ error: 'fullName and email are required' }, { status: 400 });
  }

  const ownerUserId = process.env.PANNASH_OWNER_USER_ID;
  if (!ownerUserId) {
    console.error('PANNASH_OWNER_USER_ID is not set');
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }

  const supabase = getAdminClient();

  // 3. Find or create the "One Funding Leads" list
  const LIST_NAME = 'One Funding Leads';

  let listId: string;

  const { data: existingList } = await supabase
    .from('lead_lists')
    .select('id')
    .eq('user_id', ownerUserId)
    .eq('name', LIST_NAME)
    .single();

  if (existingList) {
    listId = existingList.id;
  } else {
    const { data: newList, error: listError } = await supabase
      .from('lead_lists')
      .insert({ user_id: ownerUserId, name: LIST_NAME, description: 'Leads from onefundingsolution.com' })
      .select('id')
      .single();

    if (listError || !newList) {
      console.error('Failed to create lead list:', listError);
      return NextResponse.json({ error: 'Failed to create lead list' }, { status: 500 });
    }
    listId = newList.id;
  }

  // 4. Build notes from the funding-specific fields
  const notes = [
    `Monthly Revenue: ${monthlyRevenue}`,
    `Time in Business: ${timeInBusiness}`,
    `Use of Funds: ${useOfFunds}`,
    `SMS Opt-in: ${smsOptIn ? 'Yes' : 'No'}`,
    `Submitted: ${submittedAt}`,
    `Source: onefundingsolution.com`,
  ].join('\n');

  // 5. Insert the lead
  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .insert({
      user_id:      ownerUserId,
      name:         fullName,
      email:        email,
      phone:        phone || null,
      company:      businessName || null,
      notes:        notes,
      list_id:      listId,
      last_contact: new Date().toISOString(),
    })
    .select()
    .single();

  if (leadError) {
    console.error('Failed to insert lead:', leadError);
    return NextResponse.json({ error: 'Failed to create lead' }, { status: 500 });
  }

  console.log(`[one-funding webhook] New lead created: ${lead.id} — ${fullName} (${email})`);
  return NextResponse.json({ ok: true, leadId: lead.id });
}
