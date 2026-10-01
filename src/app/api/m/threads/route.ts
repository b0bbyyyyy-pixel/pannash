import { NextRequest, NextResponse } from 'next/server';
import { mobileClient, unauthorized } from '@/lib/mobile/session';
import { isHiddenInboxThread } from '@/lib/leads/dnc';

export const dynamic = 'force-dynamic';

function escapeIlike(s: string) {
  return s.replace(/[%_\\]/g, '\\$&');
}

function previewOf(raw: string | null | undefined) {
  const text = String(raw ?? '').trim();
  if (!text) return '';
  if (text === 'Attachment: 1 Photo') return text;
  return text.length > 80 ? `${text.slice(0, 77)}…` : text;
}

export async function GET(req: NextRequest) {
  const { supabase, user } = await mobileClient();
  if (!user) return unauthorized();

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';

  if (q) {
    const safe = escapeIlike(q);
    const { data: leads, error } = await supabase
      .from('leads')
      .select('id, name, company, phone, lead_status, sms_opt_out')
      .eq('user_id', user.id)
      .or(`name.ilike.%${safe}%,company.ilike.%${safe}%,phone.ilike.%${safe}%`)
      .limit(40);
    if (error) return NextResponse.json({ threads: [], error: error.message });

    const ids = (leads ?? []).map(l => l.id);
    const convMap = new Map<string, Record<string, unknown>>();
    if (ids.length) {
      const { data: convs } = await supabase
        .from('inbox_conversations')
        .select('lead_id, last_message_at, last_message_preview, unread_count')
        .eq('user_id', user.id)
        .in('lead_id', ids);
      for (const c of convs ?? []) convMap.set(c.lead_id, c);
    }

    const threads = (leads ?? [])
      .filter(l => l.phone)
      .filter(l => !isHiddenInboxThread(l, convMap.get(l.id)?.last_message_preview as string | undefined))
      .map(l => {
        const c = convMap.get(l.id);
        return {
          id: l.id,
          name: l.name || l.company || 'Unknown',
          company: l.company || '',
          preview: previewOf(c?.last_message_preview as string | undefined),
          unread: Number(c?.unread_count ?? 0),
          lastAt: (c?.last_message_at as string | null) ?? null,
        };
      });
    return NextResponse.json({ threads });
  }

  const { data: convs, error } = await supabase
    .from('inbox_conversations')
    .select('lead_id, last_message_at, last_message_preview, unread_count, last_direction')
    .eq('user_id', user.id)
    .not('last_message_at', 'is', null)
    .order('last_message_at', { ascending: false })
    .limit(120);

  if (error) return NextResponse.json({ threads: [], error: error.message });

  const ids = (convs ?? []).map(c => c.lead_id).filter(Boolean);
  const { data: leads } = ids.length
    ? await supabase
        .from('leads')
        .select('id, name, company, phone, lead_status, sms_opt_out')
        .eq('user_id', user.id)
        .in('id', ids)
    : { data: [] };
  const byId = new Map((leads ?? []).map(l => [l.id, l]));

  const threads = (convs ?? [])
    .filter(c => !isHiddenInboxThread(byId.get(c.lead_id), c.last_message_preview))
    .slice(0, 60)
    .map(c => {
      const lead = byId.get(c.lead_id);
      return {
        id: c.lead_id,
        name: lead?.name || lead?.company || 'Unknown',
        company: lead?.company || '',
        preview: previewOf(c.last_message_preview),
        unread: Number(c.unread_count ?? 0),
        lastAt: c.last_message_at,
      };
    });

  return NextResponse.json({ threads });
}
