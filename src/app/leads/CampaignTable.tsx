'use client';

import { useState, useRef, useCallback, useMemo } from 'react';
import { usePolling } from '@/lib/sync/usePolling';
import { useRouter } from 'next/navigation';
import { dripPauseChipLabel } from '@/lib/smsDrip/carrierBlock';
import CampaignInsightsModal from '@/components/CampaignInsightsModal';
import { BUILTIN_LEAD_SOURCES } from '@/lib/smsDrip/leadSources';

interface DripJobSummary {
  id: string;
  list_id: string;
  status: 'active' | 'paused';
  sent_count: number;
  total_count: number;
  pause_reason?: string | null;
}

export interface Campaign {
  id: string;
  name: string;
  created_at: string;
  sourceKey?: string;
  sourceLabel?: string;
  total: number;
  smsCount: number;
  callCount: number;
  touchedCount: number;
  replyCount: number;
}

interface Props {
  campaigns: Campaign[];
  onRename: (id: string, newName: string) => void;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function CampaignTable({ campaigns, onRename }: Props) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [insightsId, setInsightsId] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [dripJobs, setDripJobs] = useState<Map<string, DripJobSummary>>(new Map());

  const loadDripJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/sms/drip');
      if (!res.ok) return;
      const data = await res.json();
      const map = new Map<string, DripJobSummary>();
      for (const j of (data.jobs ?? []) as DripJobSummary[]) map.set(j.list_id, j);
      setDripJobs(map);
    } catch { /* retry next poll */ }
  }, []);
  const anyDripActive = useMemo(
    () => [...dripJobs.values()].some(j => j.status === 'active'),
    [dripJobs],
  );
  usePolling(loadDripJobs, anyDripActive ? 15_000 : 30_000);

  const startEdit = (e: React.MouseEvent, campaign: Campaign) => {
    e.stopPropagation();
    setEditingId(campaign.id);
    setEditingName(campaign.name);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const commitRename = (id: string) => {
    const trimmed = editingName.trim();
    if (trimmed) {
      onRename(id, trimmed);
    }
    setEditingId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter') commitRename(id);
    if (e.key === 'Escape') setEditingId(null);
  };

  const sourceOptions = useMemo(() => {
    const extras = campaigns
      .map(c => ({ key: c.sourceKey || '', label: c.sourceLabel || '' }))
      .filter(s => s.key && !BUILTIN_LEAD_SOURCES.some(b => b.key === s.key));
    const seen = new Set<string>();
    const custom = extras.filter(s => {
      if (seen.has(s.key)) return false;
      seen.add(s.key);
      return true;
    });
    return [...BUILTIN_LEAD_SOURCES, ...custom];
  }, [campaigns]);

  const visible = sourceFilter
    ? campaigns.filter(c => (c.sourceKey || '') === sourceFilter)
    : campaigns;

  if (campaigns.length === 0) {
    return (
      <div className="bg-white border border-[#ebebeb] rounded-xl p-16 text-center">
        <div className="text-4xl mb-4">📋</div>
        <p className="text-[#1a1a1a] font-semibold text-base mb-1">No campaigns yet.</p>
        <p className="text-[#9b9b9b] text-sm">Upload leads to create your first campaign.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setSourceFilter('')}
          className={`px-2.5 py-1 rounded-full text-[11px] border ${
            !sourceFilter ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]' : 'border-[#e5e5e5] text-[#6b6b6b] hover:border-[#c4c4c4]'
          }`}
        >
          All
        </button>
        {sourceOptions.map(s => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSourceFilter(s.key)}
            className={`px-2.5 py-1 rounded-full text-[11px] border ${
              sourceFilter === s.key ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]' : 'border-[#e5e5e5] text-[#6b6b6b] hover:border-[#c4c4c4]'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
    <div className="bg-white border border-[#ebebeb] rounded-xl overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-[#f5f5f5]">
            <th className="text-[11px] font-bold text-[#9b9b9b] uppercase tracking-wider px-4 py-2 text-left">Created</th>
            <th className="text-[11px] font-bold text-[#9b9b9b] uppercase tracking-wider px-4 py-2 text-left">Campaign</th>
            <th className="text-[11px] font-bold text-[#9b9b9b] uppercase tracking-wider px-4 py-2 text-left">Source</th>
            <th className="text-[11px] font-bold text-[#9b9b9b] uppercase tracking-wider px-4 py-2 text-left">Total</th>
            <th className="text-[11px] font-bold text-[#9b9b9b] uppercase tracking-wider px-4 py-2 text-left">Outreach</th>
            <th className="text-[11px] font-bold text-[#9b9b9b] uppercase tracking-wider px-4 py-2 text-left">Response</th>
            <th className="text-[11px] font-bold text-[#9b9b9b] uppercase tracking-wider px-4 py-2 text-left">Progress</th>
            <th className="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {visible.map((campaign) => {
            const progressPct = campaign.total > 0 ? (campaign.touchedCount / campaign.total) * 100 : 0;
            return (
              <tr
                key={campaign.id}
                onClick={() => router.push(`/leads?list=${campaign.id}`)}
                className="border-b border-[#f5f5f5] hover:bg-[#fafafa] cursor-pointer transition-colors last:border-b-0"
              >
                {/* Created date */}
                <td className="px-4 py-2">
                  <span className="text-sm text-[#9b9b9b]">{formatDate(campaign.created_at)}</span>
                </td>

                {/* Campaign name */}
                <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-2">
                    {editingId === campaign.id ? (
                      <input
                        ref={inputRef}
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onBlur={() => commitRename(campaign.id)}
                        onKeyDown={(e) => handleKeyDown(e, campaign.id)}
                        className="text-sm font-semibold text-[#1a1a1a] border-b border-[#1a1a1a] outline-none bg-transparent w-48 pb-0.5"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span
                        className="text-sm font-semibold text-[#1a1a1a] cursor-pointer"
                        onClick={() => router.push(`/leads?list=${campaign.id}`)}
                      >
                        {campaign.name}
                      </span>
                    )}
                    <button
                      onClick={(e) => startEdit(e, campaign)}
                      className="opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity text-[#9b9b9b] hover:text-[#1a1a1a]"
                      title="Rename"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                  </div>
                </td>

                <td className="px-4 py-2">
                  <span className="text-[11px] text-[#6b6b6b]">
                    {sourceOptions.find(s => s.key === campaign.sourceKey)?.label
                      || campaign.sourceLabel
                      || 'Uncategorized'}
                  </span>
                </td>

                {/* Total */}
                <td className="px-4 py-2">
                  <span className="text-sm text-[#1a1a1a] font-medium">{campaign.total}</span>
                </td>

                {/* Outreach badges */}
                <td className="px-4 py-2">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-[#1a1a1a] font-medium">SMS {campaign.smsCount}</span>
                    <span className="text-xs text-[#9b9b9b] font-medium">Call {campaign.callCount}</span>
                    {(() => {
                      const job = dripJobs.get(campaign.id);
                      if (job?.status === 'active') {
                        return (
                          <span className="flex items-center gap-1.5 text-[11px] text-blue-600 font-medium whitespace-nowrap">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                            Sending {job.sent_count}/{job.total_count}
                          </span>
                        );
                      }
                      if (job?.status === 'paused') {
                        return (
                          <span className="text-[11px] text-amber-600 font-medium whitespace-nowrap">
                            {dripPauseChipLabel(job.pause_reason)} · {job.sent_count}/{job.total_count}
                          </span>
                        );
                      }
                      return (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/leads?list=${campaign.id}&runsms=1`);
                          }}
                          className="flex items-center gap-1 border border-[#e5e5e5] hover:border-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-white text-[#6b6b6b] text-[10px] font-semibold px-2 py-0.5 rounded-full transition-colors"
                          title="Run SMS drip on this campaign"
                        >
                          <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                          Run SMS
                        </button>
                      );
                    })()}
                  </div>
                </td>

                {/* Response rate vs texts sent */}
                <td className="px-4 py-2">
                  {campaign.smsCount > 0 ? (
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-sm text-[#1a1a1a] font-medium">
                        {Math.round((campaign.replyCount / campaign.smsCount) * 100)}%
                      </span>
                      <span className="text-[11px] text-[#9b9b9b] font-medium whitespace-nowrap">
                        {campaign.replyCount}/{campaign.smsCount}
                      </span>
                    </div>
                  ) : (
                    <span className="text-sm text-[#c4c4c4]">—</span>
                  )}
                </td>

                {/* Progress bar */}
                <td className="px-4 py-2 min-w-[120px]">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-gray-100">
                      <div
                        className="h-1.5 rounded-full bg-gradient-to-r from-gray-300 to-gray-800 transition-all"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                    <span className="text-[11px] text-[#9b9b9b] font-medium whitespace-nowrap">
                      {campaign.touchedCount}/{campaign.total}
                    </span>
                  </div>
                </td>

                {/* Actions */}
                <td className="px-4 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-3">
                    <button
                      onClick={(e) => { e.stopPropagation(); setInsightsId(campaign.id); }}
                      className="flex items-center justify-center w-5 h-5 rounded-full border border-[#d4d4d4] text-[11px] font-semibold text-[#9b9b9b] hover:border-[#1a1a1a] hover:text-[#1a1a1a] transition-colors"
                      title="Campaign insights"
                    >
                      i
                    </button>
                    <svg className="w-4 h-4 text-[#c4c4c4]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {insightsId ? (
        <CampaignInsightsModal
          listId={insightsId}
          campaignName={campaigns.find(c => c.id === insightsId)?.name || 'Campaign'}
          onClose={() => setInsightsId(null)}
        />
      ) : null}
    </div>
    </div>
  );
}
