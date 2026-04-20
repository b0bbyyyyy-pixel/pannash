import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// PUT - Update underwriting data for a lead
export async function PUT(request: NextRequest) {
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

  const { leadId, underwritingData } = await request.json();

  if (!leadId || !underwritingData) {
    return NextResponse.json(
      { error: 'Lead ID and underwriting data are required' },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from('leads')
    .update({
      underwriting_data: underwritingData,
    })
    .eq('id', leadId)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) {
    console.error('Error updating underwriting data:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ lead: data });
}
