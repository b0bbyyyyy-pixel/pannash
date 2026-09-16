'use client';

/**
 * Compact call history for one lead — shown on the lead workspace.
 * Rows: when, status/disposition, duration, recording playback link.
 */
import { useState, useEffect, useCallback } from 'react';

interface CallRow {
  id: string;
  status: string | null;
  disposition: string | null;
  notes: string | null;
  started_at: string;
  answered_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  recording_url: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  dry_run: 'Dry run',
  created: 'Starting…',
  ringing_agent: 'Ringing your phone',
  agent_answered: 'Dialing lead…',
  in_progress: 'On call',
  completed: 'Completed',
  no_answer: 'No answer',
  busy: 'Busy',
  failed: 'Failed',
  canceled: 'Canceled',
  agent_no_answer: 'Desk phone missed',
};

const LIVE_STATUSES = ['created', 'ringing_agent', 'agent_answered', 'in_progress'];

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function fmtDuration(s: number | null): string {
  if (!s && s !== 0) return '';
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

export default function CallHistoryPanel({ leadId }: { leadId: string }) {
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/telephony/calls?leadId=${leadId}&limit=10`);
      const data = await res.json();
      if (res.ok) setCalls(data.calls || []);
    } catch { /* ignore */ }
    setLoaded(true);
  }, [leadId]);

  useEffect(() => { load(); }, [load]);

  // Poll while a call is live so status updates land without a refresh
  const hasLive = calls.some((c) => LIVE_STATUSES.includes(c.status ?? ''));
  useEffect(() => {
    if (!hasLive) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [hasLive, load]);

  if (!loaded || calls.length === 0) return null;

  return (
    <div className="mt-3">
      <p className="text-[10px] font-semibold text-[#9b9b9b] uppercase tracking-wider mb-2">Call History</p>
      <div className="space-y-1.5">
        {calls.map((c) => {
          const live = LIVE_STATUSES.includes(c.status ?? '');
          return (
            <div key={c.id} className="flex items-center justify-between gap-2 text-xs border border-[#efefef] rounded-md px-2.5 py-1.5">
              <div className="min-w-0">
                <span className={live ? 'text-green-600 font-medium' : 'text-[#1a1a1a]'}>
                  {live && <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5 animate-pulse" />}
                  {STATUS_LABELS[c.status ?? ''] || c.status || '—'}
                </span>
                {c.disposition && <span className="text-[#9b9b9b]"> · {c.disposition.replace(/_/g, ' ')}</span>}
                {c.duration_seconds != null && c.duration_seconds > 0 && (
                  <span className="text-[#9b9b9b]"> · {fmtDuration(c.duration_seconds)}</span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {c.recording_url && (
                  <a
                    href={c.recording_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#1a1a1a] underline hover:no-underline"
                  >
                    Recording
                  </a>
                )}
                <span className="text-[#9b9b9b]">{fmtWhen(c.started_at)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
