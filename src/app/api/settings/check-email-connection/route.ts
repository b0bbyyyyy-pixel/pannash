import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET() {
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
      return NextResponse.json({ hasConnection: false }, { status: 401 });
    }

    const { data: connections } = await supabase
      .from('email_connections')
      .select('*')
      .eq('user_id', user.id);

    const hasConnection = connections && connections.length > 0;

    return NextResponse.json({ hasConnection });
  } catch (error: any) {
    console.error('Error checking email connection:', error);
    return NextResponse.json({ hasConnection: false }, { status: 500 });
  }
}
