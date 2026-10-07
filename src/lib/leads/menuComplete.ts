import { buildFundingApplication, type ApplicationLeadInput } from '@/lib/fundingApplication';
import type { LeadActionId } from '@/components/LeadActionsMenu';

const DOCS_COMPLETE_MIN = 4;

export type MenuDotFlags = {
  appComplete: boolean;
  lendersComplete: boolean;
  docsComplete: boolean;
  offersComplete: boolean;
};

export type LeadMenuState = MenuDotFlags & {
  section: LeadActionId;
  id?: string;
};

export type MenuLeadInput = ApplicationLeadInput & {
  id?: string;
  lead_status?: string | null;
  doc_count?: number | null;
};

const EMPTY_DOTS: MenuDotFlags = {
  appComplete: false,
  lendersComplete: false,
  docsComplete: false,
  offersComplete: false,
};

export function isDocsComplete(count: number): boolean {
  return count >= DOCS_COMPLETE_MIN;
}

export function isOffersComplete(opts: {
  underwriting_data?: Record<string, unknown> | null;
  lead_status?: string | null;
  submissions?: { status?: string | null }[];
}): boolean {
  const ud = opts.underwriting_data || {};
  const offers = Array.isArray(ud.actualOffers) ? ud.actualOffers : [];
  if (offers.length > 0) return true;
  if (opts.submissions?.some(s => /approv/i.test(s.status || ''))) return true;
  if (/approv/i.test(opts.lead_status || '')) return true;
  return false;
}

export function isAppComplete(lead: ApplicationLeadInput): boolean {
  return buildFundingApplication(lead).missing.length === 0;
}

export function menuDotsFromLead(lead: MenuLeadInput): MenuDotFlags {
  const offerish = isOffersComplete({
    underwriting_data: lead.underwriting_data,
    lead_status: lead.lead_status,
  });
  return {
    appComplete: isAppComplete(lead),
    lendersComplete: offerish,
    docsComplete: isDocsComplete(lead.doc_count ?? 0),
    offersComplete: offerish,
  };
}

/** Merge a LEAD_STATE post. Missing flags keep the previous value for the same lead. */
export function applyLeadStateMsg(
  prev: LeadMenuState | null,
  incoming: {
    id?: string;
    section: string;
    appComplete?: boolean;
    lendersComplete?: boolean;
    docsComplete?: boolean;
    offersComplete?: boolean;
  },
): LeadMenuState {
  const sameLead = !incoming.id || !prev?.id || incoming.id === prev.id;
  const base = sameLead ? prev : null;
  return {
    id: incoming.id ?? base?.id,
    section: incoming.section as LeadActionId,
    appComplete: incoming.appComplete !== undefined ? !!incoming.appComplete : (base?.appComplete ?? false),
    lendersComplete: incoming.lendersComplete !== undefined ? !!incoming.lendersComplete : (base?.lendersComplete ?? false),
    docsComplete: incoming.docsComplete !== undefined ? !!incoming.docsComplete : (base?.docsComplete ?? false),
    offersComplete: incoming.offersComplete !== undefined ? !!incoming.offersComplete : (base?.offersComplete ?? false),
  };
}

/** Live iframe flags for this lead, OR local lead data — never flash red when either is green. */
export function resolveMenuDots(
  live: Partial<LeadMenuState> | null | undefined,
  lead?: MenuLeadInput | null,
  leadId?: string | null,
): MenuDotFlags {
  const id = lead?.id ?? leadId ?? undefined;
  const liveForLead = live && id && live.id && live.id !== id ? null : live;
  const fromLead = lead ? menuDotsFromLead(lead) : EMPTY_DOTS;
  return {
    appComplete: !!(liveForLead?.appComplete || fromLead.appComplete),
    lendersComplete: !!(liveForLead?.lendersComplete || fromLead.lendersComplete),
    docsComplete: !!(liveForLead?.docsComplete || fromLead.docsComplete),
    offersComplete: !!(liveForLead?.offersComplete || fromLead.offersComplete),
  };
}
