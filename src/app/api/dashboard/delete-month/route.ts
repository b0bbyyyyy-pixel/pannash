import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { monthKey } = await req.json();

    if (!monthKey) {
      return NextResponse.json({ error: 'Month key is required' }, { status: 400 });
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

    // Delete the monthly dashboard entry
    const { error } = await supabase
      .from('monthly_dashboards')
      .delete()
      .eq('user_id', user.id)
      .eq('month_key', monthKey);

    if (error) {
      console.error('Error deleting monthly dashboard:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in delete-month:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
