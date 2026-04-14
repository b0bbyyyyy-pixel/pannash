import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

export async function POST(req: NextRequest) {
  try {
    const { leadId, content, scheduledTime, frequency } = await req.json();

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

    // Update lead with scheduled text information
    const { error } = await supabase
      .from('leads')
      .update({
        scheduled_text_content: content,
        scheduled_text_time: scheduledTime,
        scheduled_text_frequency: frequency,
        updated_at: new Date().toISOString(),
      })
      .eq('id', leadId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error scheduling text:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    revalidatePath('/dashboard');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in schedule-text route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
