'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import FullCrmLink from '@/components/mobile/FullCrmLink';
import InboundPhoto from '@/components/mobile/InboundPhoto';
import { dayStamp, initial } from '@/components/mobile/format';
import { outboundSmsReceipt } from '@/lib/inbox/smsReceipt';
import { inboxEnglishGloss, sentInLabel } from '@/lib/inbox/languageDisplay';
import { classifyMmsFile, isAttachmentPlaceholder, MMS_COLUMN, MMS_MAX_FILES } from '@/lib/inbox/outboundMms';
import { putFileToSignedUpload, signLeadUpload } from '@/lib/uploadLeadFile';
import { useSync } from '@/lib/sync/SyncProvider';
import { usePolling } from '@/lib/sync/usePolling';

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
  body_en?: string | null;
  body_original?: string | null;
  detected_lang?: string | null;
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
  const [staged, setStaged] = useState<{ id: string; file: File; preview: string; type: string }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
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

  const { pulse, registerOpenLead } = useSync();
  useEffect(() => {
    registerOpenLead('mobile-thread', threadId);
    return () => registerOpenLead('mobile-thread', null);
  }, [threadId, registerOpenLead]);

  const lastPulseMsgAtRef = useRef('');
  useEffect(() => {
    lastPulseMsgAtRef.current = '';
  }, [threadId]);
  useEffect(() => {
    const row = pulse?.inboxChanged?.find(r => r.lead_id === threadId);
    const at = String(row?.last_message_at ?? '');
    if (!at || at === lastPulseMsgAtRef.current || sending) return;
    lastPulseMsgAtRef.current = at;
    void load();
  }, [pulse, threadId, load, sending]);

  const pollThread = useCallback(() => { if (!sending) void load(); }, [sending, load]);
  usePolling(pollThread, 20_000, !pulse, false);

  useEffect(() => {
    if (!stick.current) return;
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  function addFiles(list: FileList | File[] | null) {
    if (!list) return;
    setStaged(prev => {
      const next = [...prev];
      for (const file of Array.from(list)) {
        const check = classifyMmsFile(file);
        if (!check.ok || next.length >= MMS_MAX_FILES) continue;
        next.push({
          id: `${Date.now()}-${file.name}`,
          file,
          preview: check.type.startsWith('image/') ? URL.createObjectURL(file) : '',
          type: check.type,
        });
      }
      return next;
    });
  }

  async function send() {
    const text = draft.trim();
    const files = staged;
    if ((!text && !files.length) || sending) return;
    setDraft('');
    setStaged([]);
    setShowTpls(false);
    setSending(true);
    stick.current = true;
    const tempId = `tmp-${Date.now()}`;
    try {
      const media: { path: string; type: string; name: string }[] = [];
      for (const item of files) {
        const signed = await signLeadUpload({
          leadId: threadId,
          columnField: MMS_COLUMN,
          fileName: item.file.name,
          fileType: item.type,
          fileSize: item.file.size,
        });
        await putFileToSignedUpload(signed, item.file);
        media.push({ path: signed.path, type: item.type, name: item.file.name });
      }
      const temp: Msg = {
        id: tempId,
        direction: 'outbound',
        body: text,
        status: 'queued',
        created_at: new Date().toISOString(),
        pending: true,
        media_items: media.map(item => ({ path: item.path, type: item.type, savedAt: null })),
      };
      setMessages(prev => [...prev, temp]);
      const res = await fetch(`/api/m/threads/${threadId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text, media }),
      });
      const data = await res.json();
      const saved: Msg | undefined = data.message;
      setMessages(prev => {
        if (saved?.id && prev.some(m => m.id === saved.id)) {
          return prev.filter(m => m.id !== tempId);
        }
        return prev.map(m => {
          if (m.id !== tempId) return m;
          if (!saved) return { ...m, pending: false, status: 'failed', error_message: data.error || 'Not sent' };
          return { ...saved, pending: false };
        });
      });
    } catch {
      setMessages(prev => prev.some(m => m.id === tempId)
        ? prev.map(m => m.id === tempId
          ? { ...m, pending: false, status: 'failed', error_message: 'Not sent' }
          : m)
        : prev);
      setDraft(text);
      setStaged(files);
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
          const caption = isAttachmentPlaceholder(msg.body) && photos.length ? '' : msg.body;
          const gloss = !out ? inboxEnglishGloss(msg) : null;
          const langSent = out ? sentInLabel(msg) : null;
          return (
            <div key={msg.id}>
              {showDay && (
                <p className="py-2 text-center text-[12px] font-medium text-[#8E8E93]">{dayStamp(msg.created_at)}</p>
              )}
              <div className={`mb-1 flex ${out ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[78%] min-w-0 ${out ? 'items-end' : 'items-start'} flex flex-col`}>
                  {photos.map((photo, photoIndex) => (
                    <InboundPhoto
                      key={`${msg.id}-${photoIndex}`}
                      messageId={msg.id}
                      index={photoIndex}
                      type={photo.type}
                      canSave={!out && !!photo.sid}
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
                    className={`px-3 py-2 text-[17px] leading-snug whitespace-pre-wrap break-words [overflow-wrap:anywhere] max-w-full ${
                      out
                        ? 'rounded-[18px] bg-[#34C759] text-white'
                        : 'rounded-[18px] bg-[#E9E9EB] text-black'
                    } ${failed ? 'opacity-70' : ''} ${photos.length ? 'mt-1' : ''}`}
                  >
                    {caption}
                  </div>
                  ) : null}
                  {gloss && (
                    <p className="mt-0.5 px-1 text-[11px] text-[#8E8E93]">EN: {gloss}</p>
                  )}
                  {langSent && (
                    <p className="mt-0.5 px-1 text-[11px] text-[#8E8E93]">{langSent}</p>
                  )}
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
        {staged.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2 px-1">
            {staged.map(item => (
              <div key={item.id} className="relative">
                {item.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.preview} alt="" className="h-12 w-12 rounded-lg object-cover" />
                ) : (
                  <div className="flex h-12 w-14 items-center justify-center rounded-lg bg-white text-[10px] font-semibold">PDF</div>
                )}
                <button
                  type="button"
                  onClick={() => setStaged(prev => prev.filter(f => f.id !== item.id))}
                  className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-black text-[10px] text-white"
                >
                  ×
                </button>
              </div>
            ))}
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
            ref={fileRef}
            type="file"
            accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
            multiple
            className="hidden"
            onChange={e => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            aria-label="Attach photo or PDF"
            onClick={() => fileRef.current?.click()}
            className="mb-1 flex h-8 w-8 items-center justify-center rounded-full text-[#8E8E93]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
            </svg>
          </button>
          <input
            ref={inputRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); send(); } }}
            onPaste={e => {
              const files = Array.from(e.clipboardData.files || []);
              if (!files.length) return;
              e.preventDefault();
              addFiles(files);
            }}
            placeholder="Text Message"
            className="mb-1 h-9 min-w-0 flex-1 rounded-full border border-[#C6C6C8] bg-white px-3 text-[16px] focus:outline-none"
          />
          <button
            type="button"
            onClick={send}
            disabled={!draft.trim() && !staged.length}
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
