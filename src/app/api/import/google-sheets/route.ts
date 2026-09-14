import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getGoogleAccessToken } from '@/lib/google/token';

export const dynamic = 'force-dynamic';

function parseGoogleSheetsUrl(url: string): { sheetId: string; gid: string } | null {
  try {
    const u = new URL(url);
    const match = u.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (!match) return null;
    const sheetId = match[1];
    const gid =
      new URLSearchParams(u.search).get('gid') ||
      new URLSearchParams(u.hash.replace('#', '')).get('gid') ||
      '0';
    return { sheetId, gid };
  } catch {
    return null;
  }
}

/**
 * GET /api/import/google-sheets?url=<url>  — URL-based import
 * GET /api/import/google-sheets?sheetId=<id>&gid=<gid>  — picker-based import
 *
 * Strategy:
 *  1. If the user has a connected Google account → use OAuth (works on private sheets)
 *  2. Otherwise → fall back to public CSV export (requires "anyone with link" sharing)
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

  // Resolve sheetId + gid
  let sheetId: string | null = request.nextUrl.searchParams.get('sheetId');
  let gid     = request.nextUrl.searchParams.get('gid') || '0';
  const url   = request.nextUrl.searchParams.get('url');

  if (url) {
    const parsed = parseGoogleSheetsUrl(url);
    if (!parsed) {
      return NextResponse.json(
        { error: 'Invalid Google Sheets URL. Copy the full URL from your browser address bar.' },
        { status: 400 }
      );
    }
    sheetId = parsed.sheetId;
    gid     = parsed.gid;
  }

  if (!sheetId) {
    return NextResponse.json({ error: 'Provide either url or sheetId parameter.' }, { status: 400 });
  }

  // Try OAuth first
  const accessToken = await getGoogleAccessToken(supabase, user.id);

  let csv: string;

  if (accessToken) {
    // ── OAuth path: read sheet via Sheets API v4 ───────────────────────────
    // First get sheet metadata to find the tab name for the requested gid
    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!metaRes.ok) {
      if (metaRes.status === 403 || metaRes.status === 401) {
        return NextResponse.json(
          { error: 'Google access expired. Please reconnect your Google account.' },
          { status: 403 }
        );
      }
      if (metaRes.status === 404) {
        return NextResponse.json({ error: 'Sheet not found in your Google Drive.' }, { status: 404 });
      }
      return NextResponse.json({ error: `Google Sheets API error: ${metaRes.status}` }, { status: 502 });
    }

    const meta = await metaRes.json();
    // Find the tab whose sheetId (numeric) matches gid
    const sheets: any[] = meta.sheets ?? [];
    const targetSheet = sheets.find((s: any) => String(s.properties?.sheetId) === gid) ?? sheets[0];
    const tabName: string = targetSheet?.properties?.title ?? 'Sheet1';

    // Fetch as CSV via export endpoint (authenticated)
    const csvRes = await fetch(
      `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        redirect: 'follow',
      }
    );

    if (!csvRes.ok) {
      return NextResponse.json(
        { error: `Failed to export sheet "${tabName}": HTTP ${csvRes.status}` },
        { status: 502 }
      );
    }

    csv = await csvRes.text();
  } else {
    // ── Public CSV fallback ────────────────────────────────────────────────
    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
    const res = await fetch(csvUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
      redirect: 'follow',
    });

    if (res.status === 401 || res.status === 403 || (res.headers.get('content-type') || '').includes('text/html')) {
      return NextResponse.json(
        {
          error:
            'This sheet is private. Connect your Google account (click "Sign in with Google" above) or share the sheet as "Anyone with the link can view".',
          needsAuth: true,
        },
        { status: 403 }
      );
    }
    if (!res.ok) {
      return NextResponse.json({ error: `Google returned HTTP ${res.status}` }, { status: 502 });
    }
    csv = await res.text();
  }

  if (!csv || csv.trim().length === 0) {
    return NextResponse.json({ error: 'Sheet appears to be empty.' }, { status: 422 });
  }

  return NextResponse.json({ csv, sheetId, gid });
}
