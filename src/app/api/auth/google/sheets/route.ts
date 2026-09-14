import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getGoogleAccessToken } from '@/lib/google/token';

export const dynamic = 'force-dynamic';

/**
 * GET /api/auth/google/sheets
 * Lists the user's Google Sheets spreadsheets from Drive.
 * Returns: { sheets: [{ id, name, modifiedTime, url }] }
 */
export async function GET() {
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

  const accessToken = await getGoogleAccessToken(supabase, user.id);
  if (!accessToken) {
    return NextResponse.json({ error: 'not_connected' }, { status: 401 });
  }

  // List spreadsheets from Google Drive (most recently modified first)
  const params = new URLSearchParams({
    q:        "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
    fields:   'files(id,name,modifiedTime,webViewLink)',
    orderBy:  'modifiedTime desc',
    pageSize: '50',
  });

  const driveRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!driveRes.ok) {
    const err = await driveRes.json();
    return NextResponse.json({ error: err.error?.message || 'Drive API error' }, { status: 502 });
  }

  const { files } = await driveRes.json();

  return NextResponse.json({
    sheets: (files ?? []).map((f: any) => ({
      id:           f.id,
      name:         f.name,
      modifiedTime: f.modifiedTime,
      url:          f.webViewLink,
    })),
  });
}
