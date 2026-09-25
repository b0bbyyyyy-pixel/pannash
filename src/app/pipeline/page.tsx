import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Navbar from '@/components/Navbar';
import PipelineClient from './PipelineClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ modal?: string }>;
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
  const { data: leads, error } = await supabase
    .from('leads')
    .select('*')
    .eq('user_id', user.id)
    .or('in_pipeline.eq.true,and(month_key.not.is.null,list_id.is.null)')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching pipeline leads:', error);
  }

  // Recover pipeline-created leads if the in_pipeline flag never stuck.
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data: recentOrphans } = await supabase
    .from('leads')
    .select('*')
    .eq('user_id', user.id)
    .is('list_id', null)
    .gte('created_at', weekAgo)
    .order('created_at', { ascending: false })
    .limit(40);

  const leadMap = new Map((leads ?? []).map(l => [l.id, l]));
  const orphanIds: string[] = [];
  for (const l of recentOrphans ?? []) {
    if (!leadMap.has(l.id)) leadMap.set(l.id, { ...l, in_pipeline: true });
    if (l.in_pipeline !== true) orphanIds.push(l.id);
  }
  if (orphanIds.length) {
    await supabase.from('leads').update({ in_pipeline: true }).in('id', orphanIds).eq('user_id', user.id);
  }
  const mergedLeads = [...leadMap.values()];

  const lastTextByLead: Record<string, { preview: string; outbound: boolean }> = {};

  const { data: convs, error: convErr } = await supabase
    .from('inbox_conversations')
    .select('lead_id, last_message_preview, last_direction')
    .eq('user_id', user.id);

  if (convErr) {
    console.error('Error fetching inbox conversations:', convErr);
  }

  for (const c of convs ?? []) {
    const preview = (c.last_message_preview || '').trim();
    if (!preview || !c.lead_id) continue;
    lastTextByLead[String(c.lead_id)] = {
      preview,
      outbound: c.last_direction === 'outbound',
    };
  }

  // Fallback: latest inbox_messages when conversation preview is missing
  const missingIds = mergedLeads
    .map(l => String(l.id))
    .filter(id => !lastTextByLead[id]);
  if (missingIds.length) {
    const { data: msgs } = await supabase
      .from('inbox_messages')
      .select('lead_id, body, direction, created_at')
      .in('lead_id', missingIds.slice(0, 80))
      .order('created_at', { ascending: false })
      .limit(200);
    for (const m of msgs ?? []) {
      const id = String(m.lead_id);
      if (lastTextByLead[id] || !m.body) continue;
      lastTextByLead[id] = {
        preview: m.body.length > 100 ? m.body.slice(0, 97) + '…' : m.body,
        outbound: m.direction === 'outbound',
      };
    }
  }

  const leadsWithText = mergedLeads.map(l => {
    const t = lastTextByLead[String(l.id)];
    return {
      ...l,
      last_text: t?.preview ?? null,
      last_text_outbound: t?.outbound ?? false,
    };
  });

  const userName = user.email?.split('@')[0] || 'User';
  const sp = await searchParams;
  const isModal = sp.modal === '1';

  if (isModal) {
    return (
      <div className="min-h-screen bg-[#fafafa]">
        <div className="px-3 py-3">
          <PipelineClient leads={leadsWithText} userId={user.id} compact />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <Navbar userName={userName} />
      <main className="pt-20 min-h-screen bg-[#fafafa]">
        <div className="max-w-[1600px] mx-auto px-6 py-8">
          <PipelineClient leads={leadsWithText} userId={user.id} />
        </div>
      </main>
    </div>
  );
}
