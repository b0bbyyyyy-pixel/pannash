import { mergeCapabilities, STOPPED_PHASES, type CasperCapabilities, type CasperPhase } from '@/lib/casper/defaults';

export type CasperGateInput = {
  globalEnabled: boolean;
  leadCasperEnabled: boolean | null | undefined;
  smsOptOut?: boolean | null;
  capabilities?: unknown;
  phase?: string | null;
  pausedReason?: string | null;
};

export function leadCasperAllowed(leadCasperEnabled: boolean | null | undefined): boolean {
  return leadCasperEnabled !== false;
}

export function canCasperAutoReply(input: CasperGateInput): { ok: boolean; reason?: string } {
  if (!input.globalEnabled) return { ok: false, reason: 'global_off' };
  if (input.smsOptOut) return { ok: false, reason: 'opt_out' };
  if (!leadCasperAllowed(input.leadCasperEnabled)) return { ok: false, reason: 'lead_off' };
  if (input.pausedReason) return { ok: false, reason: 'paused' };
  const phase = (input.phase || 'chatting') as CasperPhase;
  if (STOPPED_PHASES.includes(phase)) return { ok: false, reason: `phase_${phase}` };
  const caps: CasperCapabilities = mergeCapabilities(input.capabilities);
  if (!caps.chat_sms) return { ok: false, reason: 'chat_sms_off' };
  return { ok: true };
}
