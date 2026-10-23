'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ParsedOfferFields } from '@/lib/email/offerFields';

export type { ParsedOfferFields };

export const LEAD_ACTIVITY_EVENT = 'gostwrk-lead-activity';

export function emitLeadActivity(leadId: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(LEAD_ACTIVITY_EVENT, { detail: { leadId } }));
}

type MailRow = {
  id: string;
  folder: 'inbox' | 'sent';
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  hasOfferLink?: boolean;
  offerLinkHost?: string;
};

function fmtDate(raw: string) {
  const t = Date.parse(raw);
  if (Number.isNaN(t)) return raw || '';
  return new Date(t).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function EmailOfferPicker({
  leadId,
  queryHint,
  defaultFolder = 'inbox',
  onFill,
  onClose,
}: {
  leadId: string;
  queryHint?: string;
  defaultFolder?: 'inbox' | 'sent';
  onFill?: (offer: ParsedOfferFields) => void;
  onClose: () => void;
}) {
  const [folder, setFolder] = useState<'inbox' | 'sent'>(defaultFolder);
  const [q, setQ] = useState(queryHint || '');
  const [rows, setRows] = useState<MailRow[]>([]);
  const [nextPage, setNextPage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [loggedId, setLoggedId] = useState<string | null>(null);

  const load = useCallback(async (opts?: { pageToken?: string; append?: boolean }) => {
    if (opts?.append) setLoadingMore(true);
    else setLoading(true);
    setError('');
    setNeedsReconnect(false);
    try {
      const params = new URLSearchParams({ folder });
      if (q.trim()) params.set('q', q.trim());
      if (opts?.pageToken) params.set('pageToken', opts.pageToken);
      const res = await fetch(`/api/email/messages?${params}`, { cache: 'no-store' });
      const data = await res.json() as {
        messages?: MailRow[];
        nextPageToken?: string | null;
        error?: string;
        needsReconnect?: boolean;
      };
      if (!res.ok) {
        setNeedsReconnect(!!data.needsReconnect);
        setError(data.error || 'Could not load email.');
        if (!opts?.append) setRows([]);
        return;
      }
      const list = data.messages ?? [];
      setRows(prev => (opts?.append ? [...prev, ...list] : list));
      setNextPage(data.nextPageToken ?? null);
    } catch {
      setError('Could not reach Gmail.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [folder, q]);

  useEffect(() => {
    void load();
  }, [folder]); // eslint-disable-line react-hooks/exhaustive-deps -- search is manual

  const parse = async (id: string) => {
    if (!onFill) return;
    setBusyId(id);
    setError('');
    try {
      const res = await fetch('/api/email/parse-offer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: id, leadId }),
      });
      const data = await res.json() as {
        offer?: ParsedOfferFields;
        error?: string;
        needsReconnect?: boolean;
        message?: { folder?: string };
      };
      if (!res.ok) {
        setNeedsReconnect(!!data.needsReconnect);
        setError(data.error || 'Parse failed.');
        return;
      }
      if (data.message?.folder === 'sent') emitLeadActivity(leadId);
      if (data.offer) onFill(data.offer);
      onClose();
    } catch {
      setError('Parse failed.');
    } finally {
      setBusyId(null);
    }
  };

  const logSent = async (id: string) => {
    setBusyId(id);
    setError('');
    try {
      const res = await fetch('/api/email/log-sent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: id, leadId }),
      });
      const data = await res.json() as { error?: string; needsReconnect?: boolean };
      if (!res.ok) {
        setNeedsReconnect(!!data.needsReconnect);
        setError(data.error || 'Could not add to Status.');
        return;
      }
      setLoggedId(id);
      emitLeadActivity(leadId);
    } catch {
      setError('Could not add to Status.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/40 p-3">
      <div className="bg-white w-full max-w-xl max-h-[86vh] rounded-lg shadow-xl flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-[#ececec] flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-[#1a1a1a]">Choose an email</p>
            <p className="text-[11px] text-[#6b6b6b]">Inbox or Sent — pick one to fill the offer or add it to Status.</p>
          </div>
          <button type="button" onClick={onClose} className="text-[#9b9b9b] hover:text-[#1a1a1a] text-sm px-2 py-1">
            Close
          </button>
        </div>

        <div className="px-4 pt-3 flex gap-2">
          {(['inbox', 'sent'] as const).map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => { setFolder(tab); setRows([]); }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md border ${
                folder === tab
                  ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]'
                  : 'bg-white text-[#6b6b6b] border-[#e5e5e5] hover:border-[#c4c4c4]'
              }`}
            >
              {tab === 'inbox' ? 'Inbox' : 'Sent'}
            </button>
          ))}
        </div>

        <form
          className="px-4 py-3 flex gap-2"
          onSubmit={e => { e.preventDefault(); void load(); }}
        >
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search subject, lender, company…"
            className="flex-1 px-3 py-2 border border-[#e5e5e5] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#5a7fc7]"
          />
          <button
            type="submit"
            className="px-3 py-2 text-sm font-medium bg-[#f4f4f4] border border-[#e5e5e5] rounded-md hover:bg-[#ececec]"
          >
            Search
          </button>
        </form>

        {needsReconnect && (
          <div className="mx-4 mb-2 text-[12px] text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            Connect a separate Gmail (read) login in Settings.{' '}
            <a href="/api/auth/google?kind=read&redirect=/settings/connections" className="underline font-medium">
              Connect Gmail read
            </a>
          </div>
        )}
        {error && !needsReconnect && (
          <p className="mx-4 mb-2 text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>
        )}

        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
          {loading ? (
            <p className="text-[12px] text-[#9b9b9b] py-8 text-center">Loading mail…</p>
          ) : rows.length === 0 ? (
            <p className="text-[12px] text-[#9b9b9b] py-8 text-center">No emails in this view.</p>
          ) : rows.map(row => (
            <div key={row.id} className={`border rounded-md px-3 py-2.5 ${row.hasOfferLink ? 'border-[#5a7fc7]/40 bg-[#f7f9fc]' : 'border-[#ececec]'}`}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-[13px] font-medium text-[#1a1a1a] truncate">{row.subject}</p>
                {row.hasOfferLink && (
                  <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-[#5a7fc7] bg-white border border-[#5a7fc7]/30 rounded px-1.5 py-0.5">
                    {row.offerLinkHost ? `Link · ${row.offerLinkHost}` : 'Has offer link'}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[#6b6b6b] truncate mt-0.5">
                {folder === 'sent' ? `To ${row.to}` : row.from}
                {row.date ? ` · ${fmtDate(row.date)}` : ''}
              </p>
              {row.snippet ? (
                <p className="text-[11px] text-[#9b9b9b] mt-1 line-clamp-2">{row.snippet}</p>
              ) : null}
              <div className="flex gap-2 mt-2">
                {onFill && (
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => void parse(row.id)}
                    className="px-2.5 py-1 text-[11px] font-medium bg-[#5a7fc7] text-white rounded hover:bg-[#4a6fb7] disabled:opacity-50"
                  >
                    {busyId === row.id ? 'Reading…' : 'Fill offer'}
                  </button>
                )}
                {folder === 'sent' && (
                  <button
                    type="button"
                    disabled={busyId === row.id || loggedId === row.id}
                    onClick={() => void logSent(row.id)}
                    className="px-2.5 py-1 text-[11px] font-medium border border-[#e5e5e5] rounded text-[#1a1a1a] hover:bg-[#f7f7f7] disabled:opacity-50"
                  >
                    {loggedId === row.id ? 'Added to Status' : 'Add to Status'}
                  </button>
                )}
              </div>
            </div>
          ))}
          {nextPage && !loading && (
            <button
              type="button"
              disabled={loadingMore}
              onClick={() => void load({ pageToken: nextPage, append: true })}
              className="w-full py-2 text-[12px] text-[#5a7fc7] hover:underline disabled:opacity-50"
            >
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
