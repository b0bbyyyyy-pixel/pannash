'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { useWebPhone } from '@/components/webphone/WebPhone';
import InboxDialer from '@/components/InboxDialer';
import LeadUpdatesTimeline from '@/components/LeadUpdatesTimeline';
import { casperEffectiveForLead } from '@/lib/casper/allow';

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
  stage: string | null;
  lead_status: string | null;
  month_key: string | null;
  last_contact: string | null;
  created_at?: string | null;
  sms_opt_out: boolean | null;
  casper_enabled?: boolean | null;
  notes: string | null;
  conversation: {
    id: string;
    last_message_at: string | null;
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
  status: 'queued' | 'sent' | 'delivered' | 'failed' | 'received';
  sent_by: string;
  twilio_sid: string | null;
  error_message: string | null;
  created_at: string;
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

function getStatusStyleFrom(status: string | null | undefined, list: DBStatus[]) {
  if (!status) return { bg: '#f5f5f5', text: '#6b6b6b' };
  const found = list.find(s => s.name === status);
  return found ? { bg: found.bg_color, text: found.color } : { bg: '#f5f5f5', text: '#6b6b6b' };
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
  const [loadingListLeads, setLoadingListLeads] = useState(false);
  const [pickerAnchor, setPickerAnchor] = useState<{ top: number; left: number } | null>(null);
  const listPickerRef = useRef<HTMLDivElement>(null);
  const listPickerBtnRef = useRef<HTMLButtonElement>(null);

  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(initialLeadId);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loadingMsgs, setLoadingMsgs] = useState(false);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [dbStatuses, setDbStatuses] = useState<DBStatus[]>([]);
  const [composerText, setComposerText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [casperOn, setCasperOn] = useState(false);

  // Lead overlay — shows the pipeline lead workspace in a floating panel
  const [leadOverlayId, setLeadOverlayId] = useState<string | null>(null);
  const [showPipeline, setShowPipeline] = useState(false);

  const threadEndRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const selectedLead = leads.find(l => l.id === selectedLeadId) ?? null;
  const leadCasperOn = selectedLead
    ? casperEffectiveForLead(casperOn, selectedLead.casper_enabled)
    : false;
  const webphone = useWebPhone();
  const pathname = usePathname();
  const [dialerOpen, setDialerOpen] = useState(false);

  useEffect(() => {
    setDialerOpen(false);
  }, [pathname]);

  useEffect(() => {
    fetch('/api/settings/casper')
      .then(r => r.json())
      .then(d => setCasperOn(!!d.enabled))
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

  const loadLeads = useCallback(async () => {
    // A campaign list is open — don't overwrite it with the replies-only inbox
    if (activeListName && !debouncedSearch.trim()) return;
    try {
      const params = new URLSearchParams();
      if (initialLeadId) params.set('leadId', initialLeadId);
      if (debouncedSearch.trim()) params.set('q', debouncedSearch.trim());
      const qs = params.toString() ? `?${params}` : '';
      const res = await fetch(`/api/inbox/conversations${qs}`);
      if (!res.ok) {
        setLoadingLeads(false);
        return;
      }
      const data = await res.json();
      setLeads(data.leads ?? []);
      setPhoneConn(data.phoneConnection ?? null);
      if (data.dbError || data.setupRequired) setDbSetupRequired(true);
    } catch {
      // Network error — show nothing rather than crash
    } finally {
      setLoadingLeads(false);
    }
  }, [initialLeadId, debouncedSearch, activeListName]);

  useEffect(() => { loadLeads(); }, [loadLeads]);

  // ── Load messages on lead select ────────────────────────────────────────────
  const loadMessages = useCallback(async (leadId: string, opts?: { quiet?: boolean }) => {
    if (!opts?.quiet) {
      setLoadingMsgs(true);
      setMessages([]);
      setSendError(null);
    }
    try {
      const res = await fetch(`/api/inbox/messages?leadId=${leadId}`);
      if (!res.ok) return;
      const data = await res.json();
      setMessages(data.messages ?? []);
      setConversationId(data.conversationId ?? null);

      // Update unread in local state
      setLeads(prev => prev.map(l =>
        l.id === leadId && l.conversation
          ? { ...l, conversation: { ...l.conversation, unread_count: 0 } }
          : l
      ));
    } finally {
      if (!opts?.quiet) setLoadingMsgs(false);
    }
  }, []);

  useEffect(() => {
    if (selectedLeadId) loadMessages(selectedLeadId);
  }, [selectedLeadId, loadMessages]);

  // Replies arrive via Twilio webhook — poll so they show without a refresh.
  useEffect(() => {
    if (!selectedLeadId) return;
    const id = window.setInterval(() => { loadMessages(selectedLeadId, { quiet: true }); }, 4000);
    return () => window.clearInterval(id);
  }, [selectedLeadId, loadMessages]);

  // ── Scroll to bottom on new messages ───────────────────────────────────────
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [conversationId]);

  // ── Poll for lead list updates every 30s ───────────────────────────────────
  useEffect(() => {
    const id = setInterval(loadLeads, 30000);
    return () => clearInterval(id);
  }, [loadLeads]);

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
    setActiveListName(list.name);
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
        lead_status: l.lead_status ?? null,
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
        // Replace optimistic with real message
        setMessages(prev =>
          prev.map(m => m.id === optimistic.id ? { ...optimistic, ...data.message } : m)
        );
        // Update conversation preview in lead list
        const preview = body.length > 100 ? body.slice(0, 97) + '…' : body;
        setLeads(prev => prev.map(l =>
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
        ));

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

  const { chars, segments, encoding } = smsSegments(composerText);

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
              onClick={() => setShowPipeline(true)}
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
                  onClear={activeListName ? () => { setActiveListName(null); setShowListPicker(false); loadLeads(); } : undefined}
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
                          className="text-[10px] font-medium px-1.5 py-0.5 rounded max-w-[120px] truncate"
                          style={{
                            background: getStatusStyleFrom(lead.lead_status, dbStatuses).bg,
                            color: getStatusStyleFrom(lead.lead_status, dbStatuses).text,
                          }}
                        >
                          {lead.lead_status}
                        </span>
                      )}
                      {lead.sms_opt_out && (
                        <span className="text-[9px] text-red-500">OPT-OUT</span>
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
                    <span className="text-[10px] font-medium bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
                      SMS OPT-OUT
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#6b6b6b]">
                  {selectedLead.company && `${selectedLead.company} · `}
                  {fmt(selectedLead.phone)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex flex-col items-end gap-0.5">
                  <button
                    onClick={() => setLeadOverlayId(selectedLead.id)}
                    className="text-xs font-medium text-[#6b6b6b] hover:text-[#1a1a1a] transition-colors"
                  >
                    View Lead
                  </button>
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
                <button
                  type="button"
                  onClick={() => webphone.openDialPad(selectedLead.phone)}
                  className="focus:outline-none hover:opacity-70 transition-opacity"
                  title="Call"
                >
                  <img
                    src="/images/icons/phone-handset.png"
                    alt="Call"
                    width={14}
                    height={14}
                    className="w-[14px] h-[14px]"
                  />
                </button>
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
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-1">
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
                        const receipt = msg.status === 'queued' && msg.twilio_sid ? 'sent' : msg.status;
                        return (
                        <div
                          key={msg.id}
                          className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div className={`max-w-[72%] ${msg.direction === 'outbound' ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
                            <div
                              className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                                msg.direction === 'outbound'
                                  ? 'bg-blue-500 text-white rounded-br-sm'
                                  : 'bg-[#f0f0f0] text-[#1a1a1a] rounded-bl-sm'
                              } ${receipt === 'failed' ? 'opacity-60' : ''}`}
                            >
                              {msg.body}
                            </div>
                            <div className={`flex items-center gap-1.5 px-1 ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                              <span className="text-[10px] text-gray-400">{msgTime(msg.created_at)}</span>
                              {msg.direction === 'outbound' && (
                                <>
                                  {receipt === 'queued' && <span className="text-[10px] text-gray-300">sending…</span>}
                                  {receipt === 'sent' && <span className="text-[10px] text-gray-400">✓ sent</span>}
                                  {receipt === 'delivered' && <span className="text-[10px] text-blue-400">✓✓ delivered</span>}
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
              <div ref={threadEndRef} />
            </div>

            {/* Composer */}
            <div className="px-4 py-3 border-t border-[#e5e5e5] bg-white flex-shrink-0">
              {sendError && (
                <p className="text-xs text-amber-600 mb-1.5 px-1">⚠ {sendError}</p>
              )}
              <div className="flex items-end gap-2">
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
          onClick={() => setShowPipeline(false)}
        />
        <div
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[81] flex flex-col rounded-xl shadow-2xl overflow-hidden"
          style={{ width: 'min(88vw, 920px)', height: 'min(78vh, 680px)' }}
        >
          <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-[#e5e5e5] flex-shrink-0">
            <span className="text-xs text-[#6b6b6b] font-medium">Pipeline</span>
            <div className="flex items-center gap-3">
              <a
                href="/pipeline"
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
                onClick={() => setShowPipeline(false)}
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
            src="/pipeline?modal=1"
            className="flex-1 w-full bg-white border-0"
            title="Pipeline"
          />
        </div>
      </>
    )}

    {/* ── Lead Overlay ─────────────────────────────────────────────────────── */}
    {leadOverlayId && (
      <>
        {/* Backdrop — click to close */}
        <div
          className="fixed inset-0 bg-black/40 z-[80]"
          onClick={() => setLeadOverlayId(null)}
        />
        {/* Panel */}
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[81] flex flex-col"
          style={{ width: 'min(92vw, 1200px)', height: 'calc(100vh - 2rem)' }}
        >
          {/* Header bar */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-[#e5e5e5] rounded-t-xl flex-shrink-0">
            <span className="text-xs text-[#6b6b6b] font-medium">Lead Info</span>
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
                onClick={() => setLeadOverlayId(null)}
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
            src={`/pipeline/${leadOverlayId}?modal=1`}
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

