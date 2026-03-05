import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { monthKey, customName } = await req.json();

    if (!monthKey || !customName || !customName.trim()) {
      return NextResponse.json({ error: 'Month key and custom name are required' }, { status: 400 });
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

    // Update the monthly dashboard entry
    const { error } = await supabase
      .from('monthly_dashboards')
      .update({ custom_name: customName.trim() })
      .eq('user_id', user.id)
      .eq('month_key', monthKey);

    if (error) {
      console.error('Error updating monthly dashboard:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in update-month:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
