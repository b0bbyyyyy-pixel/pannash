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

    const { name, description, folderName, parentListId } = await req.json();

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const row: Record<string, unknown> = {
      user_id: user.id,
      name,
      description: description || null,
    };
    if (folderName && typeof folderName === 'string' && folderName.trim()) {
      row.folder_name = folderName.trim();
    }
    if (parentListId && typeof parentListId === 'string') {
      row.parent_list_id = parentListId;
    }

    const { data, error } = await supabase
      .from('lead_lists')
      .insert(row)
      .select()
      .single();

    if (error) {
      console.error('Error creating lead list:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ list: data });
  } catch (error) {
    console.error('Error in create lead list:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
