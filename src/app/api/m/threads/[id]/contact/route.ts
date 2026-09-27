import { NextResponse } from 'next/server';
import { mobileClient, unauthorized } from '@/lib/mobile/session';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: leadId } = await params;
  const { supabase, user } = await mobileClient();
  if (!user) return unauthorized();

  const { data: lead, error } = await supabase
    .from('leads')
    .select('id, name, company, phone, email, stage, lead_status')
    .eq('id', leadId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: conv } = await supabase
    .from('inbox_conversations')
    .select('id')
    .eq('user_id', user.id)
    .eq('lead_id', leadId)
    .maybeSingle();

  let lastIn: string | null = null;
  let lastOut: string | null = null;
  if (conv) {
    const { data: inbound } = await supabase
      .from('inbox_messages')
      .select('created_at')
      .eq('conversation_id', conv.id)
      .eq('direction', 'inbound')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: outbound } = await supabase
      .from('inbox_messages')
      .select('created_at')
      .eq('conversation_id', conv.id)
      .eq('direction', 'outbound')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    lastIn = inbound?.created_at ?? null;
    lastOut = outbound?.created_at ?? null;
  }

  return NextResponse.json({
    contact: {
      id: lead.id,
      name: lead.name || '',
      business: lead.company || '',
      phone: lead.phone || '',
      email: lead.email || '',
      stage: lead.stage || '',
      status: lead.lead_status || '',
      lastIn,
      lastOut,
      crmUrl: `/pipeline/${lead.id}`,
    },
  });
}
