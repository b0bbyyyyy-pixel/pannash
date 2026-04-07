import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

export async function GET() {
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

    // Fetch user settings
    const { data: settings } = await supabase
      .from('user_settings')
      .select('timezone')
      .eq('user_id', user.id)
      .maybeSingle();

    return NextResponse.json({ 
      timezone: settings?.timezone || 'America/New_York'
    });
  } catch (error) {
    console.error('Error fetching timezone:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { timezone } = await req.json();

    if (!timezone) {
      return NextResponse.json({ error: 'Timezone is required' }, { status: 400 });
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

    // Check if settings exist
    const { data: existing } = await supabase
      .from('user_settings')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing) {
      // Update existing settings
      const { error } = await supabase
        .from('user_settings')
        .update({
          timezone,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);

      if (error) {
        console.error('Error updating timezone:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else {
      // Insert new settings
      const { error } = await supabase
        .from('user_settings')
        .insert({
          user_id: user.id,
          timezone,
        });

      if (error) {
        console.error('Error inserting timezone:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    revalidatePath('/settings/timezone');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in timezone update:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
