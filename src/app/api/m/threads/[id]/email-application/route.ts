import { NextRequest, NextResponse } from 'next/server';
import { mobileClient, unauthorized } from '@/lib/mobile/session';
import { isValidEmail } from '@/lib/leads/extractEmailFromSms';
import { markApplicationSent, sendApplicationTemplate } from '@/lib/casper/updateLeadEmail';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: leadId } = await params;
  const { supabase, user } = await mobileClient();
  if (!user) return unauthorized();

  const body = await req.json().catch(() => ({})) as { to?: string };

  const { data: lead } = await supabase
    .from('leads')
    .select('id, name, email, phone, company, notes, underwriting_data')
    .eq('id', leadId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const typed = String(body.to || '').trim();
  const nextEmail = typed || String(lead.email || '').trim();
  if (!isValidEmail(nextEmail)) {
    return NextResponse.json({ error: 'This lead has no email address' }, { status: 400 });
  }

  if (typed && typed.toLowerCase() !== String(lead.email || '').trim().toLowerCase()) {
    await supabase
      .from('leads')
      .update({ email: nextEmail })
      .eq('id', lead.id)
      .eq('user_id', user.id);
  }

  const result = await sendApplicationTemplate(supabase, {
    userId: user.id,
    lead: { ...lead, email: nextEmail },
  });

  if (result.sent) {
    await markApplicationSent(supabase, user.id, lead);
    return NextResponse.json({ sent: true, to: nextEmail });
  }

  const errAct = result.actions.find(a => a.error);
  const error = typeof errAct?.error === 'string' ? errAct.error : 'Could not send application email';
  return NextResponse.json({ sent: false, to: nextEmail, error }, { status: 400 });
}
