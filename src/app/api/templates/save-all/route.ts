import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { emailTemplates, textTemplates } = await req.json();

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

    // Delete existing templates
    await supabase
      .from('message_templates')
      .delete()
      .eq('user_id', user.id);

    // Insert all templates
    const allTemplates = [
      ...emailTemplates.map((t: any) => ({
        user_id: user.id,
        type: 'email',
        name: t.name,
        subject: t.subject,
        body: t.body,
      })),
      ...textTemplates.map((t: any) => ({
        user_id: user.id,
        type: 'text',
        name: t.name,
        body: t.body,
      })),
    ];

    const { error } = await supabase
      .from('message_templates')
      .insert(allTemplates);

    if (error) {
      console.error('Error saving templates:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in save-all templates:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
