import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function PATCH(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) { return cookieStore.get(name)?.value; },
          set() {},
          remove() {},
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { listId, newName, oldFolderName, newFolderName } = await req.json();

    // Rename a specific list
    if (listId && newName) {
      const { error } = await supabase
        .from('lead_lists')
        .update({ name: newName.trim() })
        .eq('id', listId)
        .eq('user_id', user.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    // Rename a folder (update folder_name on all lists in that folder)
    if (oldFolderName && newFolderName) {
      const { error } = await supabase
        .from('lead_lists')
        .update({ folder_name: newFolderName.trim() })
        .eq('folder_name', oldFolderName)
        .eq('user_id', user.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch all lead lists with lead counts
    const { data: leadLists } = await supabase
      .from('lead_lists')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    // Get lead count for each list
    const listsWithCounts = await Promise.all(
      (leadLists || []).map(async (list) => {
        const { count } = await supabase
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .eq('list_id', list.id);
        
        return { ...list, lead_count: count || 0 };
      })
    );

    return NextResponse.json({ lists: listsWithCounts });
  } catch (error: any) {
    console.error('Error fetching lead lists:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
