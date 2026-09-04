import { NextResponse } from 'next/server';
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

// POST — scan CRM data and seed decision cards for real pending situations
// This creates cards for: hot leads, stalled leads, unread inbound messages, overdue follow-ups
// Cards already created today are skipped (idempotent by lead+type+day)
export async function POST() {
  try {
    const supabase = await getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const created: string[] = [];
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Fetch existing pending decisions created today to avoid duplication
    const { data: existing } = await supabase
      .from('agent_decisions')
      .select('lead_id, type')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .gte('created_at', todayStart.toISOString());

    const existingKeys = new Set(
      (existing || []).map((d) => `${d.lead_id}-${d.type}`)
    );

    const shouldSkip = (lead_id: string | null, type: string) =>
      existingKeys.has(`${lead_id}-${type}`);

    // ── 1. Hot leads ────────────────────────────────────────────────────────
    const { data: hotLeads } = await supabase
      .from('hot_leads')
      .select('lead_id, lead_name, company, score, reason')
      .eq('user_id', user.id)
      .order('score', { ascending: false })
      .limit(10);

    for (const hl of hotLeads || []) {
      if (shouldSkip(hl.lead_id, 'hot_lead')) continue;
      const name = hl.lead_name || 'this lead';
      const company = hl.company ? ` at ${hl.company}` : '';
      await supabase.from('agent_decisions').insert({
        user_id: user.id,
        lead_id: hl.lead_id,
        lead_name: hl.lead_name || 'Unknown',
        company: hl.company || null,
        type: 'hot_lead',
        priority: 'urgent',
        proposal: `${name}${company} is running hot (score ${hl.score ?? '—'}). ${hl.reason || 'High engagement detected.'} Want me to send a check-in text?`,
        draft_content: `Hey ${name.split(' ')[0]}, just checking in — are you still interested in moving forward? I want to make sure you have everything you need. 🤝`,
        draft_type: 'sms',
        metadata: { score: hl.score, reason: hl.reason },
      });
      created.push(`hot_lead:${hl.lead_id}`);
    }

    // ── 2. Stalled leads (last_contact > 7 days, active stages) ─────────────
    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const activeStages = ['Offers/Follow up', 'Proposal Sent', 'Contracts Out', 'contacted', 'active', 'documents requested', 'under review'];

    const { data: stalledLeads } = await supabase
      .from('leads')
      .select('id, name, company, stage, last_contact, phone')
      .eq('user_id', user.id)
      .in('stage', activeStages)
      .or(`last_contact.lte.${sevenDaysAgo},last_contact.is.null`)
      .not('phone', 'is', null)
      .limit(8);

    for (const lead of stalledLeads || []) {
      if (shouldSkip(lead.id, 'stalled')) continue;
      const firstName = (lead.name || 'this lead').split(' ')[0];
      const company = lead.company ? ` at ${lead.company}` : '';
      const daysSince = lead.last_contact
        ? Math.floor((Date.now() - new Date(lead.last_contact).getTime()) / 86_400_000)
        : null;
      const daysMsg = daysSince ? `${daysSince} days since last contact` : 'no contact on record';

      await supabase.from('agent_decisions').insert({
        user_id: user.id,
        lead_id: lead.id,
        lead_name: lead.name || 'Unknown',
        company: lead.company || null,
        type: 'stalled',
        priority: 'normal',
        proposal: `${lead.name || 'This lead'}${company} has gone quiet — ${daysMsg}. They're in "${lead.stage}". Want me to send a nudge?`,
        draft_content: `Hey ${firstName}, just wanted to follow up and see where things stand on your end. No pressure at all — just want to make sure I'm still a resource for you. Let me know! 👋`,
        draft_type: 'sms',
        metadata: { stage: lead.stage, days_since: daysSince },
      });
      created.push(`stalled:${lead.id}`);
    }

    // ── 3. Unread inbound messages (conversations with unread > 0) ──────────
    const { data: unreadConvs } = await supabase
      .from('inbox_conversations')
      .select('id, lead_id, lead_name, last_message_preview, last_direction, unread_count')
      .eq('user_id', user.id)
      .eq('last_direction', 'inbound')
      .gt('unread_count', 0)
      .order('last_message_at', { ascending: false })
      .limit(10);

    for (const conv of unreadConvs || []) {
      if (shouldSkip(conv.lead_id, 'suggest_reply')) continue;
      const name = conv.lead_name || 'this lead';
      const preview = conv.last_message_preview
        ? `"${conv.last_message_preview.slice(0, 60)}${conv.last_message_preview.length > 60 ? '…' : ''}"`
        : 'an inbound message';

      await supabase.from('agent_decisions').insert({
        user_id: user.id,
        lead_id: conv.lead_id || null,
        lead_name: conv.lead_name || 'Unknown',
        company: null,
        type: 'suggest_reply',
        priority: 'urgent',
        proposal: `${name} replied — ${preview}. Want me to draft a response?`,
        draft_content: null, // Will be generated on-demand by suggest-reply API
        draft_type: 'sms',
        conversation_id: conv.id,
        metadata: { unread_count: conv.unread_count, preview: conv.last_message_preview },
      });
      created.push(`suggest_reply:${conv.lead_id}`);
    }

    // ── 4. Overdue follow-ups (calendar_events past due, not completed) ──────
    const { data: overdueFollowups } = await supabase
      .from('calendar_events')
      .select('id, lead_id, lead_name, title, event_date')
      .eq('user_id', user.id)
      .eq('type', 'follow_up')
      .neq('status', 'completed')
      .lt('event_date', new Date().toISOString())
      .order('event_date', { ascending: true })
      .limit(6);

    for (const fu of overdueFollowups || []) {
      if (shouldSkip(fu.lead_id, 'follow_up')) continue;
      const overdueDays = Math.floor((Date.now() - new Date(fu.event_date).getTime()) / 86_400_000);
      const name = fu.lead_name || 'this lead';

      await supabase.from('agent_decisions').insert({
        user_id: user.id,
        lead_id: fu.lead_id || null,
        lead_name: fu.lead_name || 'Unknown',
        company: null,
        type: 'follow_up',
        priority: overdueDays > 3 ? 'urgent' : 'normal',
        proposal: `Overdue follow-up for ${name} — ${fu.title || 'follow-up'} was due ${overdueDays === 0 ? 'today' : `${overdueDays} day${overdueDays !== 1 ? 's' : ''} ago`}. Want me to reach out?`,
        draft_content: `Hey ${name.split(' ')[0]}, I wanted to follow up on our conversation — any updates on your end? I'm here if you need anything. 📲`,
        draft_type: 'sms',
        metadata: { calendar_event_id: fu.id, overdue_days: overdueDays, title: fu.title },
      });
      created.push(`follow_up:${fu.lead_id}`);
    }

    return NextResponse.json({ seeded: created.length, cards: created });
  } catch (err) {
    console.error('[agent/seed POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
