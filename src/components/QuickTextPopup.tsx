'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface Msg {
  id: string;
  direction: 'inbound' | 'outbound';
  body: string;
  status: string;
  twilio_sid: string | null;
  error_message: string | null;
  created_at: string;
}

export interface QuickTextLead {
  id: string;
  name: string;
  company?: string | null;
  list_id?: string | null;
  lead_status?: string | null;
  in_pipeline?: boolean | null;
}

function receipt(status: string, sid: string | null) {
  if (status === 'queued' && sid) return 'sent';
  return status;
}

function msgTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

export default function QuickTextPopup({
  lead,
  onClose,
}: {
  lead: QuickTextLead;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const campaignHold =
    !!lead.list_id &&
    lead.in_pipeline === false &&
    (!lead.lead_status || lead.lead_status === 'New Lead');

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const res = await fetch(`/api/inbox/messages?leadId=${lead.id}`);
      const data = await res.json();
      setMessages(data.messages ?? []);
    } catch {
      /* keep existing */
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [lead.id]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const t = window.setInterval(() => { void load(true); }, 4000);
    return () => window.clearInterval(t);
  }, [load]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    setText('');
    const optimistic: Msg = {
      id: `opt_${Date.now()}`,
      direction: 'outbound',
      body,
      status: 'queued',
      twilio_sid: null,
      error_message: null,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimistic]);
    try {
      const res = await fetch('/api/inbox/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id, body }),
      });
      const data = await res.json();
      if (data.message) {
        setMessages(prev => prev.map(m => m.id === optimistic.id ? { ...optimistic, ...data.message } : m));
        if (data.error) setError(data.error);
      } else {
        setError(data.error || 'Could not send');
        setMessages(prev => prev.map(m => m.id === optimistic.id ? { ...m, status: 'failed' } : m));
      }
    } catch {
      setError('Network error');
      setMessages(prev => prev.map(m => m.id === optimistic.id ? { ...m, status: 'failed' } : m));
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/20" onClick={onClose} aria-label="Close" />
      <div className="relative w-full max-w-[320px] h-[420px] bg-white border border-[#e5e5e5] shadow-xl flex flex-col">
        <div className="flex items-start justify-between gap-2 px-3 py-2.5 border-b border-[#f0f0f0] shrink-0">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#1a1a1a] truncate">{lead.name}</p>
            {lead.company && (
              <p className="text-[11px] text-[#6b6b6b] truncate">{lead.company}</p>
            )}
            {campaignHold && (
              <p className="text-[10px] text-[#9ca3af] mt-0.5">
                Campaign thread · reply → Prospect
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-[#9ca3af] hover:text-[#1a1a1a] p-0.5"
            title="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
          {loading ? (
            <p className="text-[11px] text-[#9ca3af] text-center py-8">Loading…</p>
          ) : messages.length === 0 ? (
            <p className="text-[11px] text-[#9ca3af] text-center py-8">No texts yet</p>
          ) : (
            messages.map(msg => {
              const r = receipt(msg.status, msg.twilio_sid);
              return (
                <div key={msg.id} className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] flex flex-col gap-0.5 ${msg.direction === 'outbound' ? 'items-end' : 'items-start'}`}>
                    <div
                      className={`px-2.5 py-1.5 text-[12px] leading-snug ${
                        msg.direction === 'outbound'
                          ? 'bg-blue-500 text-white'
                          : 'bg-[#f0f0f0] text-[#1a1a1a]'
                      } ${r === 'failed' ? 'opacity-60' : ''}`}
                    >
                      {msg.body}
                    </div>
                    <div className="flex items-center gap-1 px-0.5">
                      <span className="text-[9px] text-gray-400">{msgTime(msg.created_at)}</span>
                      {msg.direction === 'outbound' && (
                        <>
                          {r === 'queued' && <span className="text-[9px] text-gray-300">sending…</span>}
                          {r === 'sent' && <span className="text-[9px] text-gray-400">sent</span>}
                          {r === 'delivered' && <span className="text-[9px] text-blue-400">delivered</span>}
                          {r === 'failed' && <span className="text-[9px] text-red-500">failed</span>}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={endRef} />
        </div>

        <div className="border-t border-[#f0f0f0] px-3 py-2 shrink-0">
          {error && <p className="text-[10px] text-amber-600 mb-1">{error}</p>}
          <div className="flex items-end gap-1.5">
            <textarea
              ref={inputRef}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder="Text…"
              rows={1}
              className="flex-1 bg-[#f5f5f5] border border-[#e5e5e5] px-2.5 py-1.5 text-[12px] text-[#1a1a1a] resize-none focus:outline-none placeholder:text-[#c4c4c4]"
              style={{ maxHeight: 72 }}
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={!text.trim() || sending}
              className="shrink-0 px-2.5 py-1.5 bg-[#1a1a1a] text-white text-[11px] font-medium disabled:opacity-40"
            >
              {sending ? '…' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
