import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { leadId, field, value } = await req.json();

    if (!leadId || !field) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

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

    // Handle timer field specially (updates both timer_type and timer_end_date)
    if (field === 'timer') {
      const { timer_type, timer_end_date } = value;
      console.log('[Timer Update]', { leadId, timer_type, timer_end_date });
      
      const { data, error } = await supabase
        .from('leads')
        .update({ timer_type, timer_end_date })
        .eq('id', leadId)
        .eq('user_id', user.id)
        .select();

      if (error) {
        console.error('[Timer Update Error]:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      console.log('[Timer Update Success]:', data);
      return NextResponse.json({ success: true, data });
    }

    // Allowed fields to update
    const allowedFields = [
      'company',
      'name',
      'email',
      'phone',
      'notes',
      'stage',
      'value',
      'lead_source',
      'last_contact',
      'offers',
      'timer_type',
      'timer_end_date',
      'auto_email_frequency',
      'auto_text_frequency',
      'email_template_id',
      'text_template_id',
      'last_email_sent',
      'last_text_sent',
    ];

    if (!allowedFields.includes(field)) {
      return NextResponse.json({ error: 'Invalid field' }, { status: 400 });
    }

    // Update the lead
    const { error } = await supabase
      .from('leads')
      .update({ [field]: value })
      .eq('id', leadId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error updating lead:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in update-crm:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
