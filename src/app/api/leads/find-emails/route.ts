import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import OpenAI from 'openai';

// Lazy initialization to avoid build-time errors
function getOpenAI() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { listId } = body;

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

    // Fetch leads that need email help (missing or invalid), filtered by list if provided
    let leadsQuery = supabase
      .from('leads')
      .select('id, name, email, company, email_status')
      .eq('user_id', user.id)
      .in('email_status', ['missing', 'invalid']);

    if (listId) {
      if (listId === 'unlisted') {
        leadsQuery = leadsQuery.is('list_id', null);
      } else {
        leadsQuery = leadsQuery.eq('list_id', listId);
      }
    }

    const { data: leads, error: fetchError } = await leadsQuery;

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
        const openai = getOpenAI();
        const prompt = `You are an email address research expert with deep knowledge of corporate email patterns and domain conventions.

Person's Name: ${lead.name}
Company: ${lead.company}
Current Email: ${lead.email || 'None'}

Your task: Research and suggest the most likely professional email address for this person at their company.

ANALYSIS PROCESS:
1. Parse the name into first/last name components
2. Research the company domain:
   - Consider official domain variations (e.g., "Microsoft" → microsoft.com, "IBM" → ibm.com)
   - Account for shortened names (e.g., "Federal Express" → fedex.com)
   - Check for special domains (e.g., "JPMorgan Chase" → jpmorgan.com or jpmchase.com)
   - If generic name like "LLC", "Inc", "Corp", remove it for domain

3. Analyze likely email format patterns:
   - firstname.lastname@ (most common in US/Europe)
   - firstnamelastname@ (common in tech)
   - f.lastname@ (common in large orgs)
   - firstname@ (small companies)
   - flastname@ (some tech companies)
   - first.last@ or first_last@ (variations)

4. Consider company size and industry:
   - Large enterprises often use: firstname.lastname@
   - Tech startups often use: first@
   - Mid-size often use: firstlast@

5. If current email exists:
   - Check if domain matches company
   - Check if format seems wrong (typos, placeholder domains)
   - If domain is "placeholder.com", "example.com", "noreply.com" etc, replace with real domain

CONFIDENCE LEVELS:
- HIGH: Well-known company domain + standard format (e.g., john.smith@microsoft.com)
- MEDIUM: Educated guess on domain or format (e.g., j.smith@acmecorp.com)
- LOW: Uncertain domain or unusual name pattern

Respond in JSON format with SHORT reasoning (max 15 words):
{
  "suggested_email": "the email address",
  "confidence": "high/medium/low",
  "reasoning": "Brief explanation (15 words max)"
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
          const oldEmail = lead.email || 'None';
          
          suggestions.push({
            leadId: lead.id,
            leadName: lead.name,
            currentEmail: oldEmail,
            suggestedEmail: result.suggested_email,
            confidence: result.confidence || 'medium',
            reasoning: result.reasoning || 'AI-generated suggestion',
          });

          // Actually replace the email and mark as valid
          await supabase
            .from('leads')
            .update({
              email: result.suggested_email,
              email_status: 'valid',
              email_validation_notes: `AI replaced "${oldEmail}" with "${result.suggested_email}" (${result.confidence} confidence - ${result.reasoning})`,
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
