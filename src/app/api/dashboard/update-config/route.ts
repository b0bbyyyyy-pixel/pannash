import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { configType, configData } = await req.json();

    if (!configType || !configData) {
      return NextResponse.json({ error: 'Config type and data are required' }, { status: 400 });
    }

    if (!['stages', 'stats', 'columns'].includes(configType)) {
      return NextResponse.json({ error: 'Invalid config type' }, { status: 400 });
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

    // Upsert the configuration
    const { error } = await supabase
      .from('dashboard_config')
      .upsert({
        user_id: user.id,
        config_type: configType,
        config_data: configData,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,config_type'
      });

    if (error) {
      console.error('Error updating dashboard config:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in update-config:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
