import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { preserveFileActivity } from '@/lib/leads/fileActivity';
import { merchantAdmin } from '@/lib/merchantPortal/admin';
import { logMerchantEvent } from '@/lib/merchantPortal/events';
import { parsePortalNeeds, type PortalNeed } from '@/lib/merchantPortal/mask';
import { sendPortalLink } from '@/lib/merchantPortal/sendLink';
import { createPortal } from '@/lib/merchantPortal/tokens';

export const dynamic = 'force-dynamic';

async function userClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } },
  );
}

export async function GET(req: NextRequest) {
  const supabase = await userClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const leadId = req.nextUrl.searchParams.get('leadId') || '';
  if (!leadId) return NextResponse.json({ error: 'leadId required' }, { status: 400 });

  const { data: lead } = await supabase
    .from('leads')
    .select('id, underwriting_data, sms_opt_out')
    .eq('id', leadId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const admin = merchantAdmin();
  const { data: portal } = await admin
    .from('merchant_portals')
    .select('id, created_at, expires_at, revoked_at, last_viewed_at, last_link_sent_at')
    .eq('lead_id', leadId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const ud = lead.underwriting_data && typeof lead.underwriting_data === 'object'
    ? lead.underwriting_data as Record<string, unknown>
    : {};
  const smsConsent = ud.smsConsent && typeof ud.smsConsent === 'object'
    ? ud.smsConsent as { optIn?: boolean }
    : null;

  let status = 'none';
  if (portal?.revoked_at) status = 'revoked';
  else if (portal?.expires_at && new Date(portal.expires_at).getTime() < Date.now()) status = 'expired';
  else if (portal) status = 'active';

  return NextResponse.json({
    status,
    lastViewedAt: portal?.last_viewed_at || null,
    lastLinkSentAt: portal?.last_link_sent_at || null,
    smsConsent: smsConsent?.optIn === true && !lead.sms_opt_out,
    needs: parsePortalNeeds(ud.portalNeeds),
  });
}

export async function POST(req: NextRequest) {
  const supabase = await userClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const leadId = String(body.leadId || '');
  const action = String(body.action || '');
  if (!leadId) return NextResponse.json({ error: 'leadId required' }, { status: 400 });

  const { data: lead } = await supabase
    .from('leads')
    .select('id, underwriting_data, sms_opt_out')
    .eq('id', leadId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const admin = merchantAdmin();
  const ud = lead.underwriting_data && typeof lead.underwriting_data === 'object'
    ? lead.underwriting_data as { smsConsent?: { optIn?: boolean } }
    : {};

  if (action === 'revoke') {
    await admin
      .from('merchant_portals')
      .update({ revoked_at: new Date().toISOString() })
      .eq('lead_id', leadId)
      .eq('user_id', user.id)
      .is('revoked_at', null);
    await logMerchantEvent(admin, {
      userId: user.id,
      leadId,
      eventType: 'revoked',
    });
    return NextResponse.json({ ok: true, status: 'revoked' });
  }

  if (action === 'rotate') {
    const created = await createPortal(admin, { userId: user.id, leadId });
    return NextResponse.json({ ok: true, url: created.url, status: 'active' });
  }

  if (action === 'send') {
    try {
      const sent = await sendPortalLink({
        userId: user.id,
        leadId,
        email: true,
        sms: body.sms === true || ud.smsConsent?.optIn === true,
      });
      return NextResponse.json({ ok: true, url: sent.url, emailed: sent.emailed, texted: sent.texted, status: 'active' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'send_failed';
      if (msg === 'rate_limited') {
        return NextResponse.json({ error: 'Already sent 3 links in the last hour' }, { status: 429 });
      }
      return NextResponse.json({ error: 'Could not send link' }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

export async function PUT(req: NextRequest) {
  const supabase = await userClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const leadId = String(body.leadId || '');
  if (!leadId) return NextResponse.json({ error: 'leadId required' }, { status: 400 });
  const { data: lead } = await supabase
    .from('leads')
    .select('id, underwriting_data')
    .eq('id', leadId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const needs = Array.isArray(body.needs) ? body.needs as PortalNeed[] : parsePortalNeeds(body.needs);
  const ud = preserveFileActivity(
    {
      ...(lead.underwriting_data && typeof lead.underwriting_data === 'object'
        ? lead.underwriting_data as Record<string, unknown>
        : {}),
      portalNeeds: needs,
    },
    lead.underwriting_data,
  );
  await supabase.from('leads').update({ underwriting_data: ud }).eq('id', leadId).eq('user_id', user.id);
  return NextResponse.json({ ok: true, needs });
}
