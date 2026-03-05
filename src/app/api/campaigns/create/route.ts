import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name) {
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

    const body = await req.json();
    const { type, name, subject, email_body, sms_body, ai_directive, ai_replies_enabled, leadListIds } = body;

    if (!type || !name || !leadListIds || leadListIds.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (type === 'email' && (!subject || !email_body)) {
      return NextResponse.json({ error: 'Email campaigns require subject and email_body' }, { status: 400 });
    }

    if (type === 'sms' && !sms_body) {
      return NextResponse.json({ error: 'SMS campaigns require sms_body' }, { status: 400 });
    }

    // Validate AI directive is provided if AI replies are enabled
    if (type === 'sms' && ai_replies_enabled && !ai_directive) {
      return NextResponse.json({ error: 'AI directive required when AI replies are enabled' }, { status: 400 });
    }

    // Create the campaign
    const campaignData: any = {
      user_id: user.id,
      type,
      name,
      status: 'draft',
    };

    if (type === 'email') {
      campaignData.subject = subject;
      campaignData.email_body = email_body;
    } else if (type === 'sms') {
      // SMS campaigns don't need subject/email_body (will be null)
      campaignData.sms_body = sms_body;
      campaignData.ai_directive = ai_directive || null;
      campaignData.ai_replies_enabled = ai_replies_enabled ?? true;
    }

    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .insert(campaignData)
      .select()
      .single();

    if (campaignError) {
      console.error('Campaign creation error:', campaignError);
      return NextResponse.json({ error: campaignError.message }, { status: 500 });
    }

    // Fetch all leads from selected lists
    const { data: leads, error: leadsError } = await supabase
      .from('leads')
      .select('id')
      .in('list_id', leadListIds);

    if (leadsError || !leads || leads.length === 0) {
      return NextResponse.json({ 
        error: 'No leads found in selected lists',
        campaignId: campaign.id 
      }, { status: 400 });
    }

    // Create campaign_leads entries
    const campaignLeads = leads.map((lead, index) => ({
      campaign_id: campaign.id,
      lead_id: lead.id,
      status: 'pending',
      position: index,
    }));

    const { error: campaignLeadsError } = await supabase
      .from('campaign_leads')
      .insert(campaignLeads);

    if (campaignLeadsError) {
      console.error('Campaign leads creation error:', campaignLeadsError);
      return NextResponse.json({ 
        error: campaignLeadsError.message,
        campaignId: campaign.id 
      }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true,
      campaignId: campaign.id,
      leadsAdded: leads.length
    });
  } catch (error: any) {
    console.error('Create campaign error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
