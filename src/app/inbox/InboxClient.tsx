'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LeadList {
  id: string;
  name: string;
  folder_name: string | null;
  parent_list_id: string | null;
}

interface InboxLead {
  id: string;
  name: string;
  company: string | null;
  phone: string;
  stage: string | null;
  month_key: string | null;
  last_contact: string | null;
  sms_opt_out: boolean | null;
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

const STAGE_COLORS: Record<string, string> = {
  'new lead': 'bg-gray-100 text-gray-600',
  'contacted': 'bg-blue-50 text-blue-700',
  'active': 'bg-teal-50 text-teal-700',
  'documents requested': 'bg-yellow-50 text-yellow-700',
  'under review': 'bg-purple-50 text-purple-700',
  'offers/follow up': 'bg-orange-50 text-orange-700',
  'funded': 'bg-green-50 text-green-700',
  'lost': 'bg-red-50 text-red-700',
  'declined': 'bg-red-50 text-red-600',
  'drip': 'bg-gray-100 text-gray-500',
};

function stageColor(stage: string | null) {
  if (!stage) return 'bg-gray-100 text-gray-500';
  return STAGE_COLORS[stage.toLowerCase()] ?? 'bg-gray-100 text-gray-600';
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
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [composerText, setComposerText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [suggestingReply, setSuggestingReply] = useState(false);
  const [suggestSent, setSuggestSent] = useState(false);

  const threadEndRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const selectedLead = leads.find(l => l.id === selectedLeadId) ?? null;

  // ── Load lead list ──────────────────────────────────────────────────────────
  const loadLeads = useCallback(async () => {
    try {
      const res = await fetch('/api/inbox/conversations');
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
  }, []);

  useEffect(() => { loadLeads(); }, [loadLeads]);

  // ── Load messages on lead select ────────────────────────────────────────────
  const loadMessages = useCallback(async (leadId: string) => {
    setLoadingMsgs(true);
    setMessages([]);
    setSendError(null);
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
      setLoadingMsgs(false);
    }
  }, []);

  useEffect(() => {
    if (selectedLeadId) loadMessages(selectedLeadId);
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
          folder_name: l.folder_name ?? null,
          parent_list_id: l.parent_list_id ?? null,
        }));
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
        stage: null,
        month_key: null,
        last_contact: l.last_contact ?? null,
        sms_opt_out: l.sms_opt_out ?? false,
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

  // ── Filtered lead list ──────────────────────────────────────────────────────
  const filteredLeads = leads.filter(l => {
    if (filter === 'unread' && !l.conversation?.unread_count) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        l.name?.toLowerCase().includes(q) ||
        l.company?.toLowerCase().includes(q) ||
        l.phone?.includes(q)
      );
    }
    return true;
  });

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
  const totalUnread = leads.reduce((s, l) => s + (l.conversation?.unread_count ?? 0), 0);

  // ─────────────────────────────────────────────────────────────────────────────
  return (
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
      <div className="w-72 flex-shrink-0 flex flex-col border-r border-[#e5e5e5] bg-white overflow-hidden">
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-[#e5e5e5]">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-base font-semibold text-[#1a1a1a]">
              Inbox
              {totalUnread > 0 && (
                <span className="ml-2 inline-flex items-center justify-center w-5 h-5 bg-blue-500 text-white rounded-full text-[10px] font-bold">
                  {totalUnread > 99 ? '99+' : totalUnread}
                </span>
              )}
            </h1>
          </div>

          {/* Search */}
          <div className="relative mb-2">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search leads..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm bg-[#f5f5f5] border border-[#e5e5e5] rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-300"
            />
          </div>

          {/* Filter chips + list picker */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {(['all', 'unread'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  filter === f
                    ? 'bg-[#1a1a1a] text-white'
                    : 'bg-[#f0f0f0] text-[#6b6b6b] hover:bg-[#e5e5e5]'
                }`}
              >
                {f === 'all' ? 'All' : 'Unread'}
              </button>
            ))}

            {/* Load from list button */}
            <div className="relative ml-auto" ref={listPickerRef}>
              <button
                ref={listPickerBtnRef}
                onClick={openListPicker}
                title="Load leads from a contact list"
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors border ${
                  activeListName
                    ? 'bg-blue-50 border-blue-200 text-blue-700'
                    : 'bg-[#f0f0f0] border-transparent text-[#6b6b6b] hover:bg-[#e5e5e5]'
                }`}
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                {activeListName ? (
                  <span className="max-w-[80px] truncate">{activeListName}</span>
                ) : 'Lists'}
              </button>
            </div>

            {/* Folder tree dropdown — fixed so it escapes overflow:hidden */}
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

            {/* Loading indicator when fetching list leads */}
            {loadingListLeads && (
              <span className="text-[10px] text-gray-400 animate-pulse">Loading…</span>
            )}
          </div>
        </div>

        {/* Lead list */}
        <div className="flex-1 overflow-y-auto">
          {loadingLeads ? (
            <div className="flex items-center justify-center py-12 text-sm text-gray-400">Loading…</div>
          ) : filteredLeads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <p className="text-sm text-gray-400">
                {search ? 'No leads match your search' : 'No leads with phone numbers'}
              </p>
            </div>
          ) : (
            filteredLeads.map(lead => {
              const isSelected = lead.id === selectedLeadId;
              const unread = lead.conversation?.unread_count ?? 0;
              return (
                <button
                  key={lead.id}
                  onClick={() => setSelectedLeadId(lead.id)}
                  className={`w-full text-left px-4 py-3 border-b border-[#f0f0f0] transition-colors ${
                    isSelected ? 'bg-[#f0f0f0]' : 'hover:bg-[#fafafa]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {unread > 0 && (
                          <span className="flex-shrink-0 w-2 h-2 rounded-full bg-blue-500" />
                        )}
                        <p className={`text-sm truncate ${unread > 0 ? 'font-semibold text-[#1a1a1a]' : 'font-medium text-[#1a1a1a]'}`}>
                          {lead.company || lead.name}
                        </p>
                      </div>
                      <p className="text-xs text-[#6b6b6b] truncate mt-0.5">
                        {lead.company ? lead.name : fmt(lead.phone)}
                      </p>
                      {lead.conversation?.last_message_preview && (
                        <p className="text-xs text-gray-400 truncate mt-0.5">
                          {lead.conversation.last_direction === 'outbound' && '↗ '}
                          {lead.conversation.last_message_preview}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className="text-[10px] text-gray-400">
                        {relativeTime(lead.conversation?.last_message_at ?? lead.last_contact)}
                      </span>
                      {lead.stage && (
                        <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded uppercase tracking-wide ${stageColor(lead.stage)}`}>
                          {lead.stage.length > 8 ? lead.stage.slice(0, 8) + '…' : lead.stage}
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
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
            <svg className="w-16 h-16 text-gray-200 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p className="text-gray-400 font-medium">Pick a lead to text</p>
            <p className="text-gray-300 text-sm mt-1">Select a contact from the left panel</p>
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
              <div className="flex items-center gap-2">
                {/* Call button */}
                <a
                  href={`tel:${selectedLead.phone}`}
                  className="p-2 rounded-lg border border-[#e5e5e5] hover:bg-[#f5f5f5] transition-colors text-[#1a1a1a]"
                  title="Call"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </a>
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
                      {group.msgs.map(msg => (
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
                              } ${msg.status === 'failed' ? 'opacity-60' : ''}`}
                            >
                              {msg.body}
                            </div>
                            <div className={`flex items-center gap-1.5 px-1 ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                              <span className="text-[10px] text-gray-400">{msgTime(msg.created_at)}</span>
                              {msg.direction === 'outbound' && (
                                <>
                                  {msg.status === 'queued' && <span className="text-[10px] text-gray-300">◷ queued</span>}
                                  {msg.status === 'sent' && <span className="text-[10px] text-gray-400">✓ sent</span>}
                                  {msg.status === 'delivered' && <span className="text-[10px] text-blue-400">✓✓ delivered</span>}
                                  {msg.status === 'failed' && (
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
                      ))}
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
      <div className="w-72 flex-shrink-0 flex flex-col border-l border-[#e5e5e5] bg-[#fafafa] overflow-hidden">
        {!selectedLead ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <p className="text-xs text-gray-400 text-center">Select a lead to see their details</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Lead identity */}
            <div>
              <div className="flex items-start justify-between gap-2 mb-1">
                <div>
                  <h3 className="font-semibold text-[#1a1a1a] text-sm leading-tight">
                    {selectedLead.company || selectedLead.name}
                  </h3>
                  {selectedLead.company && (
                    <p className="text-xs text-[#6b6b6b] mt-0.5">{selectedLead.name}</p>
                  )}
                </div>
                {selectedLead.stage && (
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded uppercase tracking-wide flex-shrink-0 ${stageColor(selectedLead.stage)}`}>
                    {selectedLead.stage}
                  </span>
                )}
              </div>
              <a
                href={`tel:${selectedLead.phone}`}
                className="text-xs text-blue-600 hover:underline"
              >
                {fmt(selectedLead.phone)}
              </a>
            </div>

            {/* Quick actions */}
            <div className="grid grid-cols-2 gap-1.5">
              <a
                href={`/dashboard?highlight=${selectedLead.id}`}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#e5e5e5] bg-white hover:bg-[#f5f5f5] transition-colors text-xs text-[#1a1a1a] font-medium"
              >
                <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                View Lead
              </a>
              <a
                href={`/leads?list=${selectedLead.month_key}`}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#e5e5e5] bg-white hover:bg-[#f5f5f5] transition-colors text-xs text-[#1a1a1a] font-medium"
              >
                <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                Dashboard
              </a>
            </div>

            <div className="border-t border-[#e5e5e5]" />

            {/* Notes */}
            {selectedLead.notes && (
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Notes</p>
                <p className="text-xs text-[#1a1a1a] leading-relaxed bg-white border border-[#e5e5e5] rounded-lg px-3 py-2 whitespace-pre-wrap">
                  {selectedLead.notes}
                </p>
              </div>
            )}

            {/* Last contact */}
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Last Contact</p>
              <p className="text-xs text-[#1a1a1a]">
                {selectedLead.last_contact
                  ? new Date(selectedLead.last_contact).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: '2-digit',
                      hour: 'numeric', minute: '2-digit',
                    })
                  : '—'}
              </p>
            </div>

            {/* Conversation stats */}
            {selectedLead.conversation && (
              <>
                <div className="border-t border-[#e5e5e5]" />
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Thread</p>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#6b6b6b]">Messages</span>
                      <span className="font-medium text-[#1a1a1a]">{messages.length}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#6b6b6b]">Last activity</span>
                      <span className="font-medium text-[#1a1a1a]">
                        {relativeTime(selectedLead.conversation.last_message_at)}
                      </span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Opt-out toggle */}
            <div className="border-t border-[#e5e5e5]" />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-[#1a1a1a]">SMS Opt-out</p>
                <p className="text-[10px] text-gray-400">Stops all outbound texts</p>
              </div>
              <OptOutToggle lead={selectedLead} onToggle={(val) => {
                setLeads(prev => prev.map(l => l.id === selectedLead.id ? { ...l, sms_opt_out: val } : l));
              }} />
            </div>

            {/* Casper AI — Suggest reply */}
            <div className="border-t border-[#e5e5e5]" />
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                Casper AI
              </p>
              {suggestSent ? (
                <div className="w-full px-3 py-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg text-center">
                  ✓ Card added to Agent tab
                </div>
              ) : (
                <button
                  disabled={suggestingReply || !selectedLead}
                  onClick={async () => {
                    if (!selectedLead) return;
                    setSuggestingReply(true);
                    try {
                      await fetch('/api/agent/suggest-reply', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          lead_id: selectedLead.id,
                          conversation_id: selectedLead.conversation?.id ?? null,
                          lead_name: selectedLead.name,
                          company: selectedLead.company ?? null,
                        }),
                      });
                      setSuggestSent(true);
                      setTimeout(() => setSuggestSent(false), 4000);
                    } finally {
                      setSuggestingReply(false);
                    }
                  }}
                  className="w-full px-3 py-2 text-xs text-gray-600 border border-dashed border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {suggestingReply ? 'Drafting…' : '✨ Suggest reply → Agent'}
                </button>
              )}
            </div>
          </div>
        )}

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
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());
  const [openParents, setOpenParents] = useState<Set<string>>(new Set());
  const ref = useRef<HTMLDivElement>(null);

  const toggleFolder = (name: string) =>
    setOpenFolders(prev => { const s = new Set(prev); s.has(name) ? s.delete(name) : s.add(name); return s; });

  const toggleParent = (id: string) =>
    setOpenParents(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  // Close on outside click
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
    left: anchor.left,
    zIndex: 9999,
    width: 280,
  };

  if (loading) {
    return (
      <div ref={ref} style={style} className="bg-white border border-[#e5e5e5] rounded-xl shadow-xl p-4">
        <p className="text-xs text-gray-400 text-center">Loading lists…</p>
      </div>
    );
  }

  if (!data || data.lists.length === 0) {
    return (
      <div ref={ref} style={style} className="bg-white border border-[#e5e5e5] rounded-xl shadow-xl p-4">
        <p className="text-xs text-gray-400 text-center">No contact lists found</p>
      </div>
    );
  }

  // Build folder → top-level lists → sub-lists hierarchy
  const topLevel = data.lists.filter(l => !l.parent_list_id);
  const subsByParent: Record<string, LeadList[]> = {};
  for (const l of data.lists) {
    if (l.parent_list_id) {
      if (!subsByParent[l.parent_list_id]) subsByParent[l.parent_list_id] = [];
      subsByParent[l.parent_list_id].push(l);
    }
  }

  // Group top-level by folder_name
  const folderMap: Record<string, LeadList[]> = {};
  const standalone: LeadList[] = [];
  for (const l of topLevel) {
    if (l.folder_name) {
      if (!folderMap[l.folder_name]) folderMap[l.folder_name] = [];
      folderMap[l.folder_name].push(l);
    } else {
      standalone.push(l);
    }
  }

  const count = (id: string) => data.countMap[id] ?? 0;

  const ListRow = ({ list, indent = 0 }: { list: LeadList; indent?: number }) => {
    const subs = subsByParent[list.id] ?? [];
    const hasSubs = subs.length > 0;
    const isOpen = openParents.has(list.id);
    const c = count(list.id);

    return (
      <div>
        <div
          className="flex items-center gap-1.5 w-full text-left hover:bg-[#f5f5f5] rounded-lg transition-colors"
          style={{ paddingLeft: `${8 + indent * 12}px`, paddingRight: 8, paddingTop: 5, paddingBottom: 5 }}
        >
          {hasSubs ? (
            <button
              onClick={(e) => { e.stopPropagation(); toggleParent(list.id); }}
              className="flex-shrink-0 text-gray-400 hover:text-gray-600"
            >
              <svg className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ) : (
            <span className="w-3 flex-shrink-0" />
          )}
          <button
            onClick={() => onSelect(list)}
            className="flex-1 flex items-center justify-between gap-2 text-left"
          >
            <span className="text-xs text-[#1a1a1a] truncate">{list.name}</span>
            {c > 0 && (
              <span className="text-[10px] text-gray-400 flex-shrink-0">{c} w/ phone</span>
            )}
          </button>
        </div>
        {hasSubs && isOpen && (
          <div>
            {subs.map(sub => (
              <ListRow key={sub.id} list={sub} indent={indent + 1} />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div ref={ref} style={style} className="bg-white border border-[#e5e5e5] rounded-xl shadow-xl overflow-hidden">
      <div className="max-h-80 overflow-y-auto p-2">
        {/* Clear / back to CRM option */}
        {onClear && (
          <button
            onClick={onClear}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors mb-1"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to CRM leads
          </button>
        )}

        {/* Folders */}
        {Object.entries(folderMap).map(([folderName, lists]) => {
          const isOpen = openFolders.has(folderName);
          return (
            <div key={folderName} className="mb-0.5">
              <button
                onClick={() => toggleFolder(folderName)}
                className="w-full flex items-center gap-2 px-2 py-2 text-left hover:bg-[#f5f5f5] rounded-lg transition-colors"
              >
                <svg className={`w-3 h-3 text-gray-400 flex-shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <svg className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                </svg>
                <span className="text-xs font-semibold text-[#1a1a1a] flex-1 truncate">{folderName}</span>
                <span className="text-[10px] text-gray-400 flex-shrink-0">{lists.length}</span>
              </button>
              {isOpen && (
                <div className="ml-2">
                  {lists.map(list => <ListRow key={list.id} list={list} indent={0} />)}
                </div>
              )}
            </div>
          );
        })}

        {/* Standalone (no folder) */}
        {standalone.map(list => <ListRow key={list.id} list={list} indent={0} />)}

        {Object.keys(folderMap).length === 0 && standalone.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-3">No lists yet</p>
        )}
      </div>
    </div>
  );
}

// ── Opt-out toggle ─────────────────────────────────────────────────────────────

function OptOutToggle({
  lead,
  onToggle,
}: {
  lead: InboxLead;
  onToggle: (val: boolean) => void;
}) {
  const [loading, setLoading] = useState(false);
  const current = lead.sms_opt_out ?? false;

  const toggle = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/leads/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id, field: 'sms_opt_out', value: !current }),
      });
      if (res.ok) onToggle(!current);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
        current ? 'bg-red-400' : 'bg-gray-200'
      } disabled:opacity-60`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
          current ? 'translate-x-4' : 'translate-x-1'
        }`}
      />
    </button>
  );
}
