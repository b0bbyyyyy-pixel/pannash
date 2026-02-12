import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Common invalid patterns
const INVALID_PATTERNS = [
  /noreply/i,
  /no-reply/i,
  /placeholder/i,
  /example\.com$/i,
  /test\.com$/i,
  /invalid\.com$/i,
  /unknown\.com$/i,
  /notprovided\.com$/i,
  /missing\.com$/i,
  /temp\.com$/i,
  /@localhost$/i,
  /@127\.0\.0\.1$/i,
];

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

    // Fetch user's blocked domains
    const { data: blockedDomains } = await supabase
      .from('blocked_domains')
      .select('domain')
      .eq('user_id', user.id);

    const blockedDomainsSet = new Set(
      (blockedDomains || []).map(d => d.domain.toLowerCase())
    );

    // Fetch all leads
    const { data: leads, error: fetchError } = await supabase
      .from('leads')
      .select('id, email')
      .eq('user_id', user.id);

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    let validCount = 0;
    let invalidCount = 0;
    let blockedCount = 0;
    let missingCount = 0;

    // Validate each lead
    const updates = (leads || []).map((lead) => {
      let status = 'valid';
      let notes = '';

      // Check if email is missing
      if (!lead.email || lead.email.trim() === '') {
        status = 'missing';
        notes = 'No email address provided';
        missingCount++;
      }
      // Check email format
      else if (!EMAIL_REGEX.test(lead.email)) {
        status = 'invalid';
        notes = 'Invalid email format';
        invalidCount++;
      }
      // Check against invalid patterns
      else if (INVALID_PATTERNS.some(pattern => pattern.test(lead.email))) {
        status = 'invalid';
        notes = 'Email matches invalid pattern (auto-generated/placeholder)';
        invalidCount++;
      }
      // Check against blocked domains
      else {
        const domain = lead.email.split('@')[1]?.toLowerCase();
        if (domain && blockedDomainsSet.has(domain)) {
          status = 'invalid';
          notes = `Email domain "${domain}" is blocked`;
          blockedCount++;
        } else {
          validCount++;
        }
      }

      return {
        id: lead.id,
        email_status: status,
        email_validation_notes: notes,
      };
    });

    // Batch update leads
    for (const update of updates) {
      await supabase
        .from('leads')
        .update({
          email_status: update.email_status,
          email_validation_notes: update.email_validation_notes,
        })
        .eq('id', update.id);
    }

    return NextResponse.json({
      message: 'Email validation complete',
      valid: validCount,
      invalid: invalidCount,
      blocked: blockedCount,
      missing: missingCount,
      total: leads?.length || 0,
    });
  } catch (error) {
    console.error('Error validating emails:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
