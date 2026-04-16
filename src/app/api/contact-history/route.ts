import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

// GET: Fetch contact history for a lead
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const leadId = searchParams.get('leadId');

  if (!leadId) {
    return NextResponse.json({ error: 'Missing leadId' }, { status: 400 });
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

  const { data, error } = await supabase
    .from('contact_history')
    .select('*')
    .eq('lead_id', leadId)
    .eq('user_id', user.id)
    .order('contact_date', { ascending: false });

  if (error) {
    console.error('Error fetching contact history:', error);
    return NextResponse.json({ error: 'Failed to fetch contact history' }, { status: 500 });
  }

  return NextResponse.json({ history: data });
}

// POST: Add new contact history entry
export async function POST(request: NextRequest) {
  const { leadId, contactDate, notes } = await request.json();

  if (!leadId || !contactDate) {
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

  // Insert contact history
  const { data: historyEntry, error: historyError } = await supabase
    .from('contact_history')
    .insert({
      user_id: user.id,
      lead_id: leadId,
      contact_date: contactDate,
      notes: notes || null,
    })
    .select()
    .single();

  if (historyError) {
    console.error('Error creating contact history:', historyError);
    return NextResponse.json({ error: 'Failed to create contact history' }, { status: 500 });
  }

  // Update last_contact on the lead
  const { error: updateError } = await supabase
    .from('leads')
    .update({ last_contact: contactDate })
    .eq('id', leadId)
    .eq('user_id', user.id);

  if (updateError) {
    console.error('Error updating last_contact:', updateError);
  }

  revalidatePath('/dashboard');
  return NextResponse.json({ historyEntry });
}

// DELETE: Remove a contact history entry
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Missing history entry ID' }, { status: 400 });
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
    .from('contact_history')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    console.error('Error deleting contact history:', error);
    return NextResponse.json({ error: 'Failed to delete contact history' }, { status: 500 });
  }

  revalidatePath('/dashboard');
  return NextResponse.json({ success: true });
}
