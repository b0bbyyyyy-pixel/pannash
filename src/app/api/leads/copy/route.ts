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

    // Fetch the original lead
    const { data: originalLead, error: fetchError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !originalLead) {
      console.error('Error fetching lead:', fetchError);
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    // Create a copy with new month_key (id will be auto-generated)
    const { id, created_at, updated_at, ...leadData } = originalLead;
    const newLead = {
      ...leadData,
      month_key: destinationMonth,
    };

    const { error: insertError } = await supabase
      .from('leads')
      .insert(newLead);

    if (insertError) {
      console.error('Error copying lead:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    revalidatePath('/dashboard');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in copy-lead route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
