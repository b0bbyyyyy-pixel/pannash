/**
 * Cross-frame messages for Pipeline ↔ Inbox ↔ Lead Info.
 * Inbox → Pipeline → Lead Info is at most one iframe.
 */

export const PIPELINE_LEAD_MSG = 'gostwrk-pipeline-lead';
export const OPEN_LEAD_MSG = 'gostwrk-open-lead';
export const BACK_TO_PIPELINE_MSG = 'gostwrk-back-to-pipeline';
export const LEAD_DELETED_MSG = 'gostwrk-lead-deleted';
export const LEAD_SHOWN_MSG = 'gostwrk-lead-shown';
export const CALL_MSG = 'gostwrk-call';
export const LEAD_ACTION_MSG = 'gostwrk-lead-action';
export const LEAD_STATE_MSG = 'gostwrk-lead-state';

export type PipelineLeadPatchMsg = {
  type: typeof PIPELINE_LEAD_MSG;
  id: string;
  patch: Record<string, unknown>;
};

export type OpenLeadMsg = {
  type: typeof OPEN_LEAD_MSG;
  id: string;
  tab?: string;
  action?: string;
};

export type BackToPipelineMsg = {
  type: typeof BACK_TO_PIPELINE_MSG;
  id?: string;
};

export type LeadDeletedMsg = {
  type: typeof LEAD_DELETED_MSG;
  id: string;
};

export type LeadShownMsg = {
  type: typeof LEAD_SHOWN_MSG;
  id: string;
};

export type CallMsg = {
  type: typeof CALL_MSG;
  e164: string;
  name?: string;
  leadId?: string;
  company?: string;
};

export type LeadActionMsg = {
  type: typeof LEAD_ACTION_MSG;
  action: string;
};

export type LeadStateMsg = {
  type: typeof LEAD_STATE_MSG;
  id?: string;
  section: string;
  appComplete: boolean;
  lendersComplete?: boolean;
  docsComplete?: boolean;
  offersComplete?: boolean;
};

export type PipelineFrameMsg =
  | PipelineLeadPatchMsg
  | OpenLeadMsg
  | BackToPipelineMsg
  | LeadDeletedMsg
  | LeadShownMsg
  | CallMsg
  | LeadActionMsg
  | LeadStateMsg;

export function isInIframe(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.parent !== window;
  } catch {
    return true;
  }
}

export function postToParent(data: PipelineFrameMsg) {
  try {
    window.parent?.postMessage(data, window.location.origin);
  } catch {
    /* ignore */
  }
}

export function postLeadPatch(id: string, patch: Record<string, unknown>) {
  postToParent({ type: PIPELINE_LEAD_MSG, id, patch });
}

export function postOpenLead(id: string, extra?: { tab?: string; action?: string }) {
  postToParent({ type: OPEN_LEAD_MSG, id, tab: extra?.tab, action: extra?.action });
}

export function postBackToPipeline(id?: string) {
  postToParent({ type: BACK_TO_PIPELINE_MSG, id });
}

export function postLeadDeleted(id: string) {
  postToParent({ type: LEAD_DELETED_MSG, id });
}

export function postLeadShown(id: string) {
  postToParent({ type: LEAD_SHOWN_MSG, id });
}

export function postLeadState(
  section: string,
  appComplete: boolean,
  lendersComplete = false,
  extra?: { id?: string; docsComplete?: boolean; offersComplete?: boolean },
) {
  postToParent({
    type: LEAD_STATE_MSG,
    id: extra?.id,
    section,
    appComplete,
    lendersComplete,
    docsComplete: extra?.docsComplete,
    offersComplete: extra?.offersComplete,
  });
}

export function postCallToTop(data: Omit<CallMsg, 'type'>) {
  try {
    window.top?.postMessage({ type: CALL_MSG, ...data }, window.location.origin);
  } catch {
    /* ignore */
  }
}

export function postLeadActionToFrame(
  frame: HTMLIFrameElement | null | undefined,
  action: string
) {
  try {
    frame?.contentWindow?.postMessage(
      { type: LEAD_ACTION_MSG, action },
      window.location.origin
    );
  } catch {
    /* ignore */
  }
}

export function leadInfoUrl(
  id: string,
  extra?: { tab?: string; action?: string; from?: string }
): string {
  const qs = new URLSearchParams({ modal: '1' });
  if (extra?.tab) qs.set('tab', extra.tab);
  if (extra?.action) qs.set('action', extra.action);
  if (extra?.from) qs.set('from', extra.from);
  return `/pipeline/${id}?${qs.toString()}`;
}

export function pipelineListUrl(selectedId?: string | null): string {
  const qs = new URLSearchParams({ modal: '1' });
  if (selectedId) qs.set('selected', selectedId);
  return `/pipeline?${qs.toString()}`;
}
