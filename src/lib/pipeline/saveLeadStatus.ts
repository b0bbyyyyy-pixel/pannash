/**
 * Shared lead-status write: PATCH pipeline status, and when Funded
 * also PUT underwriting (isFunded + fundedAt). Used by LWC and the
 * Pipeline row dropdown. Never PATCH /api/leads/pipeline alone for Funded.
 */

export async function saveLeadStatusWrite(opts: {
  leadId: string;
  status: string;
  underwritingData?: Record<string, unknown> | null;
}): Promise<{ underwritingData?: Record<string, unknown> }> {
  await fetch('/api/leads/pipeline', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ leadId: opts.leadId, field: 'lead_status', value: opts.status }),
  });

  let nextUd = opts.underwritingData as Record<string, unknown> | null | undefined;
  if (opts.status === 'Funded') {
    const merged = {
      ...(opts.underwritingData || {}),
      isFunded: true,
      fundedAt:
        (opts.underwritingData as Record<string, unknown> | null)?.fundedAt ||
        new Date().toISOString(),
    };
    nextUd = merged;
    await fetch('/api/leads/underwriting', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId: opts.leadId, underwritingData: merged }),
    });
  }

  return { underwritingData: nextUd ?? undefined };
}
