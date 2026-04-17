import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { leadId, templateId, scheduledTime, frequency } = await request.json();

    if (!leadId) {
      return NextResponse.json({ error: 'Lead ID is required' }, { status: 400 });
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

    // Update the lead with scheduled email info
    const updateData: any = {
      scheduled_email_template_id: templateId || null,
      scheduled_email_time: scheduledTime || null,
      scheduled_email_frequency: frequency || 'once',
    };

    const { error } = await supabase
      .from('leads')
      .update(updateData)
      .eq('id', leadId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error scheduling email:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    revalidatePath('/dashboard');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in schedule-email route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
