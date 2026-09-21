import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

// PATCH /api/leads/pipeline
// Body: { leadId: string } — sets in_pipeline = true
// Body: { leadId: string, field: 'lead_status' | 'temperature' | 'assigned_to', value: string }
export async function PATCH(req: NextRequest) {
  try {
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
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { leadId, field, value, status } = body;

    if (!leadId) {
      return NextResponse.json({ error: 'leadId is required' }, { status: 400 });
    }

    // If a specific field is provided, update just that field
    if (field) {
      const allowedFields = ['lead_status', 'temperature', 'assigned_to', 'in_pipeline'];
      if (!allowedFields.includes(field)) {
        return NextResponse.json({ error: 'Invalid field' }, { status: 400 });
      }

      const { error } = await supabase
        .from('leads')
        .update({ [field]: value })
        .eq('id', leadId)
        .eq('user_id', user.id);

      if (error) {
        console.error('[pipeline PATCH field]', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    // Default: move to pipeline — also set status to "New Lead" if not already set
    const { data: existing } = await supabase
      .from('leads')
      .select('lead_status')
      .eq('id', leadId)
      .eq('user_id', user.id)
      .single();

    const updatePayload: Record<string, unknown> = { in_pipeline: true };
    if (typeof status === 'string' && status.trim()) {
      updatePayload.lead_status = status.trim();
    } else if (!existing?.lead_status) {
      updatePayload.lead_status = 'New Lead';
    }

    const { error } = await supabase
      .from('leads')
      .update(updatePayload)
      .eq('id', leadId)
      .eq('user_id', user.id);

    if (error) {
      console.error('[pipeline PATCH]', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[pipeline PATCH]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
