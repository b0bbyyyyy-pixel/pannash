import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Navbar from '@/components/Navbar';
import PipelineClient from './PipelineClient';
import { isSmsStopBody } from '@/lib/leads/dnc';
import { countAttachmentsByLead } from '@/lib/leads/attachmentCounts';
import { PIPELINE_LEAD_COLS, PIPELINE_LEAD_COLS_CORE, asRows, hydrateListUd, selectFirst } from '@/lib/leads/listColumns';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ modal?: string; selected?: string }>;
}) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth');

  // Pipeline = explicitly sent (in_pipeline) OR legacy CRM leads (month_key, no campaign list).
  // Campaign leads stay out unless they were sent here (in_pipeline = true).
  const leadRes = await selectFirst([
    () => supabase
      .from('leads')
      .select(PIPELINE_LEAD_COLS)
      .eq('user_id', user.id)
      .or('in_pipeline.eq.true,and(month_key.not.is.null,list_id.is.null)')
      .order('created_at', { ascending: false }),
    () => supabase
      .from('leads')
      .select(PIPELINE_LEAD_COLS_CORE)
      .eq('user_id', user.id)
      .or('in_pipeline.eq.true,and(month_key.not.is.null,list_id.is.null)')
      .order('created_at', { ascending: false }),
  ]);
  const leads = asRows(leadRes.data);
  if (leadRes.error) {
    console.error('Error fetching pipeline leads:', leadRes.error);
  }

  // Recover pipeline-created leads if the in_pipeline flag never stuck.
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const orphansRes = await selectFirst([
    () => supabase
      .from('leads')
      .select(PIPELINE_LEAD_COLS)
      .eq('user_id', user.id)
      .is('list_id', null)
      .gte('created_at', weekAgo)
      .order('created_at', { ascending: false })
      .limit(40),
    () => supabase
      .from('leads')
      .select(PIPELINE_LEAD_COLS_CORE)
      .eq('user_id', user.id)
      .is('list_id', null)
      .gte('created_at', weekAgo)
      .order('created_at', { ascending: false })
      .limit(40),
  ]);
  const recentOrphans = asRows(orphansRes.data).map(l => hydrateListUd({ ...l }));

  const leadMap = new Map(leads.map(l => {
    const row = hydrateListUd({ ...l });
    return [String(row.id), row];
  }));
  const orphanIds: string[] = [];
  for (const l of recentOrphans ?? []) {
    const oid = String(l.id);
    if (!leadMap.has(oid)) leadMap.set(oid, { ...l, in_pipeline: true });
    if (l.in_pipeline !== true) orphanIds.push(oid);
  }
  if (orphanIds.length) {
    await supabase.from('leads').update({ in_pipeline: true }).in('id', orphanIds).eq('user_id', user.id);
  }
  const mergedLeads = [...leadMap.values()];

  const lastTextByLead: Record<string, { preview: string; outbound: boolean }> = {};
  const inboundLeadIds = new Set<string>();
  const pipelineLeadIds = mergedLeads.map(l => String(l.id));

  type ConvRow = {
    id?: string;
    lead_id: string;
    last_message_preview: string | null;
    last_direction: string | null;
    last_inbound_at?: string | null;
  };

  const convByLead = new Map<string, ConvRow>();
  const leadByConv = new Map<string, string>();
  for (let i = 0; i < pipelineLeadIds.length; i += 100) {
    const chunk = pipelineLeadIds.slice(i, i + 100);
    let data: ConvRow[] | null = null;
    let error: { message?: string } | null = null;
    const withInbound = await supabase
      .from('inbox_conversations')
      .select('id, lead_id, last_message_preview, last_direction, last_inbound_at')
      .eq('user_id', user.id)
      .in('lead_id', chunk);
    if (!withInbound.error) {
      data = (withInbound.data ?? []) as ConvRow[];
    } else {
      const fallback = await supabase
        .from('inbox_conversations')
        .select('id, lead_id, last_message_preview, last_direction')
        .eq('user_id', user.id)
        .in('lead_id', chunk);
      data = (fallback.data ?? []) as ConvRow[];
      error = fallback.error;
    }
    if (error) {
      console.error('Error fetching inbox conversations:', error);
      continue;
    }
    for (const c of (data ?? []) as ConvRow[]) {
      if (!c.lead_id) continue;
      const leadId = String(c.lead_id);
      convByLead.set(leadId, c);
      if (c.id) leadByConv.set(c.id, leadId);
      if (c.last_inbound_at || c.last_direction === 'inbound') inboundLeadIds.add(leadId);
      const preview = (c.last_message_preview || '').trim();
      if (!preview) continue;
      lastTextByLead[String(c.lead_id)] = {
        preview,
        outbound: c.last_direction === 'outbound',
      };
    }
  }

  const missingIds = pipelineLeadIds.filter(id => !lastTextByLead[id]);
  const missingConvIds = missingIds
    .map(id => convByLead.get(id)?.id)
    .filter((id): id is string => !!id);

  if (missingIds.length) {
    for (let i = 0; i < missingIds.length; i += 40) {
      const chunk = missingIds.slice(i, i + 40);
      const { data: msgs, error } = await supabase
        .from('inbox_messages')
        .select('lead_id, body, direction, created_at')
        .in('lead_id', chunk)
        .order('created_at', { ascending: false })
        .limit(400);
      if (error) console.error('Error fetching inbox messages:', error);
      for (const m of msgs ?? []) {
        const id = String(m.lead_id);
        if (lastTextByLead[id] || !m.body) continue;
        lastTextByLead[id] = {
          preview: m.body.length > 100 ? m.body.slice(0, 97) + '…' : m.body,
          outbound: m.direction === 'outbound',
        };
      }
    }
  }

  const stillMissing = missingConvIds.filter(cid => {
    const leadId = leadByConv.get(cid);
    return leadId && !lastTextByLead[leadId];
  });
  if (stillMissing.length) {
    for (let i = 0; i < stillMissing.length; i += 40) {
      const chunk = stillMissing.slice(i, i + 40);
      const { data: msgs } = await supabase
        .from('inbox_messages')
        .select('conversation_id, lead_id, body, direction, created_at')
        .in('conversation_id', chunk)
        .order('created_at', { ascending: false })
        .limit(400);
      for (const m of msgs ?? []) {
        const id = String(m.lead_id || leadByConv.get(String(m.conversation_id)) || '');
        if (!id || lastTextByLead[id] || !m.body) continue;
        lastTextByLead[id] = {
          preview: m.body.length > 100 ? m.body.slice(0, 97) + '…' : m.body,
          outbound: m.direction === 'outbound',
        };
      }
    }
  }

  const prospectIds = mergedLeads.filter(l => {
    if (l.sms_opt_out) return false;
    const status = String(l.lead_status ?? '').trim();
    if (status && status !== 'New Lead') return false;
    if (!inboundLeadIds.has(String(l.id))) return false;
    const t = lastTextByLead[String(l.id)];
    if (t && !t.outbound && isSmsStopBody(t.preview)) return false;
    return true;
  }).map(l => String(l.id));

  if (prospectIds.length) {
    await supabase
      .from('leads')
      .update({ lead_status: 'Prospect', in_pipeline: true })
      .in('id', prospectIds)
      .eq('user_id', user.id);
    for (const id of prospectIds) {
      const row = leadMap.get(id);
      if (row) leadMap.set(id, { ...row, lead_status: 'Prospect', in_pipeline: true });
    }
  }

  const pipelineIds = [...leadMap.keys()];
  const docCountByLead = pipelineIds.length
    ? await countAttachmentsByLead(supabase, pipelineIds.map(String))
    : {};

  const leadsWithText = [...leadMap.values()].map(l => {
    const t = lastTextByLead[String(l.id)];
    return {
      ...l,
      last_text: t?.preview ?? null,
      last_text_outbound: t?.outbound ?? false,
      doc_count: docCountByLead[String(l.id)] ?? 0,
    };
  });

  const userName = user.email?.split('@')[0] || 'User';
  const sp = await searchParams;
  const isModal = sp.modal === '1';

  if (isModal) {
    return (
      <div className="min-h-screen bg-[#fafafa]">
        <div className="px-3 py-3">
          <PipelineClient leads={leadsWithText as never} userId={user.id} compact initialSelectedId={sp.selected ?? null} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <Navbar userName={userName} />
      <main className="pt-20 min-h-screen bg-[#fafafa]">
        <div className="max-w-[1600px] mx-auto px-6 py-8">
          <PipelineClient leads={leadsWithText as never} userId={user.id} />
        </div>
      </main>
    </div>
  );
}
