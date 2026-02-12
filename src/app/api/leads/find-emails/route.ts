import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST() {
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

    // Fetch leads that need email help (missing or invalid)
    const { data: leads, error: fetchError } = await supabase
      .from('leads')
      .select('id, name, email, company, email_status')
      .eq('user_id', user.id)
      .in('email_status', ['missing', 'invalid']);

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!leads || leads.length === 0) {
      return NextResponse.json({ 
        message: 'No leads need email assistance',
        suggestions: []
      });
    }

    // Limit to first 10 leads to save API costs
    const leadsToProcess = leads.slice(0, 10);
    const suggestions: Array<{
      leadId: string;
      leadName: string;
      currentEmail: string;
      suggestedEmail: string;
      confidence: string;
      reasoning: string;
    }> = [];

    // Process each lead with AI
    for (const lead of leadsToProcess) {
      if (!lead.name || !lead.company) {
        continue; // Skip leads without name or company
      }

      try {
        const prompt = `You are an email address expert. Given a person's name and company, suggest the most likely professional email address.

Person's Name: ${lead.name}
Company: ${lead.company}
Current Email: ${lead.email || 'None'}

Task: Suggest the most likely correct professional email address for this person.

Common patterns:
- firstname.lastname@company.com
- firstnamelastname@company.com
- f.lastname@company.com
- firstname@company.com
- flastname@company.com

Important:
1. If the current email exists but looks misspelled, suggest the corrected version
2. If no email exists, suggest the most likely format
3. Always use lowercase
4. Remove spaces and special characters from names
5. Use the actual company domain (e.g., if company is "Acme Corp", use acme.com or acmecorp.com)

Respond in JSON format:
{
  "suggested_email": "the email address",
  "confidence": "high/medium/low",
  "reasoning": "brief explanation"
}`;

        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          response_format: { type: 'json_object' },
        });

        const result = JSON.parse(completion.choices[0].message.content || '{}');
        
        // Validate the suggested email
        if (result.suggested_email && EMAIL_REGEX.test(result.suggested_email)) {
          suggestions.push({
            leadId: lead.id,
            leadName: lead.name,
            currentEmail: lead.email || 'None',
            suggestedEmail: result.suggested_email,
            confidence: result.confidence || 'medium',
            reasoning: result.reasoning || 'AI-generated suggestion',
          });

          // Update the lead with AI suggestion
          await supabase
            .from('leads')
            .update({
              email_validation_notes: `AI suggested: ${result.suggested_email} (${result.confidence} confidence)`,
            })
            .eq('id', lead.id);
        }
      } catch (error) {
        console.error(`Error processing lead ${lead.id}:`, error);
        // Continue with next lead
      }
    }

    return NextResponse.json({
      message: `Found ${suggestions.length} email suggestions`,
      suggestions,
      processed: leadsToProcess.length,
      total: leads.length,
    });
  } catch (error) {
    console.error('Error finding emails:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
