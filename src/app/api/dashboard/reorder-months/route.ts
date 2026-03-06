import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function POST(req: NextRequest) {
  try {
    const { monthKeys } = await req.json();

    if (!Array.isArray(monthKeys) || monthKeys.length === 0) {
      return NextResponse.json({ error: 'Invalid month keys' }, { status: 400 });
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

    // Update display_order for each month based on array index
    const updates = monthKeys.map((monthKey, index) =>
      supabase
        .from('monthly_dashboards')
        .update({ display_order: index })
        .eq('user_id', user.id)
        .eq('month_key', monthKey)
    );

    await Promise.all(updates);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error reordering months:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
