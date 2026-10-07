import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getTwilioCreds } from '@/lib/telephony/twilio';
import { refreshSmsStatuses, fetchTwilioSmsBody } from '@/lib/telephony/sms';
import { backfillInboundPhotos } from '@/lib/inbox/saveInboundMms';
import { isPlaceholderSmsBody, recoverOutboundSmsBody } from '@/lib/inbox/recordOutboundSms';

export async function GET(req: NextRequest) {
  try {
    const leadId = req.nextUrl.searchParams.get('leadId');
    if (!leadId) return NextResponse.json({ error: 'leadId required' }, { status: 400 });
    const since = req.nextUrl.searchParams.get('since')?.trim() || '';
    const conversationIdParam = req.nextUrl.searchParams.get('conversationId')?.trim() || '';

    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Incremental: skip get-or-create, backfill, placeholder recovery, status refresh, mark-read.
    if (since) {
      const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const sinceIso = new Date(since).toISOString();
      const older = sinceIso < cutoff ? sinceIso : cutoff;
      const { data, error } = await supabase
        .from('inbox_messages')
        .select('*')
        .eq('lead_id', leadId)
        .gt('created_at', older)
        .order('created_at', { ascending: true })
        .limit(200);
      if (error) {
        return NextResponse.json({ messages: [], conversationId: conversationIdParam || null });
      }
      return NextResponse.json({
        messages: data ?? [],
        conversationId: conversationIdParam || null,
      });
    }

    let conv: { id: string; unread_count?: number } | null = null;
    try {
      const { data: existing } = await supabase
        .from('inbox_conversations')
        .select('*')
        .eq('user_id', user.id)
        .eq('lead_id', leadId)
        .single();

      if (existing) {
        conv = existing;
      } else {
        const { data: newConv } = await supabase
          .from('inbox_conversations')
          .insert({ user_id: user.id, lead_id: leadId })
          .select()
          .single();
        conv = newConv;
      }
    } catch {
      return NextResponse.json({ messages: [], conversationId: null, setupRequired: true });
    }

    if (!conv) return NextResponse.json({ messages: [], conversationId: null });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let messages: any[] = [];
    try {
      const { data } = await supabase
        .from('inbox_messages')
        .select('*')
        .eq('conversation_id', conv.id)
        .order('created_at', { ascending: false })
        .limit(300);
      messages = (data ?? []).slice().reverse();
    } catch {
      // Table not yet created
    }

    messages = await backfillInboundPhotos(supabase, user.id, messages);

    const realBySid = new Set(
      messages
        .filter((m: { twilio_sid?: string | null; body?: string; direction?: string }) =>
          m.direction === 'outbound' && m.twilio_sid && !isPlaceholderSmsBody(m.body as string)
        )
        .map((m: { twilio_sid: string }) => m.twilio_sid)
    );
    const ghostIds = messages
      .filter((m: { id: string; twilio_sid?: string | null; body?: string; direction?: string }) =>
        m.direction === 'outbound' && m.twilio_sid && isPlaceholderSmsBody(m.body as string) && realBySid.has(m.twilio_sid)
      )
      .map((m: { id: string }) => m.id);
    if (ghostIds.length) {
      await supabase.from('inbox_messages').delete().in('id', ghostIds);
      messages = messages.filter((m: { id: string }) => !ghostIds.includes(m.id));
    }

    const placeholders = messages.filter((m: { direction?: string; twilio_sid?: string | null; body?: string }) =>
      m.direction === 'outbound' && m.twilio_sid && isPlaceholderSmsBody(m.body as string)
    );
    if (placeholders.length) {
      const creds = await getTwilioCreds(supabase, user.id);
      for (const row of placeholders.slice(-12) as { id: string; twilio_sid: string; body: string }[]) {
        let nextBody = await recoverOutboundSmsBody(supabase, row.twilio_sid);
        if (!nextBody && creds) {
          try { nextBody = await fetchTwilioSmsBody(creds, row.twilio_sid); } catch { /* keep */ }
        }
        if (!nextBody || isPlaceholderSmsBody(nextBody)) continue;
        await supabase.from('inbox_messages').update({ body: nextBody }).eq('id', row.id);
        row.body = nextBody;
      }
    }

    if ((conv.unread_count ?? 0) > 0) {
      await supabase
        .from('inbox_conversations')
        .update({ unread_count: 0 })
        .eq('id', conv.id);
    }

    const cutoff = Date.now() - 30 * 60 * 1000;
    const pending = messages.filter((m: { direction?: string; twilio_sid?: string | null; status?: string; created_at?: string }) =>
      m.direction === 'outbound'
      && m.twilio_sid
      && (m.status === 'queued' || m.status === 'sent')
      && m.created_at
      && new Date(m.created_at).getTime() >= cutoff
    );
    if (pending.length) {
      const creds = await getTwilioCreds(supabase, user.id);
      if (creds) {
        const updates = await refreshSmsStatuses(creds, pending as { id: string; twilio_sid: string | null; status: string }[]);
        for (const u of updates) {
          await supabase
            .from('inbox_messages')
            .update({ status: u.status, error_message: u.error ?? null })
            .eq('id', u.id);
          const row = messages.find((m: { id: string }) => m.id === u.id) as { status?: string; error_message?: string | null } | undefined;
          if (row) {
            row.status = u.status;
            row.error_message = u.error ?? row.error_message;
          }
        }
      }
    }

    return NextResponse.json({ messages, conversationId: conv.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[inbox/messages] unexpected error:', err);
    return NextResponse.json({ messages: [], conversationId: null, dbError: message });
  }
}
