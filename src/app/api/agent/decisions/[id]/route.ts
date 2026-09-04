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

// PATCH — approve / snooze / dismiss a decision card
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { action, draft } = body; // action: 'approve' | 'snooze' | 'dismiss' | 'edit'

    // Fetch the decision to make sure it belongs to the user
    const { data: decision, error: fetchErr } = await supabase
      .from('agent_decisions')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (fetchErr || !decision) {
      return NextResponse.json({ error: 'Decision not found' }, { status: 404 });
    }

    let updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    let smsResult: Record<string, unknown> | null = null;

    if (action === 'approve') {
      // If this is an SMS draft, attempt to send via Twilio
      const draftToSend = draft ?? decision.draft_content;

      if (decision.draft_type === 'sms' && draftToSend && decision.lead_id) {
        try {
          const smsRes = await fetch(
            `${process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin : ''}/api/sms/send`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Cookie: req.headers.get('cookie') || '' },
              body: JSON.stringify({ leadId: decision.lead_id, message: draftToSend }),
            }
          );

          if (!smsRes.ok) {
            // Don't block — mark approved but surface the error
            smsResult = { sent: false, error: await smsRes.text() };
          } else {
            smsResult = { sent: true };
          }
        } catch (smsErr) {
          smsResult = { sent: false, error: String(smsErr) };
        }
      }

      updatePayload = {
        ...updatePayload,
        status: 'sent',
        acted_at: new Date().toISOString(),
        draft_content: draft ?? decision.draft_content,
        metadata: { ...(decision.metadata || {}), send_result: smsResult },
      };
    } else if (action === 'snooze') {
      const snoozeMinutes = body.minutes ?? 60;
      const snooze_until = new Date(Date.now() + snoozeMinutes * 60_000).toISOString();
      updatePayload = { ...updatePayload, status: 'snoozed', snooze_until };
    } else if (action === 'dismiss') {
      updatePayload = { ...updatePayload, status: 'dismissed', acted_at: new Date().toISOString() };
    } else if (action === 'edit') {
      // Just update the draft content; keep status pending
      updatePayload = { ...updatePayload, draft_content: draft };
    } else {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

    const { data: updated, error: updateErr } = await supabase
      .from('agent_decisions')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (updateErr) throw updateErr;

    return NextResponse.json({ decision: updated, smsResult });
  } catch (err) {
    console.error('[agent/decisions/[id] PATCH]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
