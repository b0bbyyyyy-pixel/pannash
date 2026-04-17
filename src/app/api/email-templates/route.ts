import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

// GET: Fetch all email templates for the user
export async function GET(request: NextRequest) {
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

  const { data, error } = await supabase
    .from('email_templates')
    .select('*')
    .eq('user_id', user.id)
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching email templates:', error);
    return NextResponse.json({ error: 'Failed to fetch email templates' }, { status: 500 });
  }

  return NextResponse.json({ templates: data });
}

// POST: Create new email template
export async function POST(request: NextRequest) {
  const { name, subject, body } = await request.json();

  if (!name || !subject || !body) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
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

  const { data: template, error } = await supabase
    .from('email_templates')
    .insert({
      user_id: user.id,
      name,
      subject,
      body,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating email template:', error);
    return NextResponse.json({ error: 'Failed to create email template' }, { status: 500 });
  }

  revalidatePath('/dashboard');
  return NextResponse.json({ template });
}

// PUT: Update email template
export async function PUT(request: NextRequest) {
  const { id, name, subject, body } = await request.json();

  if (!id || !name || !subject || !body) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
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

  const { data: template, error } = await supabase
    .from('email_templates')
    .update({
      name,
      subject,
      body,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) {
    console.error('Error updating email template:', error);
    return NextResponse.json({ error: 'Failed to update email template' }, { status: 500 });
  }

  revalidatePath('/dashboard');
  return NextResponse.json({ template });
}

// DELETE: Delete email template
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Missing template ID' }, { status: 400 });
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

  const { error } = await supabase
    .from('email_templates')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    console.error('Error deleting email template:', error);
    return NextResponse.json({ error: 'Failed to delete email template' }, { status: 500 });
  }

  revalidatePath('/dashboard');
  return NextResponse.json({ success: true });
}
