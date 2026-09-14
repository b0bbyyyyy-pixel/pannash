import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getGoogleAccessToken } from '@/lib/google/token';

export const dynamic = 'force-dynamic';

/**
 * GET /api/auth/google/sheets
 *   — lists the user's Google Sheets spreadsheets from Drive
 *   Returns: { sheets: [{ id, name, modifiedTime }] }
 *
 * GET /api/auth/google/sheets?sheetId={id}
 *   — lists the tabs (worksheets) inside a specific spreadsheet
 *   Returns: { tabs: [{ gid, title, index }] }
 */
export async function GET(request: NextRequest) {
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

  const sheetId = request.nextUrl.searchParams.get('sheetId');

  // ── Tab listing for a specific spreadsheet ───────────────────────────────
  if (sheetId) {
    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!metaRes.ok) {
      const err = await metaRes.json();
      return NextResponse.json({ error: err.error?.message || 'Sheets API error' }, { status: 502 });
    }
    const meta = await metaRes.json();
    const tabs = (meta.sheets ?? []).map((s: any) => ({
      gid:   String(s.properties.sheetId),
      title: s.properties.title,
      index: s.properties.index,
    }));
    return NextResponse.json({ tabs });
  }

  // ── Spreadsheet listing from Drive ───────────────────────────────────────
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
    })),
  });
}
