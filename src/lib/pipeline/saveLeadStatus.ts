/**
 * Shared lead-status write: PATCH pipeline status (server logs Status → Updates).
 * Funded flags are stored with that same write.
 */

export async function saveLeadStatusWrite(opts: {
  leadId: string;
  status: string;
  prevStatus?: string | null;
  underwritingData?: Record<string, unknown> | null;
}): Promise<{ underwritingData?: Record<string, unknown> }> {
  const res = await fetch('/api/leads/pipeline', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ leadId: opts.leadId, field: 'lead_status', value: opts.status }),
  });
  const json = await res.json().catch(() => ({})) as { underwriting_data?: Record<string, unknown> };
  return { underwritingData: json.underwriting_data ?? opts.underwritingData ?? undefined };
}
