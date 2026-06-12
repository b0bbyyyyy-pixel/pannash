import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function makeClient(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return createServerClient(
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
}

// GET: fetch all pitch templates for the current user
export async function GET() {
  const cookieStore = await cookies();
  const supabase = makeClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('message_templates')
    .select('*')
    .eq('user_id', user.id)
    .eq('type', 'pitch')
    .order('name', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ templates: data });
}

// POST: create a new pitch template
export async function POST(request: NextRequest) {
  const { name, body } = await request.json();
  if (!name || !body) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });

  const cookieStore = await cookies();
  const supabase = makeClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: template, error } = await supabase
    .from('message_templates')
    .insert({ user_id: user.id, type: 'pitch', name, body })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ template });
}

// PUT: update an existing pitch template
export async function PUT(request: NextRequest) {
  const { id, name, body } = await request.json();
  if (!id || !name || !body) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });

  const cookieStore = await cookies();
  const supabase = makeClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: template, error } = await supabase
    .from('message_templates')
    .update({ name, body, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('type', 'pitch')
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ template });
}

// DELETE: delete a pitch template
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing template ID' }, { status: 400 });

  const cookieStore = await cookies();
  const supabase = makeClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { error } = await supabase
    .from('message_templates')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('type', 'pitch');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
