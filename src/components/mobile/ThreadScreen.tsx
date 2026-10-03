'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import FullCrmLink from '@/components/mobile/FullCrmLink';
import InboundPhoto from '@/components/mobile/InboundPhoto';
import { dayStamp, initial } from '@/components/mobile/format';
import { outboundSmsReceipt } from '@/lib/inbox/smsReceipt';

type MediaItem = { sid?: string; path?: string; type: string; savedAt?: string | null };

type Msg = {
  id: string;
  direction: 'inbound' | 'outbound';
  body: string;
  status: string;
  error_message?: string | null;
  created_at: string;
  pending?: boolean;
  media_items?: MediaItem[] | null;
};

type Tpl = { id: string; name: string; body: string };

function fillTpl(body: string, lead: { name?: string | null; company?: string | null }) {
  const first = (lead.name || '').trim().split(/\s+/)[0] || '';
  return body
    .replace(/\{first_name\}/gi, first)
    .replace(/\{company\}/gi, (lead.company || '').trim());
}

export default function ThreadScreen() {
  const { threadId } = useParams<{ threadId: string }>();
  const router = useRouter();
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [showTpls, setShowTpls] = useState(false);
  const [tpls, setTpls] = useState<Tpl[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const loadingOlder = useRef(false);

  const load = useCallback(async (older?: string) => {
    const qs = older ? `?cursor=${encodeURIComponent(older)}` : '';
    const res = await fetch(`/api/m/threads/${threadId}/messages${qs}`);
    if (!res.ok) return;
    const data = await res.json();
    if (data.lead?.name) setName(data.lead.name);
    if (data.lead?.company != null) setCompany(data.lead.company || '');
    const page: Msg[] = data.messages ?? [];
    setCursor(data.nextCursor ?? null);
    setMessages(prev => {
      if (!older) {
        const pageIds = new Set(page.map(m => m.id));
        const earliest = page[0]?.created_at;
        const kept = prev.filter(m =>
          !m.pending && !pageIds.has(m.id) && earliest && m.created_at < earliest
        );
        const pending = prev.filter(m => m.pending && !pageIds.has(m.id));
        return [...kept, ...page, ...pending];
      }
      const ids = new Set(prev.map(m => m.id));
      return [...page.filter(m => !ids.has(m.id)), ...prev];
    });
  }, [threadId]);

  useEffect(() => {
    fetch('/api/m/templates')
      .then(r => r.json())
      .then(d => setTpls(d.templates ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setMessages([]);
    load().then(() => {
      requestAnimationFrame(() => {
        const el = scroller.current;
        if (el) el.scrollTop = el.scrollHeight;
      });
    });
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => { if (!sending) load(); }, 4000);
    return () => clearInterval(id);
  }, [load, sending]);

  useEffect(() => {
    if (!stick.current) return;
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    const temp: Msg = {
      id: `tmp-${Date.now()}`,
      direction: 'outbound',
      body: text,
      status: 'queued',
      created_at: new Date().toISOString(),
      pending: true,
    };
    setDraft('');
    setShowTpls(false);
    setSending(true);
    stick.current = true;
    setMessages(prev => [...prev, temp]);
    try {
      const res = await fetch(`/api/m/threads/${threadId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text }),
      });
      const data = await res.json();
      const saved: Msg | undefined = data.message;
      setMessages(prev => prev.map(m => {
        if (m.id !== temp.id) return m;
        if (!saved) return { ...m, pending: false, status: 'failed', error_message: data.error || 'Not sent' };
        return { ...saved, pending: false };
      }));
    } catch {
      setMessages(prev => prev.map(m => m.id === temp.id
        ? { ...m, pending: false, status: 'failed', error_message: 'Not sent' }
        : m));
    } finally {
      setSending(false);
    }
  }

  const lastOutboundId = [...messages].reverse().find(m => m.direction === 'outbound')?.id;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-white">
      <header className="flex items-center gap-2 border-b border-[#C6C6C8]/70 px-2 pt-[max(8px,env(safe-area-inset-top))] pb-2">
        <button type="button" onClick={() => router.push('/m/text')} className="px-1 text-[28px] leading-none text-[#007AFF]" aria-label="Back">
          ‹
        </button>
        <button
          type="button"
          onClick={() => router.push(`/m/text/${threadId}/contact`)}
          className="mx-auto flex items-center gap-2 rounded-full bg-[#E9E9EB] py-1 pl-1 pr-3"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-[13px] font-semibold text-[#3a3a3c]">
            {initial(name || '?')}
          </span>
          <span className="max-w-[180px] truncate text-[15px] font-semibold text-black">{name || '…'}</span>
        </button>
        <span className="w-6" />
      </header>

      <div
        ref={scroller}
        className="m-scroll min-h-0 flex-1 overflow-y-auto px-3 py-3"
        onScroll={e => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          if (el.scrollTop < 40 && cursor && el.scrollHeight > el.clientHeight + 8 && !loadingOlder.current) {
            loadingOlder.current = true;
            const keep = el.scrollHeight;
            load(cursor).then(() => {
              requestAnimationFrame(() => {
                if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight - keep;
              });
            }).finally(() => { loadingOlder.current = false; });
          }
        }}
      >
        {messages.map((msg, i) => {
          const prev = messages[i - 1];
          const showDay = !prev || dayStamp(prev.created_at) !== dayStamp(msg.created_at);
          const out = msg.direction === 'outbound';
          const failed = msg.status === 'failed';
          const receiptStatus = outboundSmsReceipt(msg, messages);
          const receipt = msg.id === lastOutboundId && (receiptStatus === 'delivered' || receiptStatus === 'read');
          const photos = (msg.media_items ?? []).filter(item => item?.sid || item?.path);
          const caption = msg.body === 'Attachment: 1 Photo' && photos.length ? '' : msg.body;
          return (
            <div key={msg.id}>
              {showDay && (
                <p className="py-2 text-center text-[12px] font-medium text-[#8E8E93]">{dayStamp(msg.created_at)}</p>
              )}
              <div className={`mb-1 flex ${out ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[78%] ${out ? 'items-end' : 'items-start'} flex flex-col`}>
                  {photos.map((photo, photoIndex) => (
                    <InboundPhoto
                      key={`${msg.id}-${photoIndex}`}
                      messageId={msg.id}
                      index={photoIndex}
                      savedAt={photo.savedAt}
                      onSaved={(savedAt) => {
                        setMessages(prev => prev.map(m => {
                          if (m.id !== msg.id || !m.media_items) return m;
                          const next = m.media_items.map((item, n) => n === photoIndex ? { ...item, savedAt } : item);
                          return { ...m, media_items: next };
                        }));
                      }}
                    />
                  ))}
                  {caption ? (
                  <div
                    className={`px-3 py-2 text-[17px] leading-snug ${
                      out
                        ? 'rounded-[18px] bg-[#34C759] text-white'
                        : 'rounded-[18px] bg-[#E9E9EB] text-black'
                    } ${failed ? 'opacity-70' : ''} ${photos.length ? 'mt-1' : ''}`}
                  >
                    {caption}
                  </div>
                  ) : null}
                  {out && (
                    <p className="mt-0.5 px-1 text-[11px] text-[#8E8E93]">Sent as Text Message</p>
                  )}
                  {failed && (
                    <p className="px-1 text-[11px] text-red-600">{msg.error_message || 'Not Delivered'}</p>
                  )}
                  {receipt && (
                    <p className="px-1 text-[11px] text-[#8E8E93]">
                      {receiptStatus === 'read' ? 'Read' : 'Delivered'} {dayStamp(msg.created_at)}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-[#F9F9F9] px-2 pt-1 pb-[max(8px,env(safe-area-inset-bottom))]">
        <FullCrmLink />
        {showTpls && (
          <div className="mb-2 max-h-[240px] overflow-y-auto rounded-2xl bg-[#E9E9EB]">
            {tpls.length === 0 ? (
              <p className="px-4 py-3 text-[15px] text-[#8E8E93]">No templates yet. Add them in Inbox on desktop.</p>
            ) : (
              tpls.map((t, i) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setDraft(fillTpl(t.body, { name, company }));
                    setShowTpls(false);
                    requestAnimationFrame(() => inputRef.current?.focus());
                  }}
                  className={`block w-full px-4 py-2.5 text-left ${i ? 'border-t border-[#C6C6C8]/70' : ''}`}
                >
                  <span className="block truncate text-[17px] text-black">{t.name || 'Template'}</span>
                  <span className="mt-0.5 block truncate text-[13px] text-[#8E8E93]">
                    {fillTpl(t.body, { name, company })}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
        <div className="flex items-end gap-2">
          <button
            type="button"
            aria-label="Text templates"
            aria-expanded={showTpls}
            onClick={() => setShowTpls(v => !v)}
            className={`mb-1 flex h-8 w-8 items-center justify-center rounded-full text-[28px] leading-none ${
              showTpls ? 'bg-[#E9E9EB] text-[#007AFF]' : 'text-[#8E8E93]'
            }`}
          >
            +
          </button>
          <input
            ref={inputRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); send(); } }}
            placeholder="Text Message"
            className="mb-1 h-9 min-w-0 flex-1 rounded-full border border-[#C6C6C8] bg-white px-3 text-[16px] focus:outline-none"
          />
          <button
            type="button"
            onClick={send}
            disabled={!draft.trim()}
            aria-label="Send"
            className="mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-[#34C759] text-white disabled:opacity-40"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M4 12l1.4 1.4L11 7.8V20h2V7.8l5.6 5.6L20 12 12 4z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
