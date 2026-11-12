'use client';

import { useEffect, useState } from 'react';

type PortalEvent = {
  at: string;
  title: string;
  detail?: string;
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

export default function MerchantPortalEvents({
  leadId,
  refreshKey,
}: {
  leadId: string;
  refreshKey?: string | number;
}) {
  const [events, setEvents] = useState<PortalEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/crm/merchant-portal?leadId=${encodeURIComponent(leadId)}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        if (cancelled) return;
        const list = Array.isArray(d.events) ? d.events as PortalEvent[] : [];
        setEvents(list);
      })
      .catch(() => {
        if (!cancelled) setEvents([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [leadId, refreshKey]);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">Activity</h3>
      {loading ? (
        <p className="text-[11px] text-[#9b9b9b] py-4">Loading updates…</p>
      ) : !events.length ? (
        <p className="text-[11px] text-[#9b9b9b] py-4">No portal activity yet.</p>
      ) : (
        <div className="space-y-3">
          {events.map((ev, i) => (
            <div key={`${ev.at}-${ev.title}-${i}`} className="flex gap-2.5">
              <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 bg-[#d4d4d4]" />
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
      )}
    </div>
  );
}
