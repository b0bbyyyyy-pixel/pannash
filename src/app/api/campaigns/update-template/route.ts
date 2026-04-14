import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

export async function POST(req: NextRequest) {
  try {
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

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { campaignId, subject, emailBody, smsBody, aiDirective, aiRepliesEnabled } = await req.json();

    if (!campaignId) {
      return NextResponse.json({ error: 'Missing campaign ID' }, { status: 400 });
    }

    // Determine update fields based on what's provided
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    // Email campaign fields
    if (subject !== undefined) updateData.subject = subject;
    if (emailBody !== undefined) updateData.email_body = emailBody;

    // SMS campaign fields
    if (smsBody !== undefined) updateData.sms_body = smsBody;
    if (aiDirective !== undefined) updateData.ai_directive = aiDirective;
    if (aiRepliesEnabled !== undefined) updateData.ai_replies_enabled = aiRepliesEnabled;

    // Update campaign template
    const { error } = await supabase
      .from('campaigns')
      .update(updateData)
      .eq('id', campaignId)
      .eq('user_id', user.id); // Ensure user owns the campaign

    if (error) {
      console.error('Error updating template:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    revalidatePath(`/campaigns/${campaignId}`);

    return NextResponse.json({ 
      success: true,
      message: 'Template updated successfully' 
    });
  } catch (error: any) {
    console.error('Error in update template:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
