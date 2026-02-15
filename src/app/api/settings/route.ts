import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// GET user's automation settings
export async function GET() {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name) {
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

    // Get or create settings
    let { data: settings } = await supabase
      .from('automation_settings')
      .select('*')
      .eq('user_id', user.id)
      .single();

    // If no settings exist, create default ones
    if (!settings) {
      const { data: newSettings } = await supabase
        .from('automation_settings')
        .insert({ user_id: user.id })
        .select()
        .single();
      
      settings = newSettings;
    }

    return NextResponse.json(settings);
  } catch (error: any) {
    console.error('Error fetching settings:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST/PUT to update settings
export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name) {
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

    // Upsert settings (insert or update)
    const { data, error } = await supabase
      .from('automation_settings')
      .upsert({
        user_id: user.id,
        daily_limit: body.daily_limit,
        email_frequency: body.email_frequency,
        business_hours_only: body.business_hours_only,
        loop_after_days: body.loop_after_days,
        followup_enabled: body.followup_enabled,
        followup_timing: body.followup_timing,
        ai_personalization: body.ai_personalization,
        auto_start_daily: body.auto_start_daily,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id'
      })
      .select()
      .single();

    if (error) {
      console.error('Error saving settings:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Settings saved successfully',
      data 
    });
  } catch (error: any) {
    console.error('Error updating settings:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
