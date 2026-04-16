import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

export async function POST(req: NextRequest) {
  try {
    const { leadId, destinationMonth } = await req.json();

    if (!leadId || !destinationMonth) {
      return NextResponse.json({ error: 'Lead ID and destination month are required' }, { status: 400 });
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

    // Update the lead's month_key
    const { error } = await supabase
      .from('leads')
      .update({ 
        month_key: destinationMonth,
        updated_at: new Date().toISOString(),
      })
      .eq('id', leadId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error moving lead:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    revalidatePath('/dashboard');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in move-lead route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
