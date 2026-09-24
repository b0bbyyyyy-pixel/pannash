import { mergeCapabilities, STOPPED_PHASES, type CasperCapabilities, type CasperPhase } from '@/lib/casper/defaults';

export type CasperGateInput = {
  globalEnabled: boolean;
  leadCasperEnabled: boolean | null | undefined;
  smsOptOut?: boolean | null;
  capabilities?: unknown;
  phase?: string | null;
  pausedReason?: string | null;
};

/** true = force on (even if global off). false = force off. null = inherit global. */
export function casperEffectiveForLead(
  globalEnabled: boolean,
  leadCasperEnabled: boolean | null | undefined,
): boolean {
  if (leadCasperEnabled === true) return true;
  if (leadCasperEnabled === false) return false;
  return !!globalEnabled;
}

export function canCasperAutoReply(input: CasperGateInput): { ok: boolean; reason?: string } {
  if (!casperEffectiveForLead(input.globalEnabled, input.leadCasperEnabled)) {
    return { ok: false, reason: input.leadCasperEnabled === false ? 'lead_off' : 'global_off' };
  }
  if (input.smsOptOut) return { ok: false, reason: 'opt_out' };
  if (input.pausedReason) return { ok: false, reason: 'paused' };
  const phase = (input.phase || 'chatting') as CasperPhase;
  if (STOPPED_PHASES.includes(phase)) return { ok: false, reason: `phase_${phase}` };
  const caps: CasperCapabilities = mergeCapabilities(input.capabilities);
  if (!caps.chat_sms) return { ok: false, reason: 'chat_sms_off' };
  return { ok: true };
}
