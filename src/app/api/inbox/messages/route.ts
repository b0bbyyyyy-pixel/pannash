import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// GET /api/inbox/messages?leadId=xxx  — fetch thread + mark read
export async function GET(req: NextRequest) {
  try {
    const leadId = req.nextUrl.searchParams.get('leadId');
    if (!leadId) return NextResponse.json({ error: 'leadId required' }, { status: 400 });

    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Get or create conversation (table may not exist yet)
    let conv: any = null;
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
      // Table not yet created — return empty thread
      return NextResponse.json({ messages: [], conversationId: null, setupRequired: true });
    }

    if (!conv) return NextResponse.json({ messages: [], conversationId: null });

    // Fetch messages
    let messages: any[] = [];
    try {
      const { data } = await supabase
        .from('inbox_messages')
        .select('*')
        .eq('conversation_id', conv.id)
        .order('created_at', { ascending: true });
      messages = data ?? [];
    } catch {
      // Table not yet created
    }

    // Mark as read
    if (conv.unread_count > 0) {
      await supabase
        .from('inbox_conversations')
        .update({ unread_count: 0 })
        .eq('id', conv.id);
    }

    return NextResponse.json({ messages, conversationId: conv.id });
  } catch (err: any) {
    console.error('[inbox/messages] unexpected error:', err);
    return NextResponse.json({ messages: [], conversationId: null, dbError: err?.message });
  }
}
