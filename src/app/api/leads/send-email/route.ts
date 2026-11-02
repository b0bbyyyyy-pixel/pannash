import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { sendLeadEmail } from '@/lib/email/sendLeadEmail';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function errMessage(err: unknown) {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return err instanceof Error ? err.message : 'Send failed';
}

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { leadId, subject, html, connectionId } = await req.json();
    if (!leadId || !subject || !html) {
      return NextResponse.json({ error: 'Missing lead, subject, or body' }, { status: 400 });
    }

    const { data: lead, error: leadErr } = await supabase
      .from('leads')
      .select('id, email, name')
      .eq('id', leadId)
      .eq('user_id', user.id)
      .single();

    if (leadErr || !lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    if (!lead.email) return NextResponse.json({ error: 'This lead has no email address' }, { status: 400 });

    const result = await sendLeadEmail(supabase, {
      userId: user.id,
      leadId: lead.id,
      to: lead.email,
      subject,
      html,
      connectionId: typeof connectionId === 'string' ? connectionId : null,
    });

    if (!result.sent) {
      return NextResponse.json({
        error: result.error || 'Send failed',
        needsGmail: !!result.needsGmail,
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      to: result.to,
      from: result.from,
    });
  } catch (err: unknown) {
    const message = errMessage(err);
    console.error('[send-email]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
