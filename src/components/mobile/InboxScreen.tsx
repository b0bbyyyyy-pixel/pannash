'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import FullCrmLink from '@/components/mobile/FullCrmLink';
import { enableAlerts } from '@/components/mobile/MobilePush';
import { initial, weekdayLabel } from '@/components/mobile/format';

type Thread = {
  id: string;
  name: string;
  company: string;
  preview: string;
  unread: number;
  lastAt: string | null;
};

type ListRow = { id: string; name: string; phoneCount: number };
type Template = { id: string; name: string; body: string };

export default function InboxScreen() {
  const router = useRouter();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [compose, setCompose] = useState(false);
  const [campaign, setCampaign] = useState(false);
  const [banner, setBanner] = useState(false);
  const [alertState, setAlertState] = useState<'checking' | 'on' | 'ask' | 'denied' | 'error'>('checking');
  const [alertError, setAlertError] = useState('');

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    if (!standalone && localStorage.getItem('m-text-a2hs') !== '1') setBanner(true);

    if (typeof Notification === 'undefined') {
      setAlertState('error');
      setAlertError('This phone cannot show text alerts yet.');
      return;
    }
    if (Notification.permission === 'denied') {
      setAlertState('denied');
      return;
    }
    if (Notification.permission === 'granted') {
      enableAlerts(false).then(result => {
        setAlertState(result.ok ? 'on' : 'error');
        if (!result.ok) setAlertError('Alerts are allowed, but this server is not sending them yet. Restart the app server, then open this screen again.');
      }).catch(() => setAlertState('error'));
      return;
    }
    setAlertState('ask');
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      const qs = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : '';
      fetch(`/api/m/threads${qs}`, { signal: ctrl.signal })
        .then(r => r.json())
        .then(d => setThreads(d.threads ?? []))
        .catch(() => {})
        .finally(() => setLoading(false));
    }, q.trim() ? 200 : 0);
    return () => { ctrl.abort(); clearTimeout(t); };
  }, [q]);

  useEffect(() => {
    const id = setInterval(() => {
      if (q.trim() || compose) return;
      fetch('/api/m/threads')
        .then(r => r.json())
        .then(d => { if (d.threads) setThreads(d.threads); })
        .catch(() => {});
    }, 8000);
    return () => clearInterval(id);
  }, [q, compose]);

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-white">
      <header className="px-4 pt-[max(12px,env(safe-area-inset-top))] pb-2">
        <p className="text-[10px] tracking-wide text-[#8E8E93]">Gostwrk</p>
        <h1 className="text-[34px] font-bold leading-none text-black">Messages</h1>
      </header>

      {banner && (
        <div className="mx-4 mb-2 rounded-xl bg-[#F2F2F7] px-3 py-2 text-[12px] leading-snug text-[#3a3a3c]">
          Add to Home Screen to get reply alerts.
          <button
            type="button"
            className="ml-2 text-[#8E8E93]"
            onClick={() => { localStorage.setItem('m-text-a2hs', '1'); setBanner(false); }}
          >
            OK
          </button>
        </div>
      )}

      {alertState === 'ask' && (
        <div className="mx-4 mb-2 rounded-xl bg-[#F2F2F7] px-3 py-2 text-[13px] leading-snug text-black">
          Turn on notifications for new texts.
          <button
            type="button"
            className="ml-2 font-semibold text-[#007AFF]"
            onClick={() => {
              void enableAlerts(true).then(result => {
                if (result.ok) setAlertState('on');
                else if (result.reason === 'denied') setAlertState('denied');
                else {
                  setAlertState('error');
                  setAlertError(result.reason === 'save'
                    ? 'Run add-mobile-text.sql in Supabase, then tap Turn on again.'
                    : 'Could not turn on alerts. Open this from the home screen icon and try again.');
                }
              });
            }}
          >
            Turn on
          </button>
        </div>
      )}
      {alertState === 'denied' && (
        <p className="mx-4 mb-2 text-[12px] leading-snug text-[#8E8E93]">
          Notifications are blocked. On iPhone: Settings → Notifications → Gostwrk Text → Allow.
        </p>
      )}
      {alertState === 'error' && alertError && (
        <p className="mx-4 mb-2 text-[12px] leading-snug text-[#8E8E93]">{alertError}</p>
      )}

      <div className="m-scroll min-h-0 flex-1 overflow-y-auto">
        {loading && <p className="px-4 py-6 text-[13px] text-[#8E8E93]">Loading…</p>}
        {!loading && threads.length === 0 && (
          <p className="px-4 py-8 text-center text-[15px] text-[#8E8E93]">No Messages</p>
        )}
        {threads.map(thread => (
          <button
            key={thread.id}
            type="button"
            onClick={() => router.push(`/m/text/${thread.id}`)}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left active:bg-[#f2f2f7]"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#E9E9EB] text-[17px] font-semibold text-[#3a3a3c]">
              {initial(thread.name)}
            </span>
            <span className="min-w-0 flex-1 border-b border-[#C6C6C8]/80 py-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className={`truncate text-[17px] text-black ${thread.unread ? 'font-bold' : 'font-semibold'}`}>
                  {thread.name}
                </span>
                <span className="flex shrink-0 items-center gap-1 text-[15px] text-[#8E8E93]">
                  {weekdayLabel(thread.lastAt)}
                  <span aria-hidden>›</span>
                </span>
              </span>
              <span className="mt-0.5 flex items-center gap-1.5">
                {thread.unread > 0 && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#007AFF]" />}
                <span className={`truncate text-[15px] text-[#8E8E93] ${thread.unread ? 'font-semibold text-[#3a3a3c]' : ''}`}>
                  {thread.preview || thread.company || ' '}
                </span>
              </span>
            </span>
          </button>
        ))}
      </div>

      <footer className="border-t border-[#C6C6C8]/70 bg-[#F9F9F9] px-3 pt-2 pb-[max(8px,env(safe-area-inset-bottom))]">
        <FullCrmLink />
        <div className="flex items-center gap-2">
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search"
            className="h-9 min-w-0 flex-1 rounded-full bg-[#E9E9EB] px-4 text-[16px] text-black placeholder:text-[#8E8E93] focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setCompose(true)}
            aria-label="New message"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#007AFF] text-white"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 20h9" strokeLinecap="round" />
              <path d="M16.5 3.5a2.1 2.1 0 013 3L8 18l-4 1 1-4 11.5-11.5z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </footer>

      {compose && (
        <ComposeSheet
          onClose={() => { setCompose(false); setCampaign(false); }}
          campaign={campaign}
          onCampaign={() => setCampaign(true)}
          onPick={id => router.push(`/m/text/${id}`)}
        />
      )}
    </div>
  );
}

function ComposeSheet({
  onClose,
  campaign,
  onCampaign,
  onPick,
}: {
  onClose: () => void;
  campaign: boolean;
  onCampaign: () => void;
  onPick: (id: string) => void;
}) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Thread[]>([]);

  useEffect(() => {
    if (campaign) return;
    const t = setTimeout(() => {
      const qs = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : '';
      fetch(`/api/m/threads${qs}`).then(r => r.json()).then(d => setHits(d.threads ?? [])).catch(() => {});
    }, 180);
    return () => clearTimeout(t);
  }, [q, campaign]);

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-white">
      <div className="flex items-center justify-between px-3 pt-[max(10px,env(safe-area-inset-top))] pb-2">
        <button type="button" onClick={onClose} className="text-[17px] text-[#007AFF]">Cancel</button>
        <span className="text-[17px] font-semibold text-black">{campaign ? 'Campaign' : 'New Message'}</span>
        <span className="w-14" />
      </div>
      {campaign ? <CampaignPane onDone={onClose} /> : (
        <>
          <div className="px-4 pb-2">
            <input
              autoFocus
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Name or number"
              className="w-full border-b border-[#C6C6C8] py-2 text-[17px] focus:outline-none"
            />
          </div>
          <button type="button" onClick={onCampaign} className="px-4 py-3 text-left text-[17px] text-[#007AFF]">
            Campaign
          </button>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {hits.map(h => (
              <button
                key={h.id}
                type="button"
                onClick={() => onPick(h.id)}
                className="block w-full border-b border-[#C6C6C8]/70 px-4 py-3 text-left"
              >
                <span className="block text-[17px] text-black">{h.name}</span>
                {h.company && <span className="block text-[13px] text-[#8E8E93]">{h.company}</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CampaignPane({ onDone }: { onDone: () => void }) {
  const [lists, setLists] = useState<ListRow[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [listId, setListId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [body, setBody] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/m/lists').then(r => r.json()).then(d => setLists(d.lists ?? [])).catch(() => {});
    fetch('/api/m/templates').then(r => r.json()).then(d => setTemplates(d.templates ?? [])).catch(() => {});
  }, []);

  const list = lists.find(l => l.id === listId);
  const tpl = templates.find(t => t.id === templateId);
  const preview = (tpl?.body || body).trim();

  async function send() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/m/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listId,
          templateId: templateId || undefined,
          body: templateId ? undefined : body,
          confirm,
        }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || 'Send failed');
      else setResult(`Sent ${data.sent}${data.failed ? ` · ${data.failed} failed` : ''}${data.stopped ? ' · stopped after 3 errors' : ''}`);
    } catch {
      setError('Send failed');
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <p className="text-[17px] font-semibold text-black">{result}</p>
        <button type="button" onClick={onDone} className="mt-4 text-[17px] text-[#007AFF]">Back to inbox</button>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8">
      <label className="mt-2 block text-[13px] text-[#8E8E93]">List</label>
      <select
        value={listId}
        onChange={e => setListId(e.target.value)}
        className="mt-1 w-full rounded-xl bg-[#E9E9EB] px-3 py-2 text-[16px]"
      >
        <option value="">Choose a list</option>
        {lists.map(l => (
          <option key={l.id} value={l.id}>{l.name} ({l.phoneCount})</option>
        ))}
      </select>

      <label className="mt-4 block text-[13px] text-[#8E8E93]">Template</label>
      <select
        value={templateId}
        onChange={e => setTemplateId(e.target.value)}
        className="mt-1 w-full rounded-xl bg-[#E9E9EB] px-3 py-2 text-[16px]"
      >
        <option value="">One message</option>
        {templates.map(t => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>

      {!templateId && (
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Message"
          rows={4}
          className="mt-3 w-full rounded-xl bg-[#E9E9EB] px-3 py-2 text-[16px] focus:outline-none"
        />
      )}

      {list && preview && (
        <div className="mt-4 rounded-xl bg-[#F2F2F7] px-3 py-3">
          <p className="text-[13px] text-[#8E8E93]">{list.phoneCount} with a phone</p>
          <p className="mt-1 whitespace-pre-wrap text-[15px] text-black">{preview}</p>
        </div>
      )}

      <label className="mt-4 block text-[13px] text-[#8E8E93]">Type SEND to confirm</label>
      <input
        value={confirm}
        onChange={e => setConfirm(e.target.value)}
        className="mt-1 w-full rounded-xl bg-[#E9E9EB] px-3 py-2 text-[16px] tracking-widest focus:outline-none"
      />
      {error && <p className="mt-2 text-[13px] text-red-600">{error}</p>}
      <button
        type="button"
        disabled={busy || confirm !== 'SEND' || !listId || !preview || (list?.phoneCount ?? 0) === 0}
        onClick={send}
        className="mt-4 w-full rounded-xl bg-[#007AFF] py-3 text-[17px] font-semibold text-white disabled:opacity-40"
      >
        {busy ? 'Sending…' : 'Send'}
      </button>
    </div>
  );
}
