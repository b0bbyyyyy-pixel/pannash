import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { formatDisplay, toE164 } from '@/lib/dialer/e164';
import {
  blockCaller,
  listBlockedCallers,
  unblockCaller,
} from '@/lib/telephony/blockCaller';

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );
}

export async function GET() {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const rows = await listBlockedCallers(supabase, user.id);
    return NextResponse.json({
      numbers: rows.map(r => ({
        phone: r.e164,
        display: formatDisplay(r.e164),
        reason: r.reason,
        created_at: r.created_at,
      })),
    });
  } catch (err) {
    console.error('[telephony/block GET]', err);
    return NextResponse.json({ error: 'Could not load blocked numbers' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { phone?: string; leadId?: string };
  const phone = String(body.phone || '').trim();
  if (!phone && !body.leadId) {
    return NextResponse.json({ error: 'Missing phone' }, { status: 400 });
  }
  if (phone && !toE164(phone)) {
    return NextResponse.json({ error: 'Not a valid phone number' }, { status: 400 });
  }

  await blockCaller(supabase, {
    userId: user.id,
    phone: phone || null,
    leadId: body.leadId || null,
    reason: 'blocked_caller',
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const phone = String(req.nextUrl.searchParams.get('phone') || '').trim();
  if (!phone) return NextResponse.json({ error: 'Missing phone' }, { status: 400 });
  await unblockCaller(supabase, user.id, phone);
  return NextResponse.json({ ok: true });
}
