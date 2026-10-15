'use client';

import { useEffect, useState } from 'react';

type Event = {
  at: string;
  title: string;
  detail?: string;
  source: string;
};

function fmtDate(d: string | null | undefined) {
  return d
    ? new Date(d).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';
}

const DOT: Record<string, string> = {
  casper: 'bg-[#7d9b6e]',
  docs: 'bg-[#1a1a1a]',
  status: 'bg-amber-500',
  lenders: 'bg-[#7d9b6e]',
  contact: 'bg-[#c4c4c4]',
  lead: 'bg-[#d4d4d4]',
};

export default function LeadUpdatesTimeline({
  leadId,
  createdAt,
  lastContact,
  refreshKey,
}: {
  leadId: string;
  createdAt?: string | null;
  lastContact?: string | null;
  refreshKey?: string;
}) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/leads/${leadId}/activity`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        if (cancelled) return;
        const list = Array.isArray(d.events) ? d.events as Event[] : [];
        if (list.length) {
          setEvents(list);
          return;
        }
        const fallback: Event[] = [];
        if (createdAt) fallback.push({ at: createdAt, title: 'Lead created', source: 'lead' });
        if (lastContact) fallback.push({ at: lastContact, title: 'Last contact logged', source: 'contact' });
        setEvents(fallback);
      })
      .catch(() => {
        if (!cancelled) setEvents(createdAt ? [{ at: createdAt, title: 'Lead created', source: 'lead' }] : []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [leadId, createdAt, lastContact, refreshKey]);

  if (loading) {
    return <p className="text-[11px] text-[#9b9b9b] py-6">Loading updates…</p>;
  }

  if (!events.length) {
    return <p className="text-[11px] text-[#9b9b9b] py-6">No updates on this file yet.</p>;
  }

  return (
    <div className="space-y-3">
      {events.map((ev, i) => (
        <div key={`${ev.at}-${ev.title}-${i}`} className="flex gap-2.5">
          <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${DOT[ev.source] || 'bg-[#d4d4d4]'}`} />
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-[#1a1a1a]">{ev.title}</p>
            {ev.detail ? (
              <p className="text-[11px] text-[#6b6b6b] leading-snug mt-0.5 break-words">{ev.detail}</p>
            ) : null}
            <p className="text-[10px] text-[#9b9b9b] mt-0.5">{fmtDate(ev.at)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
