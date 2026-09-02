import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { randomBytes } from 'crypto';

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get: (name) => cookieStore.get(name)?.value,
          set: () => {},
          remove: () => {},
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const {
      leadId, leadName,
      offerAmount, factorRate, totalRepayment, termPayments, frequency,
      title, introMessage, minAmount,
      showFactor, showTotalRepayment, showPayment,
      showRevenuePercent, avgMonthlyRevenue,
      feeDisclaimer,
      ogTitle, ogDescription, ogImageUrl,
      logoUrl,
      customCta, thankYouMessage, expiresAt,
      showTermOptions, termOptions,
      epoOptions,
    } = body;

    const token = randomBytes(24).toString('hex');

    const coreRow = {
      token,
      user_id: user.id,
      is_active: true,
      lead_id: leadId || null,
      lead_name: leadName || null,
      offer_amount: offerAmount,
      factor_rate: factorRate,
      total_repayment: totalRepayment,
      term_payments: termPayments,
      frequency: frequency || 'Weekly',
      title: title || 'Your Funding Offer',
      intro_message: introMessage || null,
      min_amount: minAmount ?? 0,
      show_factor: showFactor ?? false,
      show_total_repayment: showTotalRepayment ?? true,
      show_payment: showPayment ?? true,
      fee_disclaimer: feeDisclaimer ?? null,
      logo_url: logoUrl || null,
      custom_cta: customCta || 'I Accept This Offer',
      thank_you_message: thankYouMessage || 'Thank you! We will be in touch shortly.',
      expires_at: expiresAt || null,
    };

    const ogRow = {
      og_title: ogTitle || null,
      og_description: ogDescription || null,
      og_image_url: ogImageUrl || null,
    };

    const isColError = (e: { message?: string; code?: string }) =>
      e.message?.includes('column') || e.code === '42703' || e.code === 'PGRST204';

    let data = null;
    let error = null;

    // Attempt 1: all columns (og + term options + revenue % + epo)
    ({ data, error } = await supabase
      .from('client_offer_portals')
      .insert({
        ...coreRow,
        ...ogRow,
        show_term_options: showTermOptions ?? false,
        term_options: termOptions ?? [],
        show_revenue_percent: showRevenuePercent ?? false,
        avg_monthly_revenue: avgMonthlyRevenue ?? null,
        epo_options: epoOptions ?? [],
      })
      .select('token, id')
      .single());

    // Attempt 2: without epo_options column
    if (error && isColError(error)) {
      console.warn('[portal/create] Retrying without epo_options column:', error.message);
      ({ data, error } = await supabase
        .from('client_offer_portals')
        .insert({
          ...coreRow,
          ...ogRow,
          show_term_options: showTermOptions ?? false,
          term_options: termOptions ?? [],
          show_revenue_percent: showRevenuePercent ?? false,
          avg_monthly_revenue: avgMonthlyRevenue ?? null,
        })
        .select('token, id')
        .single());
    }

    // Attempt 3: without revenue columns
    if (error && isColError(error)) {
      console.warn('[portal/create] Retrying without revenue columns:', error.message);
      ({ data, error } = await supabase
        .from('client_offer_portals')
        .insert({
          ...coreRow,
          ...ogRow,
          show_term_options: showTermOptions ?? false,
          term_options: termOptions ?? [],
        })
        .select('token, id')
        .single());
    }

    // Attempt 4: without term option columns
    if (error && isColError(error)) {
      console.warn('[portal/create] Retrying without term/revenue columns:', error.message);
      ({ data, error } = await supabase
        .from('client_offer_portals')
        .insert({ ...coreRow, ...ogRow })
        .select('token, id')
        .single());
    }

    // Attempt 5: without OG columns (last resort)
    if (error && isColError(error)) {
      console.warn('[portal/create] Retrying without OG columns:', error.message);
      ({ data, error } = await supabase
        .from('client_offer_portals')
        .insert(coreRow)
        .select('token, id')
        .single());
    }

    if (error) {
      console.error('[portal/create]', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ token: data!.token, id: data!.id });
  } catch (err) {
    console.error('[portal/create]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
