import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
/** Large PDFs + parsing — allow headroom on supported plans */
export const maxDuration = 300;

export async function POST(request: NextRequest) {
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

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const raw =
    process.env.BANK_ANALYZER_URL?.trim() ||
    (process.env.NODE_ENV === 'development' ? 'http://127.0.0.1:8001' : '');
  const base = raw.replace(/\/$/, '');
  if (!base) {
    return NextResponse.json(
      {
        error:
          'Bank analyzer is not configured. Set BANK_ANALYZER_URL to your FastAPI service URL (e.g. https://your-analyzer.example.com).',
      },
      { status: 503 }
    );
  }

  const incoming = await request.formData();
  const multiFiles = incoming
    .getAll('files')
    .filter((v): v is File => v instanceof File && v.size > 0);
  const single = incoming.get('file');
  const singleFile = single instanceof File && single.size > 0 ? single : null;

  const outbound = new FormData();
  let path: string;

  if (singleFile && multiFiles.length === 0) {
    path = '/analyze';
    outbound.append('file', singleFile, singleFile.name);
  } else if (multiFiles.length > 0) {
    path = '/analyze-multi';
    for (const f of multiFiles) {
      outbound.append('files', f, f.name);
    }
  } else {
    return NextResponse.json({ error: 'No PDF or CSV file provided.' }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${base}${path}`, {
      method: 'POST',
      body: outbound,
    });
  } catch (e) {
    console.error('bank-analyze proxy fetch failed:', e);
    return NextResponse.json(
      { error: 'Could not reach the bank analyzer service. Check BANK_ANALYZER_URL and that the service is running.' },
      { status: 502 }
    );
  }

  const text = await upstream.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { error: text || 'Invalid JSON from analyzer' };
  }

  return NextResponse.json(body, { status: upstream.status });
}
