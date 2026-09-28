import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { findLeadByPhone } from '@/lib/leads/findByPhone';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const phone = req.nextUrl.searchParams.get('phone') || '';
    if (!phone.trim()) return NextResponse.json({ lead: null });

    const lead = await findLeadByPhone(supabase, phone, user.id);
    return NextResponse.json({
      lead: lead
        ? {
            id: lead.id,
            name: lead.name,
            company: lead.company,
            email: lead.email,
            phone: lead.phone_e164 || lead.phone,
          }
        : null,
    });
  } catch (err) {
    console.error('[telephony/lookup GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
