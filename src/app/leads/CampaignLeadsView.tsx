'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import RunSmsModal from '@/components/RunSmsModal';
import { zoneForLocation, formatLocal } from '@/lib/smsDrip/timezones';

interface DripJob {
  id: string;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  sent_count: number;
  total_count: number;
  next_send_at: string | null;
}

interface DripSend {
  lead_id: string;
  sms_status: string;
  scheduled_for: string | null;
  sent_at: string | null;
  error: string | null;
}

export interface CampaignLead {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  notes?: string | null;
  sms_sent_at?: string | null;
  call_made_at?: string | null;
  last_contact?: string | null;
  created_at?: string | null;
  underwriting_data?: Record<string, unknown> | null;
}

interface Props {
  leads: CampaignLead[];
  campaignName: string;
  listId: string;
}

function relativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

/**
 * Many Tracers/data-export sheets store a combined "Business Name Person Name"
 * string in a single column. This helper detects that pattern and extracts
 * just the person name (last 2 words) when the prefix looks like a business
 * or industry category.
 *
 * Examples:
 *   "RIGHTAWAY PAINT L.L.C. Ronald Bannister"     → "Ronald Bannister"
 *   "Transportation & Logistics Nathaniel Manning" → "Nathaniel Manning"
 *   "MWP Michael Wilson"                           → "Michael Wilson"
 *   "Bobby Butler"                                 → "Bobby Butler"  (unchanged)
 */
function extractPersonName(raw: string | null | undefined): string {
  if (!raw) return raw ?? '';
  const words = raw.trim().split(/\s+/);
  if (words.length < 3) return raw; // too short to have a prefix

  const last       = words[words.length - 1];
  const secondLast = words[words.length - 2];

  // A word looks like a person name segment if it starts uppercase + is mostly letters
  const isNameWord = (w: string) =>
    /^[A-Z][a-zA-Z'\-]{1,}$/.test(w) &&
    !/^(LLC|Inc|Corp|Ltd|PLC|Co|LLP|LP|PC)\.?$/i.test(w);

  if (!isNameWord(last) || !isNameWord(secondLast)) return raw;

  const prefix = words.slice(0, -2).join(' ');

  const hasBusinessIndicator =
    /L\.?L\.?C\.?|Inc\.?|Corp\.?|Ltd\.?|PLC|L\.?P\.?/i.test(prefix) || // entity suffixes
    prefix.includes('&') ||                     // "Transportation & Logistics"
    /\b[A-Z]{2,5}\b/.test(prefix) ||           // acronym like "MWP"
    prefix === prefix.toUpperCase() ||           // all-caps prefix
    prefix.split(/\s+/).length >= 3;            // 3+ word business category

  return hasBusinessIndicator ? `${secondLast} ${last}` : raw;
}

function mostRecent(...dates: (string | null | undefined)[]): string | null {
  const valid = dates.filter(Boolean) as string[];
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => (new Date(a) > new Date(b) ? a : b));
}

function leadLocation(lead: CampaignLead): string {
  const ud = lead.underwriting_data || {};
  const city = String(ud.businessCity ?? ud.city ?? '').trim();
  const state = String(ud.businessState ?? ud.state ?? '').trim();
  if (city && state) return `${city}, ${state}`;
  return city || state || '';
}

function listedRevenue(notes: string | null | undefined): string {
  if (!notes) return '';
  const tagged = notes.match(/Listed revenue:\s*([^|]+)/i);
  if (tagged?.[1]) return tagged[1].trim();
  for (const part of notes.split('|')) {
    if (/\b(revenue|monthly sales|annual sales|gross sales|sales volume)\b/i.test(part)) {
      const val = part.split(':').slice(1).join(':').trim();
      if (val) return val;
    }
  }
  return '';
}

export default function CampaignLeadsView({ leads: initialLeads, campaignName, listId }: Props) {
  const router = useRouter();
  const [leads, setLeads] = useState<CampaignLead[]>(initialLeads);
  const [search, setSearch] = useState('');
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [pipelineMoving, setPipelineMoving] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; lead: CampaignLead } | null>(null);
  const contextRef = useRef<HTMLDivElement>(null);

  // ---- SMS drip state ----
  const [dripJob, setDripJob] = useState<DripJob | null>(null);
  const [dripSends, setDripSends] = useState<Map<string, DripSend>>(new Map());
  const [savedTemplates, setSavedTemplates] = useState<string[] | null>(null);
  const [showRunSms, setShowRunSms] = useState(false);
  const [dripBusy, setDripBusy] = useState(false);
  const [, setClockTick] = useState(0); // 1s re-render for the countdown

  const refreshDrip = useCallback(async () => {
    try {
      const res = await fetch(`/api/sms/drip?listId=${listId}`);
      if (!res.ok) return;
      const data = await res.json();
      setSavedTemplates(data.savedTemplates ?? null);
      setDripJob(data.job ?? null);
      const map = new Map<string, DripSend>();
      for (const s of (data.sends ?? []) as DripSend[]) map.set(s.lead_id, s);
      setDripSends(map);
      // Reflect drip sends in the SMS chip/badge without a full reload
      if (map.size) {
        setLeads(prev => prev.map(l => {
          const s = map.get(l.id);
          return s?.sent_at && !l.sms_sent_at ? { ...l, sms_sent_at: s.sent_at } : l;
        }));
      }
    } catch { /* poll again next tick */ }
  }, [listId]);

  // Poll drip status every 10s; countdown re-renders every second while active
  useEffect(() => {
    refreshDrip();
    const poll = setInterval(refreshDrip, 10000);
    return () => clearInterval(poll);
  }, [refreshDrip]);

  useEffect(() => {
    if (dripJob?.status !== 'active') return;
    const t = setInterval(() => setClockTick(x => x + 1), 1000);
    return () => clearInterval(t);
  }, [dripJob?.status]);

  // Open the Run SMS modal when arriving via ?runsms=1 (campaign list row button)
  useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('runsms') === '1') {
      setShowRunSms(true);
    }
  }, []);

  const dripAction = async (action: 'pause' | 'resume' | 'cancel') => {
    if (!dripJob) return;
    setDripBusy(true);
    try {
      await fetch('/api/sms/drip', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: dripJob.id, action }),
      });
      await refreshDrip();
    } finally {
      setDripBusy(false);
    }
  };

  const countdown = (() => {
    if (!dripJob?.next_send_at || dripJob.status !== 'active') return null;
    const ms = new Date(dripJob.next_send_at).getTime() - Date.now();
    if (ms <= 0) return 'sending…';
    const total = Math.floor(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `next in ${m}:${String(s).padStart(2, '0')}`;
  })();

  useEffect(() => {
    if (!contextMenu) return;
    const close = (e: MouseEvent) => {
      if (contextRef.current && !contextRef.current.contains(e.target as Node)) setContextMenu(null);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [contextMenu]);

  const filtered = useMemo(() => {
    if (!search.trim()) return leads;
    const q = search.toLowerCase();
    return leads.filter((l) => {
      const loc = leadLocation(l).toLowerCase();
      const rev = listedRevenue(l.notes).toLowerCase();
      return (
        l.name?.toLowerCase().includes(q) ||
        l.email?.toLowerCase().includes(q) ||
        l.phone?.includes(q) ||
        l.company?.toLowerCase().includes(q) ||
        loc.includes(q) ||
        rev.includes(q)
      );
    });
  }, [leads, search]);

  const smsCount = leads.filter((l) => l.sms_sent_at).length;
  const callCount = leads.filter((l) => l.call_made_at).length;

  const handleOutreach = async (leadId: string, type: 'sms' | 'call') => {
    setLoadingId(leadId);

    // Optimistic update
    setLeads((prev) =>
      prev.map((l) => {
        if (l.id !== leadId) return l;
        const col = type === 'sms' ? 'sms_sent_at' : 'call_made_at';
        const current = l[col];
        return { ...l, [col]: current ? null : new Date().toISOString() };
      })
    );

    try {
      const res = await fetch('/api/leads/outreach', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, type }),
      });
      const json = await res.json();
      if (res.ok && json.lead) {
        // Sync with server value
        setLeads((prev) =>
          prev.map((l) => (l.id === leadId ? { ...l, ...json.lead } : l))
        );
      } else {
        // Revert optimistic update on error
        setLeads((prev) =>
          prev.map((l) => {
            if (l.id !== leadId) return l;
            const col = type === 'sms' ? 'sms_sent_at' : 'call_made_at';
            const current = l[col];
            return { ...l, [col]: current ? null : new Date().toISOString() };
          })
        );
      }
    } catch {
      // revert on network failure
      setLeads((prev) =>
        prev.map((l) => {
          if (l.id !== leadId) return l;
          const col = type === 'sms' ? 'sms_sent_at' : 'call_made_at';
          const current = l[col];
          return { ...l, [col]: current ? null : new Date().toISOString() };
        })
      );
    }

    setLoadingId(null);
  };

  const sendToPipeline = async (lead: CampaignLead) => {
    setContextMenu(null);
    setPipelineMoving(lead.id);
    try {
      const res = await fetch('/api/leads/pipeline', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id, status: 'Prospect' }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.error || 'Could not send to pipeline');
      }
    } finally {
      setPipelineMoving(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Back navigation */}
      <button
        onClick={() => router.push('/leads')}
        className="flex items-center gap-1.5 text-sm text-[#6b6b6b] hover:text-[#1a1a1a] transition-colors font-medium"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        All Campaigns
      </button>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-[#1a1a1a]">{campaignName}</h2>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-[11px] text-[#6b6b6b] font-medium bg-gray-100 px-2 py-0.5 rounded-full">
              {leads.length} lead{leads.length !== 1 ? 's' : ''}
            </span>
            <span className="bg-blue-50 text-blue-600 text-[10px] font-semibold px-2 py-0.5 rounded-full">
              SMS {smsCount}
            </span>
            <span className="bg-green-50 text-green-600 text-[10px] font-semibold px-2 py-0.5 rounded-full">
              Calls {callCount}
            </span>

            {/* SMS drip controls */}
            {(!dripJob || dripJob.status === 'completed' || dripJob.status === 'cancelled') && (
              <button
                onClick={() => setShowRunSms(true)}
                className="flex items-center gap-1 bg-[#1a1a1a] hover:bg-[#333] text-white text-[10px] font-semibold px-2.5 py-0.5 rounded-full transition-colors"
              >
                <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Run SMS
              </button>
            )}
            {dripJob?.status === 'active' && (
              <>
                <button
                  onClick={() => dripAction('pause')}
                  disabled={dripBusy}
                  className="flex items-center gap-1 bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-semibold px-2.5 py-0.5 rounded-full transition-colors disabled:opacity-50"
                >
                  <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 5h4v14H6zm8 0h4v14h-4z" />
                  </svg>
                  Pause
                </button>
                <span className="text-[11px] text-[#6b6b6b] font-medium tabular-nums">
                  Sent {dripJob.sent_count}/{dripJob.total_count}
                  {countdown ? ` · ${countdown}` : ''}
                </span>
              </>
            )}
            {dripJob?.status === 'paused' && (
              <>
                <button
                  onClick={() => dripAction('resume')}
                  disabled={dripBusy}
                  className="flex items-center gap-1 bg-[#1a1a1a] hover:bg-[#333] text-white text-[10px] font-semibold px-2.5 py-0.5 rounded-full transition-colors disabled:opacity-50"
                >
                  <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  Resume
                </button>
                <span className="text-[11px] text-[#6b6b6b] font-medium tabular-nums">
                  Paused · {dripJob.sent_count}/{dripJob.total_count} sent
                </span>
                <button
                  onClick={() => dripAction('cancel')}
                  disabled={dripBusy}
                  className="text-[10px] text-[#9b9b9b] hover:text-red-600 transition-colors"
                  title="Cancel this drip"
                >
                  Cancel
                </button>
              </>
            )}
            {dripJob?.status === 'completed' && (
              <span className="text-[11px] text-green-700 font-medium">
                Drip done · {dripJob.sent_count}/{dripJob.total_count} sent
              </span>
            )}

            <div className="relative">
              <svg
                className="absolute left-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9b9b9b]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search leads…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-36 pl-5 pr-1 py-0.5 text-xs bg-transparent text-[#1a1a1a] placeholder:text-[#9b9b9b] focus:outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#ebebeb] rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#f5f5f5]">
              <th className="text-[11px] font-bold text-[#9b9b9b] uppercase tracking-wider px-4 py-2 text-left">Lead</th>
              <th className="text-[11px] font-bold text-[#9b9b9b] uppercase tracking-wider px-4 py-2 text-left">Location</th>
              <th className="text-[11px] font-bold text-[#9b9b9b] uppercase tracking-wider px-4 py-2 text-left">Revenue</th>
              <th className="text-[11px] font-bold text-[#9b9b9b] uppercase tracking-wider px-4 py-2 text-left">Contact</th>
              <th className="text-[11px] font-bold text-[#9b9b9b] uppercase tracking-wider px-4 py-2 text-left">SMS</th>
              <th className="text-[11px] font-bold text-[#9b9b9b] uppercase tracking-wider px-4 py-2 text-left">Call</th>
              <th className="text-[11px] font-bold text-[#9b9b9b] uppercase tracking-wider px-4 py-2 text-left">Last Activity</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-[#9b9b9b] text-sm">
                  {search ? 'No leads match your search.' : 'No leads in this campaign yet.'}
                </td>
              </tr>
            )}
            {filtered.map((lead) => {
              const lastActivity = mostRecent(lead.last_contact, lead.sms_sent_at, lead.call_made_at);
              const isLoading = loadingId === lead.id;
              const PHONE_LABELS = new Set(['mobile','cell','home','work','office','direct','landline','voip','personal','fax']);
              const rawName = lead.name && !lead.name.includes('@') ? lead.name : null;
              const personName = extractPersonName(rawName) || lead.company || lead.name || '—';
              const company = lead.company && !PHONE_LABELS.has(lead.company.toLowerCase().trim())
                ? lead.company : null;
              const showCompany = company && company !== personName;
              const loc = leadLocation(lead);
              const rev = listedRevenue(lead.notes);
              const contact = [lead.phone, lead.email].filter(Boolean).join('  ·  ');

              return (
                <tr
                  key={lead.id}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({ x: e.clientX, y: e.clientY, lead });
                  }}
                  className="border-b border-[#f5f5f5] hover:bg-[#fafafa] transition-colors last:border-b-0"
                >
                  <td className="px-4 py-1.5 whitespace-nowrap max-w-[280px]">
                    <span className="text-sm truncate block">
                      <span className="font-semibold text-[#1a1a1a]">{personName}</span>
                      {showCompany ? <span className="text-[#6b6b6b]">  ·  {company}</span> : null}
                    </span>
                  </td>
                  <td className="px-4 py-1.5 whitespace-nowrap">
                    <span className="text-xs text-[#6b6b6b]">{loc || '—'}</span>
                  </td>
                  <td className="px-4 py-1.5 whitespace-nowrap">
                    <span className="text-xs text-[#6b6b6b]">{rev || '—'}</span>
                  </td>
                  <td className="px-4 py-1.5 whitespace-nowrap max-w-[260px]">
                    <span className="text-xs text-[#6b6b6b] truncate block">{contact || '—'}</span>
                  </td>

                  {/* SMS badge */}
                  <td className="px-4 py-1.5">
                    <button
                      disabled={isLoading}
                      onClick={() => handleOutreach(lead.id, 'sms')}
                      className={`transition-colors disabled:opacity-50 ${
                        lead.sms_sent_at
                          ? 'bg-blue-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full cursor-pointer'
                          : 'border border-[#e5e5e5] text-[#9b9b9b] text-[10px] px-2 py-0.5 rounded-full cursor-pointer hover:border-blue-300'
                      }`}
                      title={lead.sms_sent_at ? 'SMS sent — click to unmark' : 'Mark SMS sent'}
                    >
                      SMS
                    </button>
                  </td>

                  {/* Call badge */}
                  <td className="px-4 py-1.5">
                    <button
                      disabled={isLoading}
                      onClick={() => handleOutreach(lead.id, 'call')}
                      className={`transition-colors disabled:opacity-50 ${
                        lead.call_made_at
                          ? 'bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full cursor-pointer'
                          : 'border border-[#e5e5e5] text-[#9b9b9b] text-[10px] px-2 py-0.5 rounded-full cursor-pointer hover:border-green-300'
                      }`}
                      title={lead.call_made_at ? 'Call made — click to unmark' : 'Mark call made'}
                    >
                      Call
                    </button>
                  </td>

                  {/* Last activity */}
                  <td className="px-4 py-1.5">
                    {(() => {
                      const send = dripSends.get(lead.id);
                      // Scheduled for the lead's next legal window
                      if (send?.sms_status === 'scheduled' && send.scheduled_for) {
                        const ud = lead.underwriting_data || {};
                        const tz = zoneForLocation(
                          String(ud.businessCity ?? ud.city ?? ''),
                          String(ud.businessState ?? ud.state ?? '')
                        );
                        return (
                          <span className="text-xs text-[#9b9b9b]">
                            SMS at {formatLocal(send.scheduled_for, tz)}
                          </span>
                        );
                      }
                      // Waiting in the drip queue
                      if (send?.sms_status === 'queued' && (dripJob?.status === 'active' || dripJob?.status === 'paused')) {
                        return (
                          <span className="text-xs text-[#9b9b9b] flex items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full bg-blue-400 ${dripJob.status === 'active' ? 'animate-pulse' : ''}`} />
                            SMS queued
                          </span>
                        );
                      }
                      if (send?.sms_status === 'failed') {
                        return <span className="text-xs text-red-500" title={send.error ?? undefined}>SMS failed</span>;
                      }
                      // Sent (drip or manual) — never show "—" after a successful send
                      const sentAt = send?.sent_at ?? lead.sms_sent_at;
                      if (sentAt && (!lastActivity || new Date(sentAt) >= new Date(lastActivity))) {
                        return <span className="text-xs text-[#9b9b9b]">SMS {relativeTime(sentAt)}</span>;
                      }
                      return <span className="text-xs text-[#9b9b9b]">{relativeTime(lastActivity)}</span>;
                    })()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {contextMenu && (
        <div
          ref={contextRef}
          style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, zIndex: 9999 }}
          className="bg-white border border-[#e5e5e5] rounded-xl shadow-2xl py-1 min-w-[220px]"
        >
          <div className="px-4 py-2 border-b border-[#f0f0f0]">
            <p className="text-xs font-semibold text-[#1a1a1a] truncate">{contextMenu.lead.name}</p>
            <p className="text-xs text-[#9b9b9b] truncate">{contextMenu.lead.company || contextMenu.lead.email}</p>
          </div>
          <button
            onClick={() => sendToPipeline(contextMenu.lead)}
            disabled={pipelineMoving === contextMenu.lead.id}
            className="w-full text-left px-4 py-2.5 text-sm text-[#1a1a1a] hover:bg-[#fafafa] disabled:opacity-50"
          >
            {pipelineMoving === contextMenu.lead.id ? 'Sending…' : 'Send to pipeline as Prospect'}
          </button>
        </div>
      )}

      {showRunSms && (
        <RunSmsModal
          listId={listId}
          campaignName={campaignName}
          leadCount={leads.length}
          savedTemplates={savedTemplates}
          onClose={() => setShowRunSms(false)}
          onStarted={refreshDrip}
        />
      )}
    </div>
  );
}
