'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────

type CardType =
  | 'suggest_reply'
  | 'follow_up'
  | 'hot_lead'
  | 'stage_move'
  | 'campaign_reply'
  | 'schedule_followup'
  | 'stalled';

type CardStatus = 'pending' | 'approved' | 'snoozed' | 'dismissed' | 'sent' | 'paused';

interface AgentDecision {
  id: string;
  lead_id: string | null;
  lead_name: string;
  company: string | null;
  type: CardType;
  status: CardStatus;
  priority: 'urgent' | 'normal' | 'low';
  proposal: string;
  draft_content: string | null;
  draft_type: 'sms' | 'email' | null;
  conversation_id: string | null;
  metadata: Record<string, unknown>;
  snooze_until: string | null;
  created_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function cardIcon(type: CardType, priority: string) {
  if (priority === 'urgent' && type === 'hot_lead') return '⚡';
  if (type === 'hot_lead') return '🔥';
  if (type === 'suggest_reply' || type === 'campaign_reply') return '💬';
  if (type === 'follow_up' || type === 'schedule_followup') return '📅';
  if (type === 'stalled') return '🤫';
  if (type === 'stage_move') return '↗';
  return '·';
}

function GostwrkLogo({ size = 28, invert = false }: { size?: number; invert?: boolean }) {
  return (
    <img
      src="/images/logo/gostwrk-logo-gray.svg"
      alt="Gostwrk"
      width={size}
      height={size}
      style={{ width: size, height: size, filter: invert ? 'invert(1)' : undefined }}
      className="object-contain flex-shrink-0"
    />
  );
}

function cardLabel(type: CardType) {
  if (type === 'hot_lead') return 'HOT LEAD';
  if (type === 'suggest_reply') return 'REPLY DRAFTED';
  if (type === 'campaign_reply') return 'CAMPAIGN REPLY';
  if (type === 'follow_up') return 'OVERDUE FOLLOW-UP';
  if (type === 'schedule_followup') return 'SCHEDULE FOLLOW-UP';
  if (type === 'stalled') return 'GONE QUIET';
  if (type === 'stage_move') return 'STAGE MOVE';
  return 'ACTION';
}

function cardBadgeColor(type: CardType, priority: string) {
  if (priority === 'urgent') return 'bg-red-100 text-red-700';
  if (type === 'hot_lead') return 'bg-orange-100 text-orange-700';
  if (type === 'suggest_reply' || type === 'campaign_reply') return 'bg-blue-100 text-blue-700';
  if (type === 'follow_up' || type === 'schedule_followup') return 'bg-purple-100 text-purple-700';
  if (type === 'stalled') return 'bg-gray-100 text-gray-600';
  return 'bg-gray-100 text-gray-600';
}

// ─── ActionCard ───────────────────────────────────────────────────────────────

function ActionCard({
  decision,
  onAction,
}: {
  decision: AgentDecision;
  onAction: (id: string, action: 'approve' | 'snooze' | 'dismiss' | 'edit', draft?: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(decision.draft_content || '');
  const [expanded, setExpanded] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const act = async (action: 'approve' | 'snooze' | 'dismiss') => {
    setActing(action);
    await onAction(decision.id, action, editing ? draft : undefined);
    setActing(null);
  };

  const generateDraft = async () => {
    if (!decision.lead_id && !decision.conversation_id) return;
    setGeneratingDraft(true);
    try {
      const res = await fetch('/api/agent/suggest-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id: decision.lead_id,
          conversation_id: decision.conversation_id,
          lead_name: decision.lead_name,
          company: decision.company,
        }),
      });
      const json = await res.json();
      if (json.draft) {
        setDraft(json.draft);
        setEditing(true);
        setTimeout(() => textareaRef.current?.focus(), 50);
      }
    } finally {
      setGeneratingDraft(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-[#e8e8e8] shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      {/* Card header */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lg leading-none">{cardIcon(decision.type, decision.priority)}</span>
            <span className={`text-[10px] font-bold tracking-widest px-2 py-0.5 rounded-full ${cardBadgeColor(decision.type, decision.priority)}`}>
              {cardLabel(decision.type)}
            </span>
            {decision.draft_type && (
              <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide border border-gray-200 px-2 py-0.5 rounded-full">
                {decision.draft_type}
              </span>
            )}
          </div>
          <span className="text-xs text-gray-400 flex-shrink-0 mt-0.5">{timeAgo(decision.created_at)}</span>
        </div>

        {/* Lead chip */}
        <div className="mb-2">
          <span className="inline-block text-sm font-bold text-[#1a1a1a] bg-[#f4f4f4] px-3 py-1 rounded-full">
            {decision.lead_name}
            {decision.company && (
              <span className="font-normal text-gray-500"> · {decision.company}</span>
            )}
          </span>
        </div>

        {/* Proposal */}
        <p className="text-[15px] text-gray-700 leading-relaxed">{decision.proposal}</p>
      </div>

      {/* Draft box */}
      {(draft || decision.draft_content) && (
        <div className="mx-5 mb-4">
          {editing ? (
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              className="w-full text-sm text-gray-800 bg-[#f9fafb] border border-[#d1d5db] rounded-xl px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          ) : (
            <div
              className="text-sm text-gray-600 bg-[#f9fafb] border border-[#e5e7eb] rounded-xl px-4 py-3 leading-relaxed cursor-pointer hover:border-gray-300 transition-colors"
              onClick={() => { setEditing(true); setTimeout(() => textareaRef.current?.focus(), 50); }}
              title="Click to edit"
            >
              {draft || decision.draft_content}
              <span className="ml-2 text-xs text-gray-400">(click to edit)</span>
            </div>
          )}
        </div>
      )}

      {/* If no draft yet but type needs one */}
      {!draft && !decision.draft_content && decision.draft_type && (
        <div className="mx-5 mb-4">
          <button
            onClick={generateDraft}
            disabled={generatingDraft}
            className="w-full text-sm text-blue-600 border border-dashed border-blue-300 rounded-xl px-4 py-3 hover:bg-blue-50 transition-colors disabled:opacity-60"
          >
            {generatingDraft ? 'Drafting…' : '✨ Generate AI draft'}
          </button>
        </div>
      )}

      {/* Action buttons */}
      <div className="px-5 pb-5 flex items-center gap-2 flex-wrap">
        <button
          onClick={() => act('approve')}
          disabled={!!acting}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#16a34a] text-white text-sm font-semibold rounded-xl hover:bg-[#15803d] transition-colors disabled:opacity-60 flex-shrink-0"
        >
          {acting === 'approve' ? (
            <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          )}
          {decision.draft_type === 'sms' ? 'Send' : 'Approve'}
        </button>

        {decision.draft_content || draft ? (
          <button
            onClick={() => { setEditing(!editing); if (!editing) setTimeout(() => textareaRef.current?.focus(), 50); }}
            className="flex items-center gap-1.5 px-4 py-2 bg-white text-gray-700 text-sm font-semibold rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors flex-shrink-0"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            {editing ? 'Done' : 'Edit'}
          </button>
        ) : null}

        <button
          onClick={() => act('snooze')}
          disabled={!!acting}
          className="px-4 py-2 bg-amber-50 text-amber-700 text-sm font-semibold rounded-xl border border-amber-200 hover:bg-amber-100 transition-colors disabled:opacity-60 flex-shrink-0"
        >
          1h
        </button>

        <button
          onClick={() => act('dismiss')}
          disabled={!!acting}
          className="px-4 py-2 text-gray-400 text-sm font-semibold rounded-xl border border-gray-100 hover:bg-gray-50 hover:text-gray-600 transition-colors disabled:opacity-60 flex-shrink-0"
        >
          No
        </button>

        {/* Show conversation link */}
        {(decision.conversation_id || decision.lead_id) && (
          <Link
            href={`/inbox${decision.lead_id ? `?lead=${decision.lead_id}` : ''}`}
            className="ml-auto text-xs text-gray-400 hover:text-blue-600 transition-colors flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            Thread
          </Link>
        )}
      </div>

      {/* Expand conversation toggle (future) */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-xs text-gray-400 hover:text-gray-600 py-2 border-t border-[#f0f0f0] flex items-center justify-center gap-1 transition-colors"
      >
        <svg className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
        {expanded ? 'Hide context' : 'Show context'}
      </button>

      {expanded && (
        <div className="px-5 pb-4 pt-2 bg-[#fafafa] border-t border-[#f0f0f0]">
          <p className="text-xs text-gray-400 italic">
            {decision.metadata && Object.keys(decision.metadata).length > 0
              ? Object.entries(decision.metadata)
                  .filter(([k]) => !['send_result'].includes(k))
                  .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)
                  .join(' · ')
              : 'No additional context.'}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Briefing modal ───────────────────────────────────────────────────────────

function BriefingPanel({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <div className="bg-[#0f0f0f] rounded-2xl p-6 mb-6 relative border border-[#2a2a2a]">
      <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-gray-300 text-lg leading-none">×</button>
      <div className="flex items-center gap-2 mb-3">
        <GostwrkLogo size={20} invert />
        <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Casper</span>
      </div>
      <pre className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed font-sans">{text}</pre>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ onSeed, seeding }: { onSeed: () => void; seeding: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center px-8">
      <div className="mb-5 opacity-30">
        <GostwrkLogo size={56} />
      </div>
      <h3 className="text-lg font-bold text-[#1a1a1a] mb-2">Queue is clear</h3>
      <p className="text-gray-500 text-sm leading-relaxed mb-6 max-w-xs">
        No pending decisions right now. I'll surface hot leads, stalled deals, and replies as they come in.
      </p>
      <button
        onClick={onSeed}
        disabled={seeding}
        className="px-5 py-2.5 bg-[#1a1a1a] text-white text-sm font-semibold rounded-xl hover:bg-[#333] transition-colors disabled:opacity-60"
      >
        {seeding ? 'Scanning CRM…' : 'Scan CRM for pending decisions'}
      </button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const FILTER_LABELS: Record<string, string> = {
  all: 'All',
  urgent: 'Urgent',
  replies: 'Replies',
  hot: 'Hot',
  followups: 'Follow-ups',
  stalled: 'Quiet',
};

export default function AgentClient() {
  const [decisions, setDecisions] = useState<AgentDecision[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [filter, setFilter] = useState('all');
  const [askText, setAskText] = useState('');
  const [askLoading, setAskLoading] = useState(false);
  const [briefing, setBriefing] = useState<string | null>(null);
  const askRef = useRef<HTMLTextAreaElement>(null);

  // ── Load decisions ─────────────────────────────────────────────────────────
  const loadDecisions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/agent/decisions');
      const json = await res.json();
      setDecisions(json.decisions || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDecisions(); }, [loadDecisions]);

  // ── Seed CRM → cards ───────────────────────────────────────────────────────
  const seedDecisions = async () => {
    setSeeding(true);
    try {
      await fetch('/api/agent/seed', { method: 'POST' });
      await loadDecisions();
    } finally {
      setSeeding(false);
    }
  };

  // ── Handle card actions ───────────────────────────────────────────────────
  const handleAction = useCallback(async (
    id: string,
    action: 'approve' | 'snooze' | 'dismiss' | 'edit',
    draft?: string
  ) => {
    const res = await fetch(`/api/agent/decisions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, draft }),
    });
    if (res.ok) {
      if (action !== 'edit') {
        // Remove from feed immediately
        setDecisions((prev) => prev.filter((d) => d.id !== id));
      }
    }
  }, []);

  // ── Ask agent ─────────────────────────────────────────────────────────────
  const handleAsk = async () => {
    const q = askText.trim();
    setAskLoading(true);
    setBriefing(null);
    try {
      const res = await fetch('/api/agent/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      });
      const json = await res.json();
      if (json.briefing) setBriefing(json.briefing);
      if (json.decisions?.length > 0) {
        setDecisions(json.decisions);
        setFilter('all');
      }
    } finally {
      setAskLoading(false);
      setAskText('');
    }
  };

  // ── Derived counts ────────────────────────────────────────────────────────
  const pending = decisions.filter((d) => d.status === 'pending');
  const counts = {
    all: pending.length,
    urgent: pending.filter((d) => d.priority === 'urgent').length,
    replies: pending.filter((d) => ['suggest_reply', 'campaign_reply'].includes(d.type)).length,
    hot: pending.filter((d) => d.type === 'hot_lead').length,
    followups: pending.filter((d) => ['follow_up', 'schedule_followup'].includes(d.type)).length,
    stalled: pending.filter((d) => ['stalled', 'stage_move'].includes(d.type)).length,
  };

  const filtered = (() => {
    switch (filter) {
      case 'urgent': return pending.filter((d) => d.priority === 'urgent');
      case 'replies': return pending.filter((d) => ['suggest_reply', 'campaign_reply'].includes(d.type));
      case 'hot': return pending.filter((d) => d.type === 'hot_lead');
      case 'followups': return pending.filter((d) => ['follow_up', 'schedule_followup'].includes(d.type));
      case 'stalled': return pending.filter((d) => ['stalled', 'stage_move'].includes(d.type));
      default: return pending;
    }
  })();

  // ── Left rail leads (deduplicated from pending) ───────────────────────────
  const railLeads = Array.from(
    new Map(pending.map((d) => [d.lead_id || d.lead_name, d])).values()
  ).slice(0, 20);

  return (
    <div className="flex" style={{ height: 'calc(100vh - 80px)' }}>

      {/* ── LEFT RAIL ─────────────────────────────────────────────────────── */}
      <div className="w-64 flex-shrink-0 border-r border-[#e5e5e5] bg-white flex flex-col overflow-hidden">
        {/* Rail header */}
        <div className="px-4 pt-5 pb-3 border-b border-[#f0f0f0]">
          <div className="flex items-center gap-2 mb-1">
            <GostwrkLogo size={18} />
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Casper</span>
          </div>
          <p className="text-xs text-gray-400">
            {pending.length === 0 ? 'Queue clear' : `${pending.length} decision${pending.length !== 1 ? 's' : ''} waiting`}
          </p>
        </div>

        {/* Filters */}
        <div className="px-3 py-3 space-y-0.5">
          {(Object.keys(FILTER_LABELS) as string[]).map((key) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-sm transition-colors ${
                filter === key
                  ? 'bg-[#1a1a1a] text-white font-medium'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span>{FILTER_LABELS[key]}</span>
              {counts[key as keyof typeof counts] > 0 && (
                <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full min-w-[20px] text-center ${
                  filter === key ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
                }`}>
                  {counts[key as keyof typeof counts]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Lead list */}
        {railLeads.length > 0 && (
          <div className="flex-1 overflow-y-auto px-3 py-2 border-t border-[#f0f0f0]">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2 px-1">Leads</p>
            {railLeads.map((d) => {
              const count = pending.filter((x) => (x.lead_id || x.lead_name) === (d.lead_id || d.lead_name)).length;
              return (
                <button
                  key={d.lead_id || d.lead_name}
                  onClick={() => {
                    setFilter('all');
                    // scroll to first card for this lead — handled by the main feed filter
                  }}
                  className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-gray-50 text-left transition-colors"
                >
                  <div className="w-7 h-7 rounded-full bg-[#f0f0f0] flex-shrink-0 flex items-center justify-center text-xs font-bold text-gray-500">
                    {(d.lead_name || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-[#1a1a1a] truncate">{d.lead_name}</p>
                    {d.company && <p className="text-[10px] text-gray-400 truncate">{d.company}</p>}
                  </div>
                  {count > 1 && (
                    <span className="text-[10px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">{count}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Quick actions */}
        <div className="p-3 border-t border-[#f0f0f0]">
          <button
            onClick={seedDecisions}
            disabled={seeding}
            className="w-full py-2 text-xs font-medium text-gray-500 border border-dashed border-gray-200 rounded-xl hover:border-gray-400 hover:text-gray-700 transition-colors disabled:opacity-50"
          >
            {seeding ? 'Scanning…' : '↺ Refresh from CRM'}
          </button>
        </div>
      </div>

      {/* ── MAIN FEED ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-[#f7f7f7]">

        {/* Agent header */}
        <div className="bg-[#0f0f0f] px-8 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center">
              <GostwrkLogo size={22} invert />
            </div>
            <div>
                      <p className="text-white font-bold text-base leading-none">Casper</p>
              <p className="text-gray-400 text-xs mt-0.5">Gostwrk co-pilot · SMS-first</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {pending.length > 0 && (
              <span className="text-xs text-gray-400">
                <span className="text-white font-semibold">{pending.length}</span> pending
              </span>
            )}
            <Link
              href="/inbox"
              className="text-xs text-gray-400 hover:text-white transition-colors flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              Open Inbox
            </Link>
          </div>
        </div>

        {/* Scrollable feed */}
        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-4">

          {/* Briefing from "Ask" */}
          {briefing && <BriefingPanel text={briefing} onClose={() => setBriefing(null)} />}

          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3">
              <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin" />
              <p className="text-sm text-gray-400">Loading queue…</p>
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState onSeed={seedDecisions} seeding={seeding} />
          ) : (
            <>
              {/* Filter label */}
              {filter !== 'all' && (
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {FILTER_LABELS[filter]} · {filtered.length}
                  </p>
                  <button onClick={() => setFilter('all')} className="text-xs text-gray-400 hover:text-gray-600">
                    Clear filter
                  </button>
                </div>
              )}
              {filtered.map((d) => (
                <ActionCard key={d.id} decision={d} onAction={handleAction} />
              ))}
            </>
          )}
        </div>

        {/* ── ASK COMPOSER (sticky bottom) ─────────────────────────────── */}
        <div className="flex-shrink-0 border-t border-[#e5e5e5] bg-white px-8 py-4">
          <div className="flex items-end gap-3">
            <div className="flex-1 relative">
              <textarea
                ref={askRef}
                value={askText}
                onChange={(e) => setAskText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (askText.trim()) handleAsk();
                  }
                }}
                rows={1}
                placeholder='Ask Casper — "what needs me right now", "who went quiet", "hot leads"…'
                className="w-full px-4 py-3 pr-12 text-sm bg-[#f4f4f4] border border-[#e5e5e5] rounded-2xl resize-none focus:outline-none focus:ring-2 focus:ring-[#1a1a1a] focus:border-transparent placeholder:text-gray-400 leading-relaxed"
                style={{ minHeight: 44, maxHeight: 120 }}
              />
            </div>
            <button
              onClick={handleAsk}
              disabled={!askText.trim() || askLoading}
              className="flex-shrink-0 w-10 h-10 bg-[#1a1a1a] text-white rounded-xl flex items-center justify-center hover:bg-[#333] transition-colors disabled:opacity-40"
            >
              {askLoading ? (
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
              )}
            </button>
          </div>
          <p className="text-[10px] text-gray-400 mt-2 text-center">
            Enter to send · Shift+Enter for new line · Casper reviews and proposes — you approve
          </p>
        </div>
      </div>
    </div>
  );
}
