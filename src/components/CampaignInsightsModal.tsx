'use client';

import { useEffect, useState } from 'react';

type Insights = {
  name: string;
  leads: number;
  sent: number;
  replies: number;
  replyRate: number;
  optOuts: number;
  pipeline: number;
  statuses: string[];
  statusCounts: Record<string, number>;
  failed: number;
  skipped: number;
  pending: number;
  jobStatus: string | null;
  mix: { positive: number; negative: number; opt_out: number; other: number };
  templates: {
    index: number;
    preview: string;
    sent: number;
    replies: number;
    optOuts: number;
    replyRate: number;
  }[];
  failures: { error: string; count: number }[];
  campaigns?: number;
  topStates?: { state: string; label: string; replies: number; share: number }[];
  topAreaCodes?: {
    areaCode: string;
    city: string | null;
    state: string | null;
    replies: number;
    share: number;
  }[];
  topIndustries?: { industry: string; replies: number; share: number }[];
};

function pct(part: number, whole: number) {
  if (!whole) return '0%';
  return `${Math.round((part / whole) * 100)}%`;
}

function Row({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-sm text-[#6b6b6b]">{label}</span>
      <span className="text-sm text-[#1a1a1a] tabular-nums text-right">
        {value}
        {hint ? <span className="ml-2 text-[11px] text-[#9b9b9b]">{hint}</span> : null}
      </span>
    </div>
  );
}

function RankedList({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  rows: { label: string; replies: number; share: number }[];
}) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-[#9b9b9b] mb-2">{title}</div>
      {rows.length === 0 ? (
        <p className="text-sm text-[#9b9b9b]">{empty}</p>
      ) : (
        <div className="divide-y divide-[#f0f0f0]">
          {rows.map(row => (
            <Row
              key={row.label}
              label={row.label}
              value={row.replies}
              hint={`${row.share}% of replies`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CampaignInsightsModal({
  listId,
  campaignName,
  overview = false,
  onClose,
}: {
  listId?: string;
  campaignName?: string;
  overview?: boolean;
  onClose: () => void;
}) {
  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('Docs In');
  const [days, setDays] = useState<'30' | '60' | '90' | 'all'>('30');

  useEffect(() => {
    let dead = false;
    setData(null);
    setError(null);
    const url = overview
      ? `/api/sms/campaign-insights?days=${days}`
      : `/api/sms/campaign-insights?listId=${encodeURIComponent(listId || '')}`;
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 25_000);
    fetch(url, { cache: 'no-store', signal: ctrl.signal })
      .then(async res => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Could not load insights');
        return json as Insights;
      })
      .then(d => {
        if (dead) return;
        setData(d);
        const docs = (d.statuses ?? []).find(n => /^docs in$/i.test(n));
        setStatus(docs || d.statuses?.[0] || 'Docs In');
      })
      .catch(err => {
        if (dead) return;
        if (err instanceof DOMException && err.name === 'AbortError') {
          setError('Insights took too long. Try a shorter range.');
          return;
        }
        setError(err instanceof Error ? err.message : 'Could not load insights');
      })
      .finally(() => window.clearTimeout(timer));
    return () => { dead = true; ctrl.abort(); };
  }, [listId, overview, days]);

  const mixTotal = data ? data.mix.positive + data.mix.negative + data.mix.opt_out + data.mix.other : 0;
  const statusCount = data ? (data.statusCounts[status] ?? 0) : 0;
  const statusRate = data && data.sent ? Math.round((statusCount / data.sent) * 100) : 0;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-[80]" onClick={onClose} />
      <div
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[81] bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[86vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-5 py-4 border-b border-[#f0f0f0] shrink-0">
          <div>
            <h3 className="font-bold text-[#1a1a1a]">Campaign insights</h3>
            {overview ? (
              <select
                value={days}
                onChange={e => setDays(e.target.value as typeof days)}
                className="mt-1 text-xs text-[#6b6b6b] bg-transparent border-0 border-b border-[#e5e5e5] py-0.5 pr-4 focus:outline-none focus:border-[#1a1a1a]"
              >
                <option value="30">Last 30 days</option>
                <option value="60">Last 60 days</option>
                <option value="90">Last 90 days</option>
                <option value="all">All time</option>
              </select>
            ) : (
              <p className="text-xs text-[#6b6b6b] mt-0.5">{data?.name || campaignName}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#9b9b9b] hover:text-[#1a1a1a] transition-colors p-1 rounded hover:bg-[#f5f5f5]"
            title="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto space-y-4">
          {!data && !error ? (
            <p className="text-sm text-[#9b9b9b]">Loading…</p>
          ) : null}
          {error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : null}
          {data ? (
            <>
              <div className="divide-y divide-[#f0f0f0]">
                <Row
                  label="Sent"
                  value={data.sent}
                  hint={overview
                    ? `${data.campaigns ?? 0} campaign${(data.campaigns ?? 0) === 1 ? '' : 's'}`
                    : `${data.leads} in list`}
                />
                <Row label="Replied" value={`${data.replyRate}%`} hint={`${data.replies} of ${data.sent || 0}`} />
                <Row label="Opted out" value={data.optOuts} hint={pct(data.optOuts, data.sent)} />
                <Row label="Failed" value={data.failed} />
                <Row label="Skipped" value={data.skipped} />
                <Row label="In pipeline" value={data.pipeline} />
                <div className="flex items-center gap-2 py-1.5">
                  <span className="text-sm text-[#6b6b6b] shrink-0">Status</span>
                  <select
                    value={status}
                    onChange={e => setStatus(e.target.value)}
                    className="min-w-0 flex-1 max-w-[11rem] text-sm text-[#1a1a1a] bg-transparent border-0 border-b border-[#e5e5e5] py-0.5 focus:outline-none focus:border-[#1a1a1a]"
                  >
                    {(data.statuses.length ? data.statuses : ['Docs In']).map(name => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                  <span className="ml-auto text-sm text-[#1a1a1a] tabular-nums text-right shrink-0">
                    {statusRate}%
                    <span className="ml-2 text-[11px] text-[#9b9b9b]">
                      {statusCount} of {data.sent || 0}
                    </span>
                  </span>
                </div>
              </div>

              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[#9b9b9b] mb-2">Replies</div>
                {mixTotal === 0 ? (
                  <p className="text-sm text-[#9b9b9b]">No replies yet.</p>
                ) : (
                  <div className="space-y-1.5">
                    {([
                      ['Positive', data.mix.positive, 'bg-emerald-500'],
                      ['Negative', data.mix.negative, 'bg-amber-500'],
                      ['Opt-out', data.mix.opt_out, 'bg-red-400'],
                      ['Other', data.mix.other, 'bg-gray-400'],
                    ] as const).map(([label, n, bar]) => (
                      <div key={label} className="flex items-center gap-2 text-xs">
                        <span className="w-16 text-[#6b6b6b]">{label}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                          <div className={`h-full rounded-full ${bar}`} style={{ width: pct(n, mixTotal) }} />
                        </div>
                        <span className="w-16 text-right tabular-nums text-[#1a1a1a] font-medium">
                          {n} · {pct(n, mixTotal)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[#9b9b9b] mb-2">Opening texts</div>
                {data.templates.length === 0 ? (
                  <p className="text-sm text-[#9b9b9b]">
                    {overview
                      ? 'No drip templates recorded in this range yet.'
                      : 'No drip templates recorded for this campaign yet.'}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {data.templates.map((t, i) => (
                      <div key={t.index} className="py-2 first:pt-0">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-[11px] text-[#9b9b9b]">
                            {i === 0 ? 'Best reply rate' : `Variant ${t.index + 1}`}
                          </span>
                          <span className="text-sm text-[#1a1a1a] tabular-nums">{t.replyRate}%</span>
                        </div>
                        <p className="text-xs text-[#1a1a1a] leading-snug mt-0.5">{t.preview}</p>
                        <p className="text-[11px] text-[#9b9b9b] mt-0.5 tabular-nums">
                          {t.replies} replies · {t.sent} sent · {t.optOuts} opt-outs
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <RankedList
                title="Top states"
                empty="No state data on replies yet."
                rows={(data.topStates ?? []).map(s => ({
                  label: s.label,
                  replies: s.replies,
                  share: s.share,
                }))}
              />

              <RankedList
                title="Top area codes"
                empty="No area-code data on replies yet."
                rows={(data.topAreaCodes ?? []).map(a => ({
                  label: a.city && a.state ? `${a.areaCode} · ${a.city}, ${a.state}` : a.areaCode,
                  replies: a.replies,
                  share: a.share,
                }))}
              />

              <RankedList
                title="Top industries"
                empty="No industry signal from company names yet."
                rows={(data.topIndustries ?? []).map(i => ({
                  label: i.industry,
                  replies: i.replies,
                  share: i.share,
                }))}
              />

              {data.failures.length > 0 ? (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-[#9b9b9b] mb-2">Send failures</div>
                  <ul className="space-y-1">
                    {data.failures.map(f => (
                      <li key={f.error} className="text-xs text-[#6b6b6b]">
                        <span className="font-medium text-[#1a1a1a] tabular-nums">{f.count}</span>
                        {' · '}
                        {f.error}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}
