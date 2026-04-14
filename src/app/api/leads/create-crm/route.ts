import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { name, email, phone, company, monthKey } = await req.json();

    if (!name || !email) {
      return NextResponse.json({ error: 'Name and email are required' }, { status: 400 });
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

    // Create the lead with default CRM values
    const { data: lead, error } = await supabase
      .from('leads')
      .insert({
        user_id: user.id,
        name,
        email,
        phone: phone || null,
        company: company || null,
        stage: 'Offers/Follow up',
        value: 0,
        timer_type: 'No Timer',
        auto_email_frequency: 'Off',
        auto_text_frequency: 'Off',
        month_key: monthKey || new Date().toISOString().slice(0, 7), // YYYY-MM format
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating lead:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ lead });
  } catch (error) {
    console.error('Error in create-crm:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
