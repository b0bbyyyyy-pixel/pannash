import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

export async function POST(req: NextRequest) {
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

    const { campaignId, isMain } = await req.json();

    if (!campaignId || typeof isMain !== 'boolean') {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    // If setting as main, first unset all other campaigns
    if (isMain) {
      await supabase
        .from('campaigns')
        .update({ is_main: false })
        .eq('user_id', user.id);
    }

    // Update the target campaign
    const { error } = await supabase
      .from('campaigns')
      .update({ is_main: isMain })
      .eq('id', campaignId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error setting main campaign:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    revalidatePath('/campaigns');

    return NextResponse.json({ 
      success: true,
      message: isMain ? 'Set as main campaign' : 'Removed as main campaign'
    });
  } catch (error: any) {
    console.error('Error in set main campaign:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
