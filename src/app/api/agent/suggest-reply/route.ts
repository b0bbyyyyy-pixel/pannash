import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import OpenAI from 'openai';

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );
}

// POST — given a lead/conversation, generate a reply suggestion and create an agent_decision card
export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { lead_id, conversation_id, lead_name, company } = await req.json();

    if (!lead_id && !conversation_id) {
      return NextResponse.json({ error: 'lead_id or conversation_id required' }, { status: 400 });
    }

    // Fetch recent messages for context
    let convId = conversation_id;
    if (!convId && lead_id) {
      const { data: conv } = await supabase
        .from('inbox_conversations')
        .select('id')
        .eq('lead_id', lead_id)
        .eq('user_id', user.id)
        .order('last_message_at', { ascending: false })
        .limit(1)
        .single();
      convId = conv?.id;
    }

    let messages: { direction: string; body: string; created_at: string }[] = [];
    if (convId) {
      const { data: msgs } = await supabase
        .from('inbox_messages')
        .select('direction, body, created_at')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: false })
        .limit(12);
      messages = (msgs || []).reverse();
    }

    // Build conversation transcript
    const transcript = messages
      .map((m) => `${m.direction === 'inbound' ? 'Lead' : 'You'}: ${m.body}`)
      .join('\n');

    const lastInbound = messages.filter((m) => m.direction === 'inbound').at(-1);
    const name = lead_name || 'this lead';

    // Generate draft with OpenAI
    let draft = '';
    try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.7,
        max_tokens: 150,
        messages: [
          {
            role: 'system',
            content: `You are a sales co-pilot writing SMS replies on behalf of the user. 
Write short, warm, natural text messages (1-3 sentences). 
No emojis unless the conversation is casual. First name only. No corporate speak.
Match the tone of the existing conversation.`,
          },
          {
            role: 'user',
            content: transcript
              ? `Conversation so far:\n${transcript}\n\nWrite a reply from the salesperson to ${name}.`
              : `Write a natural follow-up SMS to ${name}${company ? ` at ${company}` : ''} who hasn't been contacted recently.`,
          },
        ],
      });
      draft = completion.choices[0]?.message?.content?.trim() || '';
    } catch {
      // Fallback draft if OpenAI fails
      const firstName = name.split(' ')[0];
      draft = lastInbound?.body
        ? `Hey ${firstName}, thanks for reaching out — happy to help. Can you tell me a bit more?`
        : `Hey ${firstName}, just checking in to see if you're still interested in moving forward. Let me know!`;
    }

    // Create the agent decision card
    const { data: decision, error } = await supabase
      .from('agent_decisions')
      .insert({
        user_id: user.id,
        lead_id: lead_id || null,
        lead_name: name,
        company: company || null,
        type: 'suggest_reply',
        priority: 'urgent',
        proposal: `I drafted a reply to ${name}${lastInbound ? ` — they said: "${lastInbound.body.slice(0, 60)}${lastInbound.body.length > 60 ? '…' : ''}"` : ''}. Want to send it?`,
        draft_content: draft,
        draft_type: 'sms',
        conversation_id: convId || null,
        metadata: { generated_by: 'ai', message_count: messages.length },
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ decision, draft });
  } catch (err) {
    console.error('[agent/suggest-reply POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
