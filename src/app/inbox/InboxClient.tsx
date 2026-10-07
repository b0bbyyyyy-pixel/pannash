'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { useWebPhone } from '@/components/webphone/WebPhone';
import InboxDialer from '@/components/InboxDialer';
import LeadUpdatesTimeline from '@/components/LeadUpdatesTimeline';
import { casperEffectiveForLead } from '@/lib/casper/allow';
import InboundPhoto from '@/components/mobile/InboundPhoto';
import { getPhoneLocation } from '@/lib/phoneLocation';
import { outboundSmsReceipt } from '@/lib/inbox/smsReceipt';
import {
  BACK_TO_PIPELINE_MSG,
  LEAD_DELETED_MSG,
  LEAD_SHOWN_MSG,
  LEAD_STATE_MSG,
  OPEN_LEAD_MSG,
  PIPELINE_LEAD_MSG,
  leadInfoUrl,
  pipelineListUrl,
  postLeadActionToFrame,
} from '@/lib/pipeline/iframeMessages';
import LeadActionsMenu, { type LeadActionId } from '@/components/LeadActionsMenu';
import dynamic from 'next/dynamic';
import { isCampaignInboxLead } from '@/lib/inbox/promoteCampaignReply';
import { sortInboxLeads } from '@/lib/inbox/sortInboxLeads';
import { applyLeadStateMsg, resolveMenuDots, type LeadMenuState } from '@/lib/leads/menuComplete';
import { useSync } from '@/lib/sync/SyncProvider';
import { usePolling } from '@/lib/sync/usePolling';

const DocumentsModal = dynamic(() => import('@/components/DocumentsModal'), { ssr: false });
const ScheduleEmailModal = dynamic(() => import('@/components/ScheduleEmailModal'), { ssr: false });
const FollowUpModal = dynamic(() => import('@/components/FollowUpModal'), { ssr: false });

// ─── Types ────────────────────────────────────────────────────────────────────

interface LeadList {
  id: string;
  name: string;
  created_at?: string | null;
}

interface DBStatus { id: string; name: string; color: string; bg_color: string; }

interface InboxLead {
  id: string;
  name: string;
  company: string | null;
  phone: string;
  email?: string | null;
  value?: number | string | null;
  underwriting_data?: Record<string, unknown> | null;
  doc_count?: number;
  stage: string | null;
  lead_status: string | null;
  in_pipeline?: boolean | null;
  month_key: string | null;
  last_contact: string | null;
  created_at?: string | null;
  sms_opt_out: boolean | null;
  casper_enabled?: boolean | null;
  notes: string | null;
  conversation: {
    id: string;
    last_message_at: string | null;
    last_inbound_at?: string | null;
    last_message_preview: string | null;
    last_direction: string | null;
    unread_count: number;
  } | null;
}

interface InboxMessage {
  id: string;
  conversation_id: string;
  lead_id: string;
  direction: 'inbound' | 'outbound';
  body: string;
  status: 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'received';
  sent_by: string;
  twilio_sid: string | null;
  error_message: string | null;
  created_at: string;
  media_items?: { sid?: string; path?: string; type: string; savedAt?: string | null }[] | null;
}

interface PhoneConnection {
  phone_number: string;
  provider: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(phone: string) {
  const d = phone.replace(/\D/g, '');
  if (d.length === 11 && d[0] === '1') {
    return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  }
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return phone;
}

function offsetFromYou(offset: string) {
  if (offset === 'Same timezone') return 'same time as you';
  if (offset.startsWith('+')) return `${offset.slice(1)} ahead of you`;
  if (offset.startsWith('-')) return `${offset.slice(1)} behind you`;
  return offset;
}

function PhoneLocHover({
  phone,
  userTz,
  formatted,
}: {
  phone: string;
  userTz: string;
  formatted: string;
}) {
  const loc = getPhoneLocation(phone, userTz);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  if (!loc) return <span>{formatted}</span>;

  return (
    <span
      className="cursor-default"
      onMouseEnter={e => {
        const r = e.currentTarget.getBoundingClientRect();
        setPos({ left: r.left, top: r.top - 8 });
      }}
      onMouseLeave={() => setPos(null)}
    >
      {formatted}
      {pos && createPortal(
        <span
          className="fixed z-[200] pointer-events-none w-max max-w-[260px] rounded-md border border-[#e5e5e5] bg-white px-2.5 py-1.5 text-left shadow-lg"
          style={{ left: pos.left, top: pos.top, transform: 'translateY(-100%)' }}
        >
          <span className="block text-[11px] font-semibold text-[#1a1a1a]">
            {loc.city}, {loc.state}
          </span>
          <span className="block text-[11px] text-[#6b6b6b]">
            {loc.localTime} · {offsetFromYou(loc.timeOffset)}
          </span>
        </span>,
        document.body,
      )}
    </span>
  );
}

function relativeTime(iso: string | null) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function msgTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function dateSeparator(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (msgDay.getTime() === today.getTime()) return 'Today';
  if (msgDay.getTime() === yesterday.getTime()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

// GSM-7 charset for segment counting
const GSM7 = /^[\x20-\x7E\n\r\t\x0C\x0B£¤¥§¿ÄÅÆÇÉÑÖØÜàäåæèéìñòöùü€\[\\\]^{|}~]*$/;
function smsSegments(text: string) {
  const isGsm = GSM7.test(text);
  const perSeg = isGsm ? 160 : 70;
  const multiSeg = isGsm ? 153 : 67;
  const len = text.length;
  if (len === 0) return { chars: 0, segments: 0, encoding: 'GSM-7' };
  const segments = len <= perSeg ? 1 : Math.ceil(len / multiSeg);
  return { chars: len, segments, encoding: isGsm ? 'GSM-7' : 'Unicode' };
}

type SavedTpl = { id: string; name: string; body: string };

function fillTpl(body: string, lead: { name?: string | null; company?: string | null }) {
  const first = (lead.name || '').trim().split(/\s+/)[0] || '';
  return body
    .replace(/\{first_name\}/gi, first)
    .replace(/\{company\}/gi, (lead.company || '').trim());
}

function getStatusStyleFrom(status: string | null | undefined, list: DBStatus[]) {
  if (!status) return { bg: '#f5f5f5', text: '#6b6b6b' };
  const found = list.find(s => s.name === status);
  if (found) return { bg: found.bg_color, text: found.color };
  if (status === 'DNC') return { bg: '#fee2e2', text: '#7f1d1d' };
  return { bg: '#f5f5f5', text: '#6b6b6b' };
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function InboxClient({
  userId,
  initialLeadId,
}: {
  userId: string;
  initialLeadId: string | null;
}) {
  const [leads, setLeads] = useState<InboxLead[]>([]);
  const [phoneConn, setPhoneConn] = useState<PhoneConnection | null>(null);
  const [loadingLeads, setLoadingLeads] = useState(true);
  const [dbSetupRequired, setDbSetupRequired] = useState(false);

  // List picker state
  const [showListPicker, setShowListPicker] = useState(false);
  const [listPickerData, setListPickerData] = useState<{ lists: LeadList[]; countMap: Record<string, number> } | null>(null);
  const [loadingListPicker, setLoadingListPicker] = useState(false);
  const [activeListName, setActiveListName] = useState<string | null>(null);
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [loadingListLeads, setLoadingListLeads] = useState(false);
  const [pickerAnchor, setPickerAnchor] = useState<{ top: number; left: number } | null>(null);
  const listPickerRef = useRef<HTMLDivElement>(null);
  const listPickerBtnRef = useRef<HTMLButtonElement>(null);

  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(initialLeadId);
  const activeListNameRef = useRef<string | null>(null);
  const selectedLeadIdRef = useRef<string | null>(initialLeadId);
  useEffect(() => { activeListNameRef.current = activeListName; }, [activeListName]);
  useEffect(() => { selectedLeadIdRef.current = selectedLeadId; }, [selectedLeadId]);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const messagesRef = useRef<InboxMessage[]>([]);
  const conversationIdRef = useRef<string | null>(null);
  const reloadedMissingRef = useRef(new Set<string>());
  const [loadingMsgs, setLoadingMsgs] = useState(false);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [dbStatuses, setDbStatuses] = useState<DBStatus[]>([]);
  const [composerText, setComposerText] = useState('');
  const [showTpls, setShowTpls] = useState(false);
  const [tpls, setTpls] = useState<SavedTpl[]>([]);
  const [draftName, setDraftName] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [addingTpl, setAddingTpl] = useState(false);
  const [editingTplId, setEditingTplId] = useState<string | null>(null);
  const [savingTpl, setSavingTpl] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [casperOn, setCasperOn] = useState(false);

  // Lead overlay — shows the pipeline lead workspace in a floating panel
  const [leadOverlayId, setLeadOverlayId] = useState<string | null>(null);
  const [leadOverlayExtra, setLeadOverlayExtra] = useState<{ tab?: string; action?: string } | undefined>();
  const [leadOverlayKey, setLeadOverlayKey] = useState(0);
  const [docsLead, setDocsLead] = useState<{ id: string; name: string; company?: string | null } | null>(null);
  const [emailLead, setEmailLead] = useState<{ id: string; name: string; company?: string | null; phone?: string | null } | null>(null);
  const [followLead, setFollowLead] = useState<{ id: string; name: string } | null>(null);
  const [showPipeline, setShowPipeline] = useState(false);
  const [pipelineFrameSrc, setPipelineFrameSrc] = useState('/pipeline?modal=1');
  const pipelineFrameRef = useRef<HTMLIFrameElement>(null);
  const leadOverlayFrameRef = useRef<HTMLIFrameElement>(null);
  const [leadMenuState, setLeadMenuState] = useState<LeadMenuState | null>(null);
  const [pipelineLeadId, setPipelineLeadId] = useState<string | null>(null);
  const [pipelineShowingLead, setPipelineShowingLead] = useState(false);

  const threadScrollerRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const lastScrolledMsgIdRef = useRef<string | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const selectedLead = leads.find(l => l.id === selectedLeadId) ?? null;
  const selectedDots = resolveMenuDots(leadMenuState, selectedLead);
  const overlayLeadForMenu = leads.find(l => l.id === leadOverlayId) ?? selectedLead;
  const overlayDots = resolveMenuDots(leadMenuState, overlayLeadForMenu, leadOverlayId);
  const pipelineLeadForMenu = leads.find(l => l.id === pipelineLeadId) ?? null;
  const pipelineDots = resolveMenuDots(leadMenuState, pipelineLeadForMenu, pipelineLeadId);
  const leadCasperOn = selectedLead
    ? casperEffectiveForLead(casperOn, selectedLead.casper_enabled)
    : false;
  const lastThreadMsg = messages[messages.length - 1] ?? null;
  const casperWaiting = !!(
    selectedLead &&
    leadCasperOn &&
    lastThreadMsg?.direction === 'inbound' &&
    Date.now() - new Date(lastThreadMsg.created_at).getTime() < 10 * 60_000
  );
  const webphone = useWebPhone();
  const router = useRouter();
  const pathname = usePathname();
  const [dialerOpen, setDialerOpen] = useState(false);
  const [userTz, setUserTz] = useState(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
    } catch {
      return 'America/New_York';
    }
  });

  useEffect(() => {
    setDialerOpen(false);
  }, [pathname]);

  useEffect(() => {
    fetch('/api/settings/casper')
      .then(r => r.json())
      .then(d => setCasperOn(!!d.enabled))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/settings/timezone', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (d.timezone) setUserTz(d.timezone); })
      .catch(() => {});
  }, []);

  // ── Load lead list ──────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    fetch('/api/lead-statuses', { credentials: 'include' })
      .then(r => r.json())
      .then(j => { if (j.statuses) setDbStatuses(j.statuses); })
      .catch(() => {});
  }, []);

  const initialConvsRef = useRef(true);
  const loadLeads = useCallback(async () => {
    // A campaign list is open — don't overwrite it with the replies-only inbox
    if (activeListNameRef.current && !debouncedSearch.trim()) return;
    try {
      const params = new URLSearchParams();
      if (initialLeadId) params.set('leadId', initialLeadId);
      if (debouncedSearch.trim()) params.set('q', debouncedSearch.trim());
      if (initialConvsRef.current) params.set('initial', '1');
      const qs = params.toString() ? `?${params}` : '';
      const res = await fetch(`/api/inbox/conversations${qs}`);
      if (!res.ok) {
        setLoadingLeads(false);
        return;
      }
      const data = await res.json();
      // Campaign opened while this inbox fetch was in flight
      if (activeListNameRef.current && !debouncedSearch.trim()) return;
      setLeads(sortInboxLeads(data.leads ?? []));
      if (data.phoneConnection) setPhoneConn(data.phoneConnection);
      else if (initialConvsRef.current) setPhoneConn(null);
      initialConvsRef.current = false;
      if (data.dbError || data.setupRequired) setDbSetupRequired(true);
    } catch {
      // Network error — show nothing rather than crash
    } finally {
      setLoadingLeads(false);
    }
  }, [initialLeadId, debouncedSearch]);

  useEffect(() => { loadLeads(); }, [loadLeads]);

  // Inbox owns the single iframe: Pipeline list ↔ Lead Info swap, never nest.
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const d = e.data;
      if (!d || typeof d !== 'object') return;
      if (d.type === OPEN_LEAD_MSG && d.id) {
        setShowPipeline(true);
        setPipelineShowingLead(true);
        setPipelineLeadId(d.id);
        setPipelineFrameSrc(leadInfoUrl(d.id, { tab: d.tab, action: d.action }));
        return;
      }
      if (d.type === LEAD_SHOWN_MSG && d.id) {
        setPipelineLeadId(d.id);
        return;
      }
      if (d.type === LEAD_STATE_MSG && typeof d.section === 'string') {
        setLeadMenuState(prev => applyLeadStateMsg(prev, d));
        return;
      }
      if (d.type === BACK_TO_PIPELINE_MSG) {
        const id = d.id || pipelineLeadId;
        setPipelineLeadId(id || null);
        setPipelineShowingLead(false);
        setPipelineFrameSrc(pipelineListUrl(id));
        if (leadOverlayId && (!d.id || d.id === leadOverlayId)) {
          setLeadOverlayId(null);
        }
        return;
      }
      if (d.type === LEAD_DELETED_MSG && d.id) {
        setLeads(prev => prev.filter(l => l.id !== d.id));
        if (leadOverlayId === d.id) setLeadOverlayId(null);
        setPipelineShowingLead(false);
        setPipelineLeadId(prev => (prev === d.id ? null : prev));
        setPipelineFrameSrc('/pipeline?modal=1');
        router.refresh();
        return;
      }
      if (d.type === PIPELINE_LEAD_MSG && d.id && d.patch) {
        const patch = d.patch as Partial<InboxLead>;
        const statusTouched = Object.prototype.hasOwnProperty.call(patch, 'lead_status')
          || Object.prototype.hasOwnProperty.call(patch, 'in_pipeline');
        if (statusTouched && activeListNameRef.current && !isCampaignInboxLead({
          in_pipeline: patch.in_pipeline,
          lead_status: patch.lead_status,
        })) {
          setLeads(prev => prev.filter(l => l.id !== d.id));
          if (selectedLeadIdRef.current === d.id) setSelectedLeadId(null);
          return;
        }
        setLeads(prev => sortInboxLeads(prev.map(l => l.id === d.id ? { ...l, ...patch } as InboxLead : l)));
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [pipelineLeadId, leadOverlayId, router]);

  // ── Load messages on lead select ────────────────────────────────────────────
  const loadMessages = useCallback(async (leadId: string, opts?: { quiet?: boolean; since?: string; conversationId?: string | null }) => {
    if (!opts?.quiet) {
      setLoadingMsgs(true);
      setMessages([]);
      setSendError(null);
    }
    try {
      const params = new URLSearchParams({ leadId });
      if (opts?.since) {
        params.set('since', opts.since);
        if (opts.conversationId) params.set('conversationId', opts.conversationId);
      }
      const res = await fetch(`/api/inbox/messages?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      const incoming: InboxMessage[] = data.messages ?? [];
      let merged: InboxMessage[];
      if (opts?.since) {
        const prev = messagesRef.current;
        const map = new Map(prev.map(m => [m.id, m]));
        const outboundBodies = new Set(
          incoming.filter(m => m.direction === 'outbound').map(m => m.body),
        );
        for (const [id, m] of [...map.entries()]) {
          if (id.startsWith('opt_') && outboundBodies.has(m.body)) map.delete(id);
        }
        for (const m of incoming) {
          const cur = map.get(m.id);
          map.set(m.id, cur ? { ...cur, ...m } : m);
        }
        merged = [...map.values()].sort((a, b) => {
          const t = a.created_at.localeCompare(b.created_at);
          return t || a.id.localeCompare(b.id);
        });
      } else {
        const prev = messagesRef.current;
        merged = incoming;
        if (
          prev.length === incoming.length &&
          prev.every((m, i) =>
            m.id === incoming[i].id &&
            m.status === incoming[i].status &&
            m.body === incoming[i].body &&
            m.error_message === incoming[i].error_message
          )
        ) {
          merged = prev;
        }
      }
      messagesRef.current = merged;
      setMessages(merged);
      if (data.conversationId) setConversationId(data.conversationId);

      const last = merged[merged.length - 1];
      setLeads(prev => sortInboxLeads(prev.map(l => {
        if (l.id !== leadId) return l;
        const prevAt = Date.parse(l.conversation?.last_message_at ?? '') || 0;
        const nextAt = last ? Date.parse(last.created_at) || 0 : 0;
        const bump = !!(last && nextAt >= prevAt);
        return {
          ...l,
          conversation: {
            id: l.conversation?.id ?? data.conversationId ?? '',
            last_message_at: bump ? last.created_at : (l.conversation?.last_message_at ?? null),
            last_inbound_at: last?.direction === 'inbound'
              ? last.created_at
              : l.conversation?.last_inbound_at,
            last_message_preview: bump
              ? ((last.body || '').slice(0, 100) || l.conversation?.last_message_preview || null)
              : (l.conversation?.last_message_preview ?? null),
            last_direction: bump ? last.direction : (l.conversation?.last_direction ?? null),
            unread_count: opts?.since ? (l.conversation?.unread_count ?? 0) : 0,
          },
        };
      })));
    } finally {
      if (!opts?.quiet) setLoadingMsgs(false);
    }
  }, []);

  useEffect(() => {
    if (selectedLeadId) loadMessages(selectedLeadId);
    setShowTpls(false);
    setAddingTpl(false);
    setEditingTplId(null);
    stickToBottomRef.current = true;
    lastScrolledMsgIdRef.current = null;
  }, [selectedLeadId, loadMessages]);

  const { pulse, registerOpenLead } = useSync();
  useEffect(() => { conversationIdRef.current = conversationId; }, [conversationId]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  useEffect(() => {
    registerOpenLead('inbox', selectedLeadId);
    return () => registerOpenLead('inbox', null);
  }, [selectedLeadId, registerOpenLead]);

  const threadSig = pulse?.threads.find(t => t.leadId === selectedLeadId)?.sig ?? '';
  const lastThreadSigRef = useRef('');
  useEffect(() => {
    lastThreadSigRef.current = '';
  }, [selectedLeadId]);
  useEffect(() => {
    if (!selectedLeadId || !threadSig || threadSig === lastThreadSigRef.current) return;
    lastThreadSigRef.current = threadSig;
    const lastAt = messagesRef.current[messagesRef.current.length - 1]?.created_at;
    if (!lastAt) {
      void loadMessages(selectedLeadId, { quiet: true });
      return;
    }
    void loadMessages(selectedLeadId, {
      quiet: true,
      since: lastAt,
      conversationId: conversationIdRef.current,
    });
  }, [threadSig, selectedLeadId, loadMessages]);

  const casperPoll = useCallback(() => {
    if (!selectedLeadId) return;
    const lastAt = messagesRef.current[messagesRef.current.length - 1]?.created_at;
    if (lastAt) {
      void loadMessages(selectedLeadId, { quiet: true, since: lastAt, conversationId: conversationIdRef.current });
    } else {
      void loadMessages(selectedLeadId, { quiet: true });
    }
  }, [selectedLeadId, loadMessages]);
  usePolling(casperPoll, 5000, !!(selectedLeadId && casperWaiting));

  const markedReadRef = useRef('');
  useEffect(() => {
    if (!selectedLeadId || !pulse?.inboxChanged?.length) return;
    const row = pulse.inboxChanged.find(r => r.lead_id === selectedLeadId);
    if (!row || !(Number(row.unread_count) > 0)) return;
    const key = `${selectedLeadId}:${row.last_message_at ?? ''}`;
    if (markedReadRef.current === key) return;
    markedReadRef.current = key;
    fetch('/api/inbox/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId: selectedLeadId }),
    }).catch(() => {});
    setLeads(prev => prev.map(l =>
      l.id === selectedLeadId && l.conversation
        ? { ...l, conversation: { ...l.conversation, unread_count: 0 } }
        : l
    ));
  }, [pulse, selectedLeadId]);

  useEffect(() => {
    const rows = pulse?.inboxChanged;
    if (!rows?.length) return;
    setLeads(prev => {
      let missing = false;
      const byId = new Map(rows.map(r => [r.lead_id, r]));
      const next = prev.map(l => {
        const row = byId.get(l.id);
        if (!row) return l;
        return {
          ...l,
          conversation: {
            id: l.conversation?.id ?? '',
            last_message_at: row.last_message_at ?? l.conversation?.last_message_at ?? null,
            last_inbound_at: row.last_inbound_at ?? l.conversation?.last_inbound_at,
            last_message_preview: row.last_message_preview ?? l.conversation?.last_message_preview ?? null,
            last_direction: row.last_direction ?? l.conversation?.last_direction ?? null,
            unread_count: selectedLeadId === l.id ? 0 : (row.unread_count ?? l.conversation?.unread_count ?? 0),
          },
        };
      });
      for (const row of rows) {
        if (prev.some(l => l.id === row.lead_id)) continue;
        const key = `${row.lead_id}:${row.last_message_at ?? ''}`;
        if (reloadedMissingRef.current.has(key)) continue;
        reloadedMissingRef.current.add(key);
        missing = true;
      }
      if (missing && !activeListNameRef.current) void loadLeads();
      return sortInboxLeads(next);
    });
  }, [pulse, loadLeads, selectedLeadId]);

  // If the inbound webhook timed out, kick Casper from the open thread.
  useEffect(() => {
    if (!selectedLeadId || !casperWaiting || !lastThreadMsg) return;
    const t = window.setTimeout(() => {
      fetch('/api/casper/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: selectedLeadId, delay: true }),
      })
        .then(() => loadMessages(selectedLeadId, { quiet: true }))
        .catch(() => {});
    }, 2800);
    return () => window.clearTimeout(t);
  }, [selectedLeadId, casperWaiting, lastThreadMsg?.id, loadMessages]);

  // Keep the thread pinned to newest only if the user is already at the bottom
  // (or just opened/sent). Polling must not yank the view while reading history.
  useEffect(() => {
    const lastId = messages[messages.length - 1]?.id ?? null;
    const openedThread = lastScrolledMsgIdRef.current === null && messages.length > 0;
    const newTail = lastId !== lastScrolledMsgIdRef.current;
    lastScrolledMsgIdRef.current = lastId;
    if (!openedThread && !newTail) return;
    if (!openedThread && !stickToBottomRef.current) return;
    const el = threadScrollerRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [messages]);

  // ── Supabase realtime for new inbound messages ──────────────────────────────
  useEffect(() => {
    if (!conversationId) return;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const channel = supabase
      .channel(`inbox_${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'inbox_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newMsg = payload.new as InboxMessage;
          setMessages(prev => {
            // Avoid duplicates (we already optimistically add outbound)
            if (prev.some(m => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'inbox_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const updated = payload.new as InboxMessage;
          setMessages(prev => prev.map(m => m.id === updated.id ? { ...m, ...updated } : m));
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [conversationId]);

  // Any inbound/outbound on any thread — jump that lead to the top of the rail.
  useEffect(() => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const channel = supabase
      .channel('inbox_rail')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inbox_conversations' },
        (payload) => {
          const row = payload.new as {
            id?: string;
            lead_id?: string;
            last_message_at?: string | null;
            last_inbound_at?: string | null;
            last_message_preview?: string | null;
            last_direction?: string | null;
            unread_count?: number;
          } | null;
          if (!row?.lead_id) return;
          const leadId = row.lead_id;
          setLeads(prev => {
            if (!prev.some(l => l.id === leadId)) {
              void loadLeads();
              return prev;
            }
            return sortInboxLeads(prev.map(l =>
              l.id === leadId
                ? {
                    ...l,
                    conversation: {
                      id: row.id ?? l.conversation?.id ?? '',
                      last_message_at: row.last_message_at ?? l.conversation?.last_message_at ?? null,
                      last_inbound_at: row.last_inbound_at ?? l.conversation?.last_inbound_at,
                      last_message_preview: row.last_message_preview ?? l.conversation?.last_message_preview ?? null,
                      last_direction: row.last_direction ?? l.conversation?.last_direction ?? null,
                      unread_count: row.unread_count ?? l.conversation?.unread_count ?? 0,
                    },
                  }
                : l
            ));
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadLeads]);

  usePolling(loadLeads, 120_000, true, false);

  // ── List picker: open + fetch ───────────────────────────────────────────────
  const openListPicker = async () => {
    const next = !showListPicker;
    setShowListPicker(next);
    if (next && listPickerBtnRef.current) {
      const rect = listPickerBtnRef.current.getBoundingClientRect();
      setPickerAnchor({ top: rect.bottom + 6, left: rect.left });
    }
    if (listPickerData) return;
    setLoadingListPicker(true);
    try {
      // Reuse the existing lead-lists route which uses select('*') — works with any schema
      const res = await fetch('/api/lead-lists');
      if (res.ok) {
        const data = await res.json();
        // Transform { lists: [...with lead_count] } into { lists, countMap }
        const lists: LeadList[] = (data.lists ?? []).map((l: any) => ({
          id: l.id,
          name: l.name,
          created_at: l.created_at ?? null,
        }));
        lists.sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));
        const countMap: Record<string, number> = {};
        for (const l of data.lists ?? []) countMap[l.id] = l.lead_count ?? 0;
        setListPickerData({ lists, countMap });
      }
    } finally {
      setLoadingListPicker(false);
    }
  };

  // ── Load leads from a list ─────────────────────────────────────────────────
  const loadListLeads = async (list: LeadList) => {
    setShowListPicker(false);
    setLoadingListLeads(true);
    activeListNameRef.current = list.name;
    setActiveListName(list.name);
    setActiveListId(list.id);
    setSelectedLeadId(null);
    setMessages([]);
    setConversationId(null);
    try {
      // Use the inbox lead-lists route to get leads with phones from this list
      const res = await fetch(`/api/inbox/lead-lists?listId=${list.id}`);
      if (!res.ok) {
        // Fallback: try the existing leads page query via URL search
        return;
      }
      const data = await res.json();
      // Convert list leads to InboxLead shape
      const listLeads: InboxLead[] = (data.leads ?? []).map((l: any) => ({
        id: l.id,
        name: l.name ?? '',
        company: l.company ?? null,
        phone: l.phone ?? '',
        stage: l.stage ?? null,
        lead_status: (l.sms_opt_out ? 'DNC' : l.lead_status) ?? null,
        in_pipeline: l.in_pipeline ?? false,
        month_key: null,
        last_contact: l.last_contact ?? null,
        created_at: l.created_at ?? null,
        sms_opt_out: l.sms_opt_out ?? false,
        casper_enabled: l.casper_enabled ?? null,
        notes: l.notes ?? null,
        conversation: null,
      }));
      setLeads(listLeads);
    } finally {
      setLoadingListLeads(false);
    }
  };


  // ── Send message ────────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!selectedLeadId || !composerText.trim() || sending) return;
    setSending(true);
    setSendError(null);

    const body = composerText.trim();
    setComposerText('');
    stickToBottomRef.current = true;

    // Optimistic message
    const optimistic: InboxMessage = {
      id: `opt_${Date.now()}`,
      conversation_id: conversationId ?? '',
      lead_id: selectedLeadId,
      direction: 'outbound',
      body,
      status: 'queued',
      sent_by: 'user',
      twilio_sid: null,
      error_message: null,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimistic]);

    try {
      const res = await fetch('/api/inbox/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: selectedLeadId, body }),
      });
      const data = await res.json();

      if (data.message) {
        setMessages(prev => {
          const realId = data.message.id as string | undefined;
          if (realId && prev.some(m => m.id === realId)) {
            return prev.filter(m => m.id !== optimistic.id);
          }
          return prev.map(m => m.id === optimistic.id ? { ...optimistic, ...data.message } : m);
        });
        // Update conversation preview in lead list
        const preview = body.length > 100 ? body.slice(0, 97) + '…' : body;
        setLeads(prev => sortInboxLeads(prev.map(l =>
          l.id === selectedLeadId
            ? {
                ...l,
                conversation: {
                  ...(l.conversation ?? { id: data.message.conversation_id, unread_count: 0 }),
                  last_message_at: data.message.created_at,
                  last_message_preview: preview,
                  last_direction: 'outbound',
                  unread_count: l.conversation?.unread_count ?? 0,
                },
              }
            : l
        )));

        if (data.error) setSendError(data.error);
        if (data.message?.id && selectedLeadId) {
          window.setTimeout(() => { loadMessages(selectedLeadId); }, 4000);
        }
      }
    } catch {
      setMessages(prev =>
        prev.map(m =>
          m.id === optimistic.id ? { ...m, status: 'failed', error_message: 'Network error' } : m
        )
      );
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Group messages by date for separators ──────────────────────────────────
  const groupedMessages: Array<{ date: string; msgs: InboxMessage[] }> = [];
  for (const msg of messages) {
    const label = dateSeparator(msg.created_at);
    const last = groupedMessages[groupedMessages.length - 1];
    if (!last || last.date !== label) {
      groupedMessages.push({ date: label, msgs: [msg] });
    } else {
      last.msgs.push(msg);
    }
  }

  const loadTpls = useCallback(async () => {
    try {
      const res = await fetch('/api/text-templates');
      const data = await res.json();
      setTpls((data.templates ?? []).map((t: SavedTpl) => ({ id: t.id, name: t.name, body: t.body })));
    } catch { /* keep */ }
  }, []);

  useEffect(() => { void loadTpls(); }, [loadTpls]);

  const useTpl = (body: string) => {
    if (!selectedLead) return;
    setComposerText(fillTpl(body, selectedLead));
    setShowTpls(false);
    requestAnimationFrame(() => {
      const el = composerRef.current;
      if (!el) return;
      el.focus();
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    });
  };

  const startEditTpl = (t: SavedTpl) => {
    setAddingTpl(false);
    setEditingTplId(t.id);
    setDraftName(t.name);
    setDraftBody(t.body);
  };

  const cancelTplForm = () => {
    setAddingTpl(false);
    setEditingTplId(null);
    setDraftName('');
    setDraftBody('');
  };

  const saveTpl = async () => {
    const name = draftName.trim() || `Template ${tpls.length + 1}`;
    const body = draftBody.trim();
    if (!body || savingTpl) return;
    setSavingTpl(true);
    try {
      const res = await fetch('/api/text-templates', {
        method: editingTplId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingTplId ? { id: editingTplId, name, body } : { name, body }),
      });
      const data = await res.json();
      if (data.template) {
        setTpls(prev => editingTplId
          ? prev.map(t => t.id === editingTplId ? { id: data.template.id, name: data.template.name, body: data.template.body } : t)
          : [{ id: data.template.id, name: data.template.name, body: data.template.body }, ...prev]);
        cancelTplForm();
      }
    } finally {
      setSavingTpl(false);
    }
  };

  const deleteTpl = async (id: string) => {
    setTpls(prev => prev.filter(t => t.id !== id));
    await fetch(`/api/text-templates?id=${id}`, { method: 'DELETE' });
  };

  const { chars, segments, encoding } = smsSegments(composerText);

  const openInboxLead = (extra?: { tab?: string; action?: string }) => {
    if (!selectedLead) return;
    setLeadOverlayExtra(extra);
    setLeadOverlayId(selectedLead.id);
    setLeadOverlayKey(k => k + 1);
  };

  const handleInboxLeadAction = (id: LeadActionId) => {
    switch (id) {
      case 'application':
        openInboxLead({ tab: 'application' });
        break;
      case 'status':
        openInboxLead({ tab: 'status' });
        break;
      case 'lender':
        openInboxLead({ tab: 'lender' });
        break;
      case 'docs':
        if (selectedLead) setDocsLead({ id: selectedLead.id, name: selectedLead.name, company: selectedLead.company });
        break;
      case 'comms':
        openInboxLead({ tab: 'comms' });
        break;
      case 'send':
        openInboxLead({ tab: 'lender', action: 'send' });
        break;
      case 'offers':
        openInboxLead({ tab: 'offers' });
        break;
      case 'financials':
        openInboxLead({ tab: 'lender' });
        break;
      case 'sms':
        break;
      case 'email':
        if (selectedLead) setEmailLead({ id: selectedLead.id, name: selectedLead.name, company: selectedLead.company, phone: selectedLead.phone });
        break;
      case 'followup':
        if (selectedLead) setFollowLead({ id: selectedLead.id, name: selectedLead.company || selectedLead.name });
        break;
      case 'call':
        if (selectedLead?.phone) webphone.openDialPad(selectedLead.phone);
        break;
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <>
    <div className="flex flex-col flex-1 overflow-hidden" style={{ height: 'calc(100vh - 80px)' }}>

    {/* DB setup banner */}
    {dbSetupRequired && (
      <div className="flex items-center gap-3 px-6 py-3 bg-amber-50 border-b border-amber-200 text-sm text-amber-800">
        <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <span>
          <strong>One-time setup required:</strong> Run <code className="bg-amber-100 px-1.5 py-0.5 rounded text-xs font-mono">inbox-setup.sql</code> in your Supabase SQL editor to create the inbox tables, then refresh this page.
        </span>
        <button onClick={() => setDbSetupRequired(false)} className="ml-auto text-amber-400 hover:text-amber-600">✕</button>
      </div>
    )}

    <div className="flex flex-1 overflow-hidden border-t border-[#e5e5e5]">

      {/* ── LEFT RAIL: Lead list ─────────────────────────────────────────────── */}
      <div className="w-80 flex-shrink-0 flex flex-col border-r border-[#e5e5e5] bg-white overflow-hidden">
        {/* Header */}
        <div className="px-4 pt-3 pb-3 border-b border-[#e5e5e5]">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <svg className="absolute left-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-6 pr-2 py-1.5 text-sm bg-transparent text-[#1a1a1a] placeholder:text-[#9b9b9b] focus:outline-none"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                setPipelineFrameSrc('/pipeline?modal=1');
                setPipelineLeadId(null);
                setPipelineShowingLead(false);
                setShowPipeline(true);
              }}
              className="flex-shrink-0 text-[11px] font-medium text-[#6b6b6b] hover:text-[#1a1a1a] transition-colors bg-transparent border-0 p-0"
            >
              Pipeline
            </button>

            <div className="relative flex-shrink-0" ref={listPickerRef}>
              <button
                ref={listPickerBtnRef}
                onClick={openListPicker}
                title="Load a campaign"
                className={`flex items-center gap-1 text-[11px] font-medium bg-transparent border-0 p-0 shadow-none rounded-none transition-colors ${
                  activeListName ? 'text-[#1a1a1a]' : 'text-[#6b6b6b] hover:text-[#1a1a1a]'
                }`}
              >
                {activeListName ? (
                  <span className="max-w-[88px] truncate">{activeListName}</span>
                ) : 'Campaign'}
              </button>

              {showListPicker && pickerAnchor && (
                <ListPickerDropdown
                  anchor={pickerAnchor}
                  data={listPickerData}
                  loading={loadingListPicker}
                  onSelect={loadListLeads}
                  onClear={activeListName ? () => {
                    activeListNameRef.current = null;
                    setActiveListName(null);
                    setActiveListId(null);
                    setShowListPicker(false);
                    loadLeads();
                  } : undefined}
                  onClose={() => setShowListPicker(false)}
                />
              )}
            </div>
          </div>
          {loadingListLeads && (
            <p className="text-[10px] text-gray-400 animate-pulse mt-1.5">Loading…</p>
          )}
        </div>

        {/* Lead list */}
        <div className="flex-1 overflow-y-auto">
          {loadingLeads ? (
            <div className="flex items-center justify-center py-12 text-sm text-gray-400">Loading…</div>
          ) : leads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <p className="text-sm text-gray-400">
                {search ? 'No leads match your search' : 'No leads with phone numbers'}
              </p>
            </div>
          ) : (
            leads.map(lead => {
              const isSelected = lead.id === selectedLeadId;
              const unread = lead.conversation?.unread_count ?? 0;
              return (
                <button
                  key={lead.id}
                  onClick={() => setSelectedLeadId(lead.id)}
                  className={`w-full text-left px-4 py-2 border-b border-[#f0f0f0] transition-colors ${
                    isSelected ? 'bg-[#f0f0f0]' : 'hover:bg-[#fafafa]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {unread > 0 && (
                          <span className="flex-shrink-0 w-2 h-2 rounded-full bg-blue-500" />
                        )}
                        <p className={`text-sm truncate ${unread > 0 ? 'font-semibold text-red-600' : 'font-medium text-[#1a1a1a]'}`}>
                          {lead.company || lead.name}
                        </p>
                      </div>
                      <p className="text-xs text-[#6b6b6b] truncate mt-0.5">
                        {lead.company ? lead.name : fmt(lead.phone)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className="text-[10px] text-gray-400">
                        {relativeTime(lead.conversation?.last_message_at ?? lead.last_contact)}
                      </span>
                      {lead.lead_status && (
                        <span
                          className="inline-flex h-[18px] w-[88px] items-center justify-center truncate rounded px-1.5 text-[10px] font-medium"
                          style={{
                            background: getStatusStyleFrom(lead.lead_status, dbStatuses).bg,
                            color: getStatusStyleFrom(lead.lead_status, dbStatuses).text,
                          }}
                        >
                          {lead.lead_status}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── CENTER: Thread ───────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-white">
        {!selectedLead ? (
          <div className="flex-1 flex flex-col items-center justify-center px-8">
            <img
              src="/images/logo/gostwrk-logo-gray.png"
              alt="Gostwrk"
              className="w-[240px] h-auto opacity-70"
            />
          </div>
        ) : (
          <>
            {/* Thread header */}
            <div className="flex items-center justify-between px-6 py-3.5 border-b border-[#e5e5e5] bg-white flex-shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-[#1a1a1a]">
                    {selectedLead.name}
                  </h2>
                  {selectedLead.sms_opt_out && (
                    <span
                      className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                      style={{
                        background: getStatusStyleFrom('DNC', dbStatuses).bg,
                        color: getStatusStyleFrom('DNC', dbStatuses).text,
                      }}
                    >
                      DNC
                    </span>
                  )}
                </div>
                <p className="flex items-center gap-1.5 text-xs text-[#6b6b6b]">
                  <span>
                    {selectedLead.company && `${selectedLead.company} · `}
                    {selectedLead.phone ? (
                      <PhoneLocHover phone={selectedLead.phone} userTz={userTz} formatted={fmt(selectedLead.phone)} />
                    ) : null}
                  </span>
                  {selectedLead.phone && (
                    <button
                      type="button"
                      onClick={() => webphone.openDialPad(selectedLead.phone)}
                      className="shrink-0 p-0.5 text-[#9ca3af] hover:text-[#6b7280] transition-colors focus:outline-none"
                      title="Call"
                    >
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                          d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498A1 1 0 0121 15.72V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 7V5z" />
                      </svg>
                    </button>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex flex-col items-end gap-0.5">
                  <LeadActionsMenu
                    compact
                    align="right"
                    onAction={handleInboxLeadAction}
                    hiddenItems={['sms']}
                    showAppDot
                    appComplete={selectedDots.appComplete}
                    lendersComplete={selectedDots.lendersComplete}
                    docsComplete={selectedDots.docsComplete}
                    offersComplete={selectedDots.offersComplete}
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      const next = !leadCasperOn;
                      setLeads(prev => prev.map(l =>
                        l.id === selectedLead.id ? { ...l, casper_enabled: next } : l
                      ));
                      try {
                        await fetch(`/api/leads/${selectedLead.id}/casper`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ enabled: next }),
                        });
                      } catch {
                        setLeads(prev => prev.map(l =>
                          l.id === selectedLead.id ? { ...l, casper_enabled: !next } : l
                        ));
                      }
                    }}
                    title={
                      leadCasperOn
                        ? 'Casper is on for this lead — click to turn off'
                        : casperOn
                          ? 'Casper is off for this lead — click to allow'
                          : 'Global Casper is off — click to turn Casper on for this lead only'
                    }
                    className={`text-[10px] font-medium transition-colors ${
                      leadCasperOn ? 'text-[#1a1a1a]' : 'text-red-500'
                    }`}
                  >
                    Casper
                  </button>
                </div>
              </div>
            </div>

            {/* No Twilio connection banner */}
            {!phoneConn && (
              <div className="mx-4 mt-3 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2 flex-shrink-0">
                <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <p className="text-xs text-amber-700 flex-1">
                  No Twilio connection — messages will be saved but not sent.{' '}
                  <a href="/settings/connections" className="underline font-medium">Connect in Settings →</a>
                </p>
              </div>
            )}

            {/* Messages */}
            <div
              ref={threadScrollerRef}
              className="flex-1 overflow-y-auto px-6 py-4 space-y-1"
              onScroll={e => {
                const el = e.currentTarget;
                stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 96;
              }}
            >
              {loadingMsgs ? (
                <div className="flex items-center justify-center py-12 text-sm text-gray-400">Loading thread…</div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <p className="text-sm text-gray-400">No messages yet</p>
                  <p className="text-xs text-gray-300 mt-1">Send the first message below</p>
                </div>
              ) : (
                groupedMessages.map(group => (
                  <div key={group.date}>
                    {/* Date separator */}
                    <div className="flex items-center gap-3 my-4">
                      <div className="flex-1 h-px bg-[#e5e5e5]" />
                      <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wide whitespace-nowrap">
                        {group.date}
                      </span>
                      <div className="flex-1 h-px bg-[#e5e5e5]" />
                    </div>

                    {/* Messages in group */}
                    <div className="space-y-1.5">
                      {group.msgs.map(msg => {
                        const receipt = outboundSmsReceipt(msg, messages);
                        const photos = (msg.media_items ?? []).filter(item => item?.sid || item?.path);
                        const caption = msg.body === 'Attachment: 1 Photo' && photos.length ? '' : msg.body;
                        return (
                        <div
                          key={msg.id}
                          className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div className={`max-w-[72%] ${msg.direction === 'outbound' ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
                            {photos.map((photo, photoIndex) => (
                              <InboundPhoto
                                key={`${msg.id}-${photoIndex}`}
                                messageId={msg.id}
                                index={photoIndex}
                                savedAt={photo.savedAt}
                                onSaved={(savedAt) => {
                                  setMessages(prev => prev.map(m => {
                                    if (m.id !== msg.id || !m.media_items) return m;
                                    return {
                                      ...m,
                                      media_items: m.media_items.map((item, n) => n === photoIndex ? { ...item, savedAt } : item),
                                    };
                                  }));
                                }}
                              />
                            ))}
                            {caption ? (
                            <div
                              className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                                msg.direction === 'outbound'
                                  ? 'bg-blue-500 text-white rounded-br-sm'
                                  : 'bg-[#f0f0f0] text-[#1a1a1a] rounded-bl-sm'
                              } ${receipt === 'failed' ? 'opacity-60' : ''}`}
                            >
                              {caption}
                            </div>
                            ) : null}
                            <div className={`flex items-center gap-1.5 px-1 ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                              <span className="text-[10px] text-gray-400">{msgTime(msg.created_at)}</span>
                              {msg.direction === 'outbound' && (
                                <>
                                  {receipt === 'queued' && <span className="text-[10px] text-gray-300">sending…</span>}
                                  {receipt === 'sent' && <span className="text-[10px] text-gray-400">✓ sent</span>}
                                  {receipt === 'delivered' && <span className="text-[10px] text-blue-400">✓✓ delivered</span>}
                                  {receipt === 'read' && <span className="text-[10px] text-blue-500">✓✓ Read</span>}
                                  {receipt === 'failed' && (
                                    <span className="text-[10px] text-red-500">
                                      ✕ failed
                                      {msg.error_message && ` · ${msg.error_message}`}
                                    </span>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
              {casperWaiting && (
                <div className="flex justify-end mt-2">
                  <div className="max-w-[72%] flex flex-col items-end gap-0.5">
                    <div className="px-4 py-2.5 rounded-2xl rounded-br-sm bg-blue-500/80 text-white text-sm">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="flex gap-0.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-white/90 animate-bounce [animation-delay:-0.3s]" />
                          <span className="w-1.5 h-1.5 rounded-full bg-white/90 animate-bounce [animation-delay:-0.15s]" />
                          <span className="w-1.5 h-1.5 rounded-full bg-white/90 animate-bounce" />
                        </span>
                        <span className="text-[11px] text-white/80">Casper is thinking…</span>
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-400 px-1">getting ready to reply</span>
                  </div>
                </div>
              )}
            </div>

            {/* Composer */}
            <div className="px-4 py-3 border-t border-[#e5e5e5] bg-white flex-shrink-0">
              {sendError && (
                <p className="text-xs text-amber-600 mb-1.5 px-1">⚠ {sendError}</p>
              )}
              {showTpls && (
                <div className="mb-2 max-h-[220px] overflow-y-auto border border-[#f0f0f0] rounded-xl p-2.5 space-y-1.5">
                  <p className="text-[10px] text-[#9b9b9b]">
                    Tap a template to use it · {'{first_name} {company}'}
                  </p>
                  {tpls.length === 0 && (
                    <p className="text-[11px] text-[#c4c4c4] py-1">No templates yet</p>
                  )}
                  {tpls.map(t => (
                    editingTplId === t.id ? (
                      <div key={t.id} className="space-y-1.5">
                        <input
                          value={draftName}
                          onChange={e => setDraftName(e.target.value)}
                          placeholder="Name"
                          className="w-full px-2 py-1 text-[11px] border border-[#e5e5e5] rounded-lg focus:outline-none focus:border-[#1a1a1a]"
                        />
                        <textarea
                          value={draftBody}
                          onChange={e => setDraftBody(e.target.value)}
                          placeholder="Template text…"
                          rows={3}
                          className="w-full px-2 py-1 text-[11px] border border-[#e5e5e5] rounded-lg focus:outline-none focus:border-[#1a1a1a] resize-none"
                        />
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => void saveTpl()}
                            disabled={!draftBody.trim() || savingTpl}
                            className="text-[11px] font-medium text-[#1a1a1a] disabled:opacity-40"
                          >
                            {savingTpl ? 'Saving…' : 'Save'}
                          </button>
                          <button
                            type="button"
                            onClick={cancelTplForm}
                            className="text-[11px] text-[#9b9b9b] hover:text-[#1a1a1a]"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div key={t.id} className="flex items-start gap-1.5">
                        <button
                          type="button"
                          onClick={() => useTpl(t.body)}
                          className="flex-1 min-w-0 text-left px-2 py-1.5 bg-[#f5f5f5] hover:bg-[#ececec] rounded-lg text-[11px] text-[#1a1a1a]"
                        >
                          <span className="block font-medium truncate">{t.name}</span>
                          <span className="block text-[#6b6b6b] truncate">{t.body}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => startEditTpl(t)}
                          className="shrink-0 text-[10px] text-[#9b9b9b] hover:text-[#1a1a1a] pt-1.5"
                          title="Edit"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteTpl(t.id)}
                          className="shrink-0 text-[#c4c4c4] hover:text-red-500 text-[11px] pt-1"
                          title="Delete"
                        >
                          ×
                        </button>
                      </div>
                    )
                  ))}
                  {addingTpl ? (
                    <div className="space-y-1.5 pt-1">
                      <input
                        value={draftName}
                        onChange={e => setDraftName(e.target.value)}
                        placeholder="Name"
                        className="w-full px-2 py-1 text-[11px] border border-[#e5e5e5] rounded-lg focus:outline-none focus:border-[#1a1a1a]"
                      />
                      <textarea
                        value={draftBody}
                        onChange={e => setDraftBody(e.target.value)}
                        placeholder="Template text…"
                        rows={2}
                        className="w-full px-2 py-1 text-[11px] border border-[#e5e5e5] rounded-lg focus:outline-none focus:border-[#1a1a1a] resize-none"
                      />
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => void saveTpl()}
                          disabled={!draftBody.trim() || savingTpl}
                          className="text-[11px] font-medium text-[#1a1a1a] disabled:opacity-40"
                        >
                          {savingTpl ? 'Saving…' : 'Save template'}
                        </button>
                        <button
                          type="button"
                          onClick={cancelTplForm}
                          className="text-[11px] text-[#9b9b9b] hover:text-[#1a1a1a]"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : !editingTplId ? (
                    <button
                      type="button"
                      onClick={() => { setEditingTplId(null); setAddingTpl(true); }}
                      className="text-[11px] font-medium text-[#6b6b6b] hover:text-[#1a1a1a]"
                    >
                      + Add
                    </button>
                  ) : null}
                </div>
              )}
              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowTpls(v => !v)}
                  disabled={selectedLead.sms_opt_out ?? false}
                  className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center border text-lg leading-none transition-colors disabled:opacity-40 ${
                    showTpls
                      ? 'border-[#1a1a1a] text-[#1a1a1a] bg-[#f5f5f5]'
                      : 'border-[#e5e5e5] text-[#6b6b6b] hover:text-[#1a1a1a] hover:border-[#c4c4c4]'
                  }`}
                  title="Text templates"
                >
                  +
                </button>
                <div className="flex-1 bg-[#f5f5f5] rounded-2xl px-4 py-2.5 border border-[#e5e5e5] focus-within:border-gray-300 transition-colors">
                  <textarea
                    ref={composerRef}
                    value={composerText}
                    onChange={e => setComposerText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={selectedLead.sms_opt_out ?? false}
                    placeholder={
                      selectedLead.sms_opt_out
                        ? 'Lead has opted out of SMS'
                        : 'Type a message… (Enter to send, Shift+Enter for newline)'
                    }
                    rows={1}
                    className="w-full bg-transparent text-sm text-[#1a1a1a] resize-none focus:outline-none disabled:opacity-50 placeholder-gray-400"
                    style={{ maxHeight: '120px', overflowY: 'auto' }}
                    onInput={e => {
                      const el = e.currentTarget;
                      el.style.height = 'auto';
                      el.style.height = Math.min(el.scrollHeight, 120) + 'px';
                    }}
                  />
                  {composerText && (
                    <p className="text-[10px] text-gray-400 mt-1 text-right">
                      {chars} chars · {segments} {segments === 1 ? 'segment' : 'segments'} · {encoding}
                    </p>
                  )}
                </div>
                <button
                  onClick={handleSend}
                  disabled={!composerText.trim() || sending || (selectedLead.sms_opt_out ?? false)}
                  className="flex-shrink-0 px-4 py-2.5 bg-[#1a1a1a] text-white text-sm font-medium rounded-2xl disabled:opacity-40 hover:bg-[#333] transition-colors"
                >
                  {sending ? (
                    <span className="flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                      Sending
                    </span>
                  ) : 'Send'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── RIGHT RAIL: Lead info ────────────────────────────────────────────── */}
      <div className="w-80 flex-shrink-0 flex flex-col border-l border-[#e5e5e5] bg-[#fafafa] overflow-hidden">
        <InboxDialer open={dialerOpen} onOpenChange={setDialerOpen} />
        <div className="flex-1 relative min-h-0 overflow-hidden">
          <div className="absolute inset-x-0 bottom-0 pointer-events-none flex justify-center overflow-visible">
            <img
              src="/images/logo/elektro.png"
              alt=""
              className="w-[128%] max-w-none h-auto object-contain object-bottom opacity-20 block"
            />
          </div>
          {selectedLead && (
            <div className="relative z-10 h-full overflow-y-auto p-4 [text-shadow:none]">
              <p className="text-[10px] font-medium mb-3 text-[#c4c4c4]">
                Casper for this lead: {leadCasperOn ? 'on' : 'off'}
              </p>
              <LeadUpdatesTimeline
                createdAt={selectedLead.created_at}
                lastContact={selectedLead.last_contact}
              />
            </div>
          )}
          {selectedLead && (
            <button
              type="button"
              onClick={async () => {
                const next = !casperOn;
                setCasperOn(next);
                try {
                  await fetch('/api/settings/casper', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ enabled: next }),
                  });
                } catch {
                  setCasperOn(!next);
                }
              }}
              title={casperOn ? 'Casper is on — click to turn off' : 'Casper is off — click to turn on'}
              className={`absolute left-4 bottom-3 z-20 text-[10px] font-semibold uppercase tracking-wide transition-colors ${
                casperOn ? 'text-[#1a1a1a]' : 'text-red-500'
              }`}
            >
              Casper AI
            </button>
          )}
        </div>

        {/* Twilio connection status footer */}
        <div className={`px-4 py-2.5 border-t border-[#e5e5e5] flex items-center gap-2 ${phoneConn ? 'bg-green-50' : 'bg-amber-50'}`}>
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${phoneConn ? 'bg-green-400' : 'bg-amber-400'}`} />
          <p className="text-[10px] text-gray-500 truncate">
            {phoneConn
              ? `Twilio · ${fmt(phoneConn.phone_number)}`
              : 'Twilio not connected'}
          </p>
        </div>
      </div>
    </div>
    </div>

    {/* ── Pipeline popup ───────────────────────────────────────────────────── */}
    {showPipeline && (
      <>
        <div
          className="fixed inset-0 bg-black/40 z-[80]"
          onClick={() => {
            setShowPipeline(false);
            setPipelineFrameSrc('/pipeline?modal=1');
            setPipelineLeadId(null);
            setPipelineShowingLead(false);
          }}
        />
        <div
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[81] flex flex-col rounded-xl shadow-2xl overflow-hidden"
          style={{ width: 'min(88vw, 920px)', height: 'min(78vh, 680px)' }}
        >
          <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-[#e5e5e5] flex-shrink-0">
            <div className="flex items-center gap-2">
              {pipelineShowingLead && (
                <button
                  type="button"
                  onClick={() => {
                    setPipelineShowingLead(false);
                    setPipelineFrameSrc(pipelineListUrl(pipelineLeadId));
                  }}
                  className="text-xs text-[#6b6b6b] hover:text-[#1a1a1a] transition-colors"
                >
                  ← Pipeline
                </button>
              )}
              {pipelineShowingLead ? (
                <LeadActionsMenu
                  align="left"
                  onAction={id => {
                    if (id === 'docs' && pipelineLeadId) {
                      const l = leads.find(x => x.id === pipelineLeadId);
                      setDocsLead({ id: pipelineLeadId, name: l?.name || 'Lead', company: l?.company });
                      return;
                    }
                    if (id === 'email' && pipelineLeadId) {
                      const l = leads.find(x => x.id === pipelineLeadId);
                      setEmailLead({ id: pipelineLeadId, name: l?.name || 'Lead', company: l?.company, phone: l?.phone });
                      return;
                    }
                    if (id === 'followup' && pipelineLeadId) {
                      const l = leads.find(x => x.id === pipelineLeadId);
                      setFollowLead({ id: pipelineLeadId, name: l?.company || l?.name || 'Lead' });
                      return;
                    }
                    postLeadActionToFrame(pipelineFrameRef.current, id);
                  }}
                  currentSection={leadMenuState?.id && pipelineLeadId && leadMenuState.id !== pipelineLeadId ? undefined : leadMenuState?.section}
                  showAppDot
                  appComplete={pipelineDots.appComplete}
                  lendersComplete={pipelineDots.lendersComplete}
                  docsComplete={pipelineDots.docsComplete}
                  offersComplete={pipelineDots.offersComplete}
                />
              ) : (
                <span className="text-xs text-[#6b6b6b] font-medium">Pipeline</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <a
                href={pipelineLeadId ? `/pipeline/${pipelineLeadId}` : '/pipeline'}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#6b6b6b] hover:text-[#1a1a1a] text-xs flex items-center gap-1 transition-colors"
                title="Open in full page"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                Full page
              </a>
              <button
                onClick={() => {
                  setShowPipeline(false);
                  setPipelineFrameSrc('/pipeline?modal=1');
                  setPipelineLeadId(null);
                  setPipelineShowingLead(false);
                }}
                className="text-[#6b6b6b] hover:text-[#1a1a1a] transition-colors p-1 rounded hover:bg-[#f5f5f5]"
                title="Close"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          <iframe
            ref={pipelineFrameRef}
            src={pipelineFrameSrc}
            className="flex-1 w-full bg-white border-0"
            title={pipelineShowingLead ? 'Lead workspace' : 'Pipeline'}
          />
        </div>
      </>
    )}

    {/* ── Lead Overlay ─────────────────────────────────────────────────────── */}
    {docsLead && (
      <DocumentsModal
        leadId={docsLead.id}
        leadName={docsLead.name}
        leadCompany={docsLead.company}
        onClose={() => setDocsLead(null)}
      />
    )}
    {emailLead && (
      <ScheduleEmailModal
        lead={emailLead}
        onClose={() => setEmailLead(null)}
      />
    )}
    {followLead && (
      <FollowUpModal
        leadId={followLead.id}
        leadName={followLead.name}
        onClose={() => setFollowLead(null)}
      />
    )}

    {leadOverlayId && (
      <>
        {/* Backdrop — click to close */}
        <div
          className="fixed inset-0 bg-black/40 z-[80]"
          onClick={() => { setLeadOverlayId(null); setLeadOverlayExtra(undefined); }}
        />
        {/* Panel */}
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[81] flex flex-col"
          style={{ width: 'min(92vw, 1200px)', height: 'calc(100vh - 2rem)' }}
        >
          {/* Header bar */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-[#e5e5e5] rounded-t-xl flex-shrink-0">
            <LeadActionsMenu
              align="left"
              onAction={id => {
                const l = leads.find(x => x.id === leadOverlayId) || selectedLead;
                if (id === 'docs') {
                  if (leadOverlayId) setDocsLead({ id: leadOverlayId, name: l?.name || 'Lead', company: l?.company });
                  return;
                }
                if (id === 'email') {
                  if (leadOverlayId) setEmailLead({ id: leadOverlayId, name: l?.name || 'Lead', company: l?.company, phone: l?.phone });
                  return;
                }
                if (id === 'followup') {
                  if (leadOverlayId) setFollowLead({ id: leadOverlayId, name: l?.company || l?.name || 'Lead' });
                  return;
                }
                postLeadActionToFrame(leadOverlayFrameRef.current, id);
              }}
              currentSection={leadMenuState?.id && leadOverlayId && leadMenuState.id !== leadOverlayId ? undefined : leadMenuState?.section}
              showAppDot
              appComplete={overlayDots.appComplete}
              lendersComplete={overlayDots.lendersComplete}
              docsComplete={overlayDots.docsComplete}
              offersComplete={overlayDots.offersComplete}
            />
            <div className="flex items-center gap-3">
              <a
                href={`/pipeline/${leadOverlayId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#6b6b6b] hover:text-[#1a1a1a] text-xs flex items-center gap-1 transition-colors"
                title="Open in full page"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                Full page
              </a>
              <button
                onClick={() => { setLeadOverlayId(null); setLeadOverlayExtra(undefined); }}
                className="text-[#6b6b6b] hover:text-[#1a1a1a] transition-colors p-1 rounded hover:bg-[#f5f5f5]"
                title="Close"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          {/* iframe */}
          <iframe
            ref={leadOverlayFrameRef}
            key={leadOverlayKey}
            src={leadInfoUrl(leadOverlayId, { ...leadOverlayExtra, from: 'inbox' })}
            className="flex-1 w-full bg-white rounded-b-xl border-0"
            title="Lead workspace"
          />
        </div>
      </>
    )}

    </>
  );
}

// ── List picker dropdown ───────────────────────────────────────────────────────

function ListPickerDropdown({
  anchor,
  data,
  loading,
  onSelect,
  onClear,
  onClose,
}: {
  anchor: { top: number; left: number };
  data: { lists: LeadList[]; countMap: Record<string, number> } | null;
  loading: boolean;
  onSelect: (list: LeadList) => void;
  onClear?: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [onClose]);

  const style: React.CSSProperties = {
    position: 'fixed',
    top: anchor.top,
    left: Math.max(8, anchor.left - 160),
    zIndex: 9999,
    width: 240,
  };

  if (loading) {
    return (
      <div ref={ref} style={style} className="bg-white border border-[#e5e5e5] rounded-xl shadow-xl p-4">
        <p className="text-xs text-gray-400 text-center">Loading campaigns…</p>
      </div>
    );
  }

  if (!data || data.lists.length === 0) {
    return (
      <div ref={ref} style={style} className="bg-white border border-[#e5e5e5] rounded-xl shadow-xl p-4">
        <p className="text-xs text-gray-400 text-center">No campaigns yet</p>
      </div>
    );
  }

  return (
    <div ref={ref} style={style} className="bg-white border border-[#e5e5e5] rounded-xl shadow-xl overflow-hidden">
      {/* ~5 rows visible; scroll for older campaigns */}
      <div className="max-h-[180px] overflow-y-auto py-1">
        {onClear && (
          <button
            onClick={onClear}
            className="w-full text-left px-3 py-2 text-xs font-medium text-[#6b6b6b] hover:bg-[#f5f5f5]"
          >
            Back to Inbox
          </button>
        )}
        {data.lists.map(list => {
          const c = data.countMap[list.id] ?? 0;
          return (
            <button
              key={list.id}
              onClick={() => onSelect(list)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-[#f5f5f5]"
            >
              <span className="text-xs text-[#1a1a1a] truncate">{list.name}</span>
              {c > 0 && (
                <span className="text-[10px] text-gray-400 flex-shrink-0">{c}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

