import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import {
  applicationFileName,
  buildFundingApplication,
} from '@/lib/fundingApplication';
import { buildFundingApplicationPdf } from '@/lib/fundingApplicationPdf';
import { type ApplicationBrandId } from '@/lib/applicationBrands';
import { loadApplicationBrand } from '@/lib/applicationBrandStore';

export const runtime = 'nodejs';

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('x-real-ip')?.trim() || '';
}

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
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
    },
  );
}

async function resolveBrand(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  requested?: unknown,
): Promise<ApplicationBrandId> {
  if (requested === 'oneFunding' || requested === 'abf') return requested;
  return loadApplicationBrand(supabase, userId);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: leadId } = await params;
    if (!leadId) return NextResponse.json({ error: 'Missing lead id' }, { status: 400 });

    const supabase = await getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: lead, error: leadErr } = await supabase
      .from('leads')
      .select('id, name, email, phone, company, value, underwriting_data')
      .eq('id', leadId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (leadErr || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    const { data, missing } = buildFundingApplication(lead);
    if (missing.length) {
      return NextResponse.json({ error: 'Missing required fields', missing }, { status: 422 });
    }

    const brand = await resolveBrand(supabase, user.id, new URL(req.url).searchParams.get('brand'));
    const bytes = await buildFundingApplicationPdf(data, {
      signedAt: new Date(),
      ip: clientIp(req),
      brand,
    });
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${applicationFileName(data.legalName, new Date(), brand)}"`,
      },
    });
  } catch (err) {
    console.error('[application GET]', err);
    return NextResponse.json({ error: 'Failed to preview application' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: leadId } = await params;
    if (!leadId) {
      return NextResponse.json({ error: 'Missing lead id' }, { status: 400 });
    }

    const supabase = await getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));

    const { data: lead, error: leadErr } = await supabase
      .from('leads')
      .select('id, name, email, phone, company, value, underwriting_data')
      .eq('id', leadId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (leadErr) {
      console.error('[application] lead lookup', leadErr);
      return NextResponse.json({ error: 'Failed to load lead' }, { status: 500 });
    }
    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    const { data, missing, populatedRequested } = buildFundingApplication(lead);
    if (missing.length) {
      return NextResponse.json(
        { error: 'Missing required fields', missing },
        { status: 422 },
      );
    }

    if (populatedRequested != null) {
      const currentUd = (lead.underwriting_data && typeof lead.underwriting_data === 'object')
        ? lead.underwriting_data as Record<string, unknown>
        : {};
      const { error: fillErr } = await supabase
        .from('leads')
        .update({
          value: populatedRequested,
          underwriting_data: { ...currentUd, requestedAmount: populatedRequested },
        })
        .eq('id', leadId)
        .eq('user_id', user.id);
      if (fillErr) console.error('[application] fill requested amount', fillErr);
    }

    const brand = await resolveBrand(supabase, user.id, body.brand);
    const now = new Date();
    const bytes = await buildFundingApplicationPdf(data, {
      signedAt: now,
      ip: clientIp(req),
      brand,
    });
    const fileName = applicationFileName(data.legalName, now, brand);
    const filePath = `${user.id}/${leadId}/documents/${Date.now()}_${fileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

    const { error: uploadError } = await supabase.storage
      .from('lead-attachments')
      .upload(filePath, bytes, {
        contentType: 'application/pdf',
        upsert: false,
      });

    if (uploadError) {
      console.error('[application] upload', uploadError);
      return NextResponse.json({ error: 'Failed to save application PDF' }, { status: 500 });
    }

    const { data: attachment, error: dbError } = await supabase
      .from('lead_attachments')
      .insert({
        user_id: user.id,
        lead_id: leadId,
        column_field: 'documents',
        file_name: fileName,
        file_path: filePath,
        file_size: bytes.byteLength,
        file_type: 'application/pdf',
      })
      .select()
      .single();

    if (dbError) {
      console.error('[application] metadata', dbError);
      await supabase.storage.from('lead-attachments').remove([filePath]);
      return NextResponse.json({ error: 'Failed to save application' }, { status: 500 });
    }

    return NextResponse.json({
      attachment,
      fileName,
      requestedAmount: populatedRequested,
      brand,
    });
  } catch (err) {
    console.error('[application]', err);
    return NextResponse.json({ error: 'Failed to create application' }, { status: 500 });
  }
}
