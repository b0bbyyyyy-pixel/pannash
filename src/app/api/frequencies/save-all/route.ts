import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
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

    const { emailFrequencies, textFrequencies } = await req.json();

    // Delete existing frequencies for this user
    const { error: deleteError } = await supabase
      .from('auto_frequencies')
      .delete()
      .eq('user_id', user.id);

    if (deleteError) {
      console.error('Error deleting frequencies:', deleteError);
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    // Prepare all frequencies for insert
    const allFrequencies = [
      ...emailFrequencies.map((f: any) => ({
        id: f.id.startsWith('new-') ? undefined : f.id,
        user_id: user.id,
        name: f.name,
        days_interval: f.days_interval,
        bg_color: f.bg_color,
        text_color: f.text_color,
        type: f.type || 'email'
      })),
      ...textFrequencies
        .filter((f: any) => !emailFrequencies.find((e: any) => e.name === f.name && f.type === 'both'))
        .map((f: any) => ({
          id: f.id.startsWith('new-') ? undefined : f.id,
          user_id: user.id,
          name: f.name,
          days_interval: f.days_interval,
          bg_color: f.bg_color,
          text_color: f.text_color,
          type: f.type || 'text'
        }))
    ];

    // Insert new frequencies
    const { error: insertError } = await supabase
      .from('auto_frequencies')
      .insert(allFrequencies);

    if (insertError) {
      console.error('Error inserting frequencies:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in save-all frequencies:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}
