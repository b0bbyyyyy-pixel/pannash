import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { customName } = await req.json();

    if (!customName || !customName.trim()) {
      return NextResponse.json({ error: 'Custom name is required' }, { status: 400 });
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

    // Generate month key (use current timestamp to ensure uniqueness)
    const monthKey = new Date().toISOString().slice(0, 16).replace('T', '_').replace(/:/g, '-'); // YYYY-MM-DD_HH-MM

    // Create the monthly dashboard entry
    const { data: monthlyDashboard, error } = await supabase
      .from('monthly_dashboards')
      .insert({
        user_id: user.id,
        month_key: monthKey,
        custom_name: customName.trim(),
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating monthly dashboard:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      return NextResponse.json({ 
        error: error.message || 'Failed to create dashboard',
        details: error 
      }, { status: 500 });
    }

    return NextResponse.json({ monthlyDashboard });
  } catch (error: any) {
    console.error('Error in create-month:', error);
    console.error('Error stack:', error.stack);
    return NextResponse.json({ 
      error: 'Internal server error',
      message: error.message 
    }, { status: 500 });
  }
}
