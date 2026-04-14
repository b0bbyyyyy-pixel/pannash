import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

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

    const { domain, reason } = await req.json();

    if (!domain || typeof domain !== 'string') {
      return NextResponse.json({ error: 'Domain is required' }, { status: 400 });
    }

    // Clean and validate domain
    const cleanDomain = domain.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/^www\./, '');

    // Check if already exists
    const { data: existing } = await supabase
      .from('blocked_domains')
      .select('id')
      .eq('user_id', user.id)
      .eq('domain', cleanDomain)
      .single();

    if (existing) {
      return NextResponse.json({ error: 'Domain already blocked' }, { status: 400 });
    }

    // Insert new blocked domain
    const { data, error } = await supabase
      .from('blocked_domains')
      .insert({
        user_id: user.id,
        domain: cleanDomain,
        reason: reason || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Error adding blocked domain:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ domain: data });
  } catch (error) {
    console.error('Error in add blocked domain:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
