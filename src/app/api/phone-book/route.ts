import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import {
  emptyPhoneBook,
  mergePhoneBook,
  normalizeContact,
  parsePhoneBook,
  type BookContact,
  type PhoneBookStore,
} from '@/lib/phoneBook';
import { LENDERS } from '@/data/lenders';

export const dynamic = 'force-dynamic';

async function client() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } },
  );
}

async function loadStore(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
): Promise<{ store: PhoneBookStore; persistable: boolean }> {
  const { data, error } = await supabase
    .from('user_settings')
    .select('phone_book')
    .eq('user_id', userId)
    .maybeSingle();
  if (error && /phone_book|schema cache|42703|PGRST/i.test(`${error.message || ''} ${error.code || ''}`)) {
    return { store: emptyPhoneBook(), persistable: false };
  }
  return { store: parsePhoneBook(data?.phone_book), persistable: true };
}

async function saveStore(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  store: PhoneBookStore,
) {
  const { data: existing } = await supabase
    .from('user_settings')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  const payload = { phone_book: store, updated_at: new Date().toISOString() };
  const { error } = existing
    ? await supabase.from('user_settings').update(payload).eq('user_id', userId)
    : await supabase.from('user_settings').insert({ user_id: userId, ...payload });
  return error;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function lendersForUser(supabase: any, userId: string) {
  const { data } = await supabase
    .from('lenders')
    .select('name, email, cc_email, rep_name, contact_phone, rep_direct_phone')
    .eq('user_id', userId)
    .order('name', { ascending: true });
  if (data?.length) return data as Array<Record<string, unknown>>;
  return LENDERS as unknown as Array<Record<string, unknown>>;
}

export async function GET() {
  const supabase = await client();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [{ store, persistable }, lenders] = await Promise.all([
    loadStore(supabase, user.id),
    lendersForUser(supabase, user.id),
  ]);
  return NextResponse.json({
    contacts: mergePhoneBook(store, lenders),
    persistable,
  });
}

export async function POST(req: NextRequest) {
  const supabase = await client();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const contact = normalizeContact({
    ...body,
    id: body.id || `saved:${crypto.randomUUID()}`,
    source: 'saved',
  });
  if (!contact) return NextResponse.json({ error: 'Name, email, or phone required' }, { status: 400 });

  const { store, persistable } = await loadStore(supabase, user.id);
  if (!persistable) {
    return NextResponse.json({ error: 'Run add-phone-book.sql in Supabase to save contacts.' }, { status: 500 });
  }
  const extras = [contact, ...store.extras.filter(c => c.id !== contact.id)];
  const next: PhoneBookStore = { ...store, extras };
  const error = await saveStore(supabase, user.id, next);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const lenders = await lendersForUser(supabase, user.id);
  return NextResponse.json({ contact, contacts: mergePhoneBook(next, lenders) });
}

export async function PATCH(req: NextRequest) {
  const supabase = await client();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const id = String(body.id || '').trim();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const { store, persistable } = await loadStore(supabase, user.id);
  if (!persistable) {
    return NextResponse.json({ error: 'Run add-phone-book.sql in Supabase to save contacts.' }, { status: 500 });
  }

  const existing = store.extras.find(c => c.id === id);
  const patched = normalizeContact({
    ...(existing || { id, source: 'saved' }),
    ...body,
    id,
    source: 'saved',
  }) as BookContact;

  const extras = existing
    ? store.extras.map(c => (c.id === id ? patched : c))
    : [patched, ...store.extras];
  const next: PhoneBookStore = { extras, hidden: store.hidden.filter(h => h !== id) };
  const error = await saveStore(supabase, user.id, next);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const lenders = await lendersForUser(supabase, user.id);
  return NextResponse.json({ contact: patched, contacts: mergePhoneBook(next, lenders) });
}

export async function DELETE(req: NextRequest) {
  const supabase = await client();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const id = String(body.id || req.nextUrl.searchParams.get('id') || '').trim();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const { store, persistable } = await loadStore(supabase, user.id);
  if (!persistable) {
    return NextResponse.json({ error: 'Run add-phone-book.sql in Supabase to save contacts.' }, { status: 500 });
  }

  const extras = store.extras.filter(c => c.id !== id);
  const hidden = store.hidden.includes(id) ? store.hidden : [...store.hidden, id];
  const next: PhoneBookStore = { extras, hidden };
  const error = await saveStore(supabase, user.id, next);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const lenders = await lendersForUser(supabase, user.id);
  return NextResponse.json({ contacts: mergePhoneBook(next, lenders) });
}
