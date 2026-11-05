import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { APPLICATION_BRAND_LIST, parseApplicationBrand } from '@/lib/applicationBrands';
import { loadApplicationBrand, saveApplicationBrand } from '@/lib/applicationBrandStore';

export const dynamic = 'force-dynamic';

async function getClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } },
  );
}

export async function GET() {
  const supabase = await getClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const brand = await loadApplicationBrand(supabase, user.id);
  return NextResponse.json({
    brand,
    brands: APPLICATION_BRAND_LIST.map((b) => ({
      id: b.id,
      label: b.label,
      header: b.header,
      legalName: b.legalName,
      email: b.email,
      broker: b.broker,
    })),
  });
}

export async function POST(req: Request) {
  const supabase = await getClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const brand = parseApplicationBrand(body.brand);
  const saved = await saveApplicationBrand(supabase, user.id, brand);
  return NextResponse.json({ brand, saved: saved.ok, needsColumn: saved.needsColumn ?? false });
}
