import { NextRequest, NextResponse } from 'next/server';
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

// POST — handle natural-language queries to the agent
// Returns a briefing string + optionally filtered card sets
export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { query } = await req.json();
    const q = (query || '').toLowerCase().trim();

    // Fetch pending decisions
    const { data: decisions } = await supabase
      .from('agent_decisions')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(100);

    const all = decisions || [];

    const urgent = all.filter((d) => d.priority === 'urgent');
    const hotLeads = all.filter((d) => d.type === 'hot_lead');
    const replies = all.filter((d) => ['suggest_reply', 'campaign_reply'].includes(d.type));
    const followUps = all.filter((d) => ['follow_up', 'schedule_followup'].includes(d.type));
    const stalled = all.filter((d) => ['stalled', 'stage_move'].includes(d.type));

    // "what needs me" / "what's pending" / "what should I do"
    if (
      q.includes('needs me') ||
      q.includes('pending') ||
      q.includes('what should') ||
      q.includes('what do i') ||
      q.includes('priority') ||
      q.includes('right now') ||
      q.includes('queue') ||
      q === ''
    ) {
      const lines: string[] = [];
      if (all.length === 0) {
        lines.push("You're clear — no pending decisions in the queue.");
        lines.push("I'll keep scanning for hot leads, replies, and overdue follow-ups.");
      } else {
        lines.push(`Here's what needs you right now (${all.length} total):`);
        lines.push('');
        if (urgent.length) lines.push(`🔥 Urgent — ${urgent.length} card${urgent.length !== 1 ? 's' : ''}`);
        if (replies.length) lines.push(`💬 Replies to review — ${replies.length}`);
        if (hotLeads.length) lines.push(`⚡ Hot leads — ${hotLeads.length}`);
        if (followUps.length) lines.push(`📅 Follow-ups — ${followUps.length}`);
        if (stalled.length) lines.push(`🤫 Gone quiet — ${stalled.length}`);

        // Money-first: name any urgent leads
        if (urgent.length > 0) {
          lines.push('');
          lines.push('Lead' + (urgent.length === 1 ? '' : 's') + ' to act on first:');
          urgent.slice(0, 3).forEach((d) => {
            lines.push(`  · ${d.lead_name}${d.company ? ` (${d.company})` : ''}`);
          });
          if (urgent.length > 3) lines.push(`  · …and ${urgent.length - 3} more`);
        }
      }
      return NextResponse.json({ briefing: lines.join('\n'), decisions: all });
    }

    // "hot leads" / "who's hot"
    if (q.includes('hot') || q.includes('fire') || q.includes('closing')) {
      if (hotLeads.length === 0) {
        return NextResponse.json({ briefing: "No hot leads in the queue right now. I'll flag them the moment something spikes.", decisions: [] });
      }
      const names = hotLeads.map((d) => `${d.lead_name}${d.company ? ` (${d.company})` : ''}`).join(', ');
      return NextResponse.json({ briefing: `⚡ ${hotLeads.length} hot lead${hotLeads.length !== 1 ? 's' : ''}: ${names}`, decisions: hotLeads });
    }

    // "who went quiet" / "stalled" / "silent"
    if (q.includes('quiet') || q.includes('stalled') || q.includes('silent') || q.includes('no response') || q.includes('ghost')) {
      if (stalled.length === 0) {
        return NextResponse.json({ briefing: "No stalled leads flagged right now. Everyone's been touched recently.", decisions: [] });
      }
      const names = stalled.map((d) => `${d.lead_name}`).join(', ');
      return NextResponse.json({ briefing: `🤫 ${stalled.length} lead${stalled.length !== 1 ? 's' : ''} gone quiet: ${names}`, decisions: stalled });
    }

    // "follow-up" / "overdue" / "calendar"
    if (q.includes('follow') || q.includes('overdue') || q.includes('calendar') || q.includes('schedule')) {
      if (followUps.length === 0) {
        return NextResponse.json({ briefing: "No overdue follow-ups in queue. Calendar's clear.", decisions: [] });
      }
      return NextResponse.json({ briefing: `📅 ${followUps.length} overdue follow-up${followUps.length !== 1 ? 's' : ''} waiting for your approval.`, decisions: followUps });
    }

    // "replies" / "inbound" / "responded"
    if (q.includes('repl') || q.includes('inbound') || q.includes('responded') || q.includes('messaged')) {
      if (replies.length === 0) {
        return NextResponse.json({ briefing: "No unreviewed replies right now.", decisions: [] });
      }
      const names = replies.map((d) => d.lead_name).join(', ');
      return NextResponse.json({ briefing: `💬 ${replies.length} reply${replies.length !== 1 ? 's' : ''} waiting: ${names}`, decisions: replies });
    }

    // Search by lead name
    const matchedByName = all.filter(
      (d) =>
        d.lead_name?.toLowerCase().includes(q) ||
        d.company?.toLowerCase().includes(q)
    );
    if (matchedByName.length > 0) {
      return NextResponse.json({
        briefing: `Found ${matchedByName.length} pending decision${matchedByName.length !== 1 ? 's' : ''} for "${query}".`,
        decisions: matchedByName,
      });
    }

    // Fallback
    return NextResponse.json({
      briefing: `I searched the queue for "${query}" but didn't find a match. Try: "what needs me", "hot leads", "who went quiet", "follow-ups", or a lead name.`,
      decisions: all,
    });
  } catch (err) {
    console.error('[agent/ask POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
