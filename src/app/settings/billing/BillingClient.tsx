'use client';

import { useCallback, useEffect, useState } from 'react';
import type { BillingCredits, ProviderCredits } from '@/lib/billing/credits';

function money(amount: number | null, currency = 'USD'): string {
  if (amount == null || !Number.isFinite(amount)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function tone(amount: number | null): string {
  if (amount == null) return 'text-gray-900';
  if (amount <= 5) return 'text-red-600';
  if (amount <= 15) return 'text-amber-600';
  return 'text-gray-900';
}

function CreditCard({
  title,
  subtitle,
  href,
  hrefLabel,
  data,
}: {
  title: string;
  subtitle: string;
  href: string;
  hrefLabel: string;
  data: ProviderCredits | null;
}) {
  const remaining = data?.remaining ?? null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>
        </div>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium text-gray-500 hover:text-gray-900 underline underline-offset-2 shrink-0"
        >
          {hrefLabel}
        </a>
      </div>

      {!data ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : data.status === 'ok' ? (
        <>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Remaining</p>
          <p className={`text-4xl font-bold tracking-tight ${tone(remaining)}`}>{money(remaining, data.currency)}</p>
          {data.used != null && data.used > 0 && (
            <p className="text-sm text-gray-500 mt-2">Used this period {money(data.used, data.currency)}</p>
          )}
          {data.label && !data.used && <p className="text-sm text-gray-500 mt-2">{data.label}</p>}
          {remaining != null && remaining <= 15 && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-md px-3 py-2 mt-4">
              {remaining <= 5 ? 'Credits are running low. Top up to avoid interruptions.' : 'Balance is getting low.'}
            </p>
          )}
        </>
      ) : (
        <div>
          <p className="text-4xl font-bold tracking-tight text-gray-300">—</p>
          <p className="text-sm text-gray-600 mt-3">{data.error || 'Not available'}</p>
        </div>
      )}
    </div>
  );
}

export default function BillingClient() {
  const [data, setData] = useState<BillingCredits | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/settings/billing', { credentials: 'include', cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load credits');
      setData(json as BillingCredits);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load credits');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const fetched = data?.fetchedAt
    ? new Date(data.fetchedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <button
          onClick={load}
          disabled={loading}
          className="px-3.5 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3">{error}</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CreditCard
          title="Twilio"
          subtitle="SMS and voice credits"
          href="https://console.twilio.com/"
          hrefLabel="Open Twilio"
          data={data?.twilio ?? null}
        />
        <CreditCard
          title="xAI"
          subtitle="console.x.ai prepaid credits"
          href="https://console.x.ai/"
          hrefLabel="Open xAI Console"
          data={data?.xai ?? null}
        />
      </div>

      {fetched && (
        <p className="text-xs text-gray-400">Updated at {fetched}. Balances can lag a few minutes.</p>
      )}
    </div>
  );
}
