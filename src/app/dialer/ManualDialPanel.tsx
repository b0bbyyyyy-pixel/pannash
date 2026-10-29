'use client';

/**
 * Manual phone — call ANY number from the Dialer page.
 * Dials through the in-app WebRTC phone (Twilio Voice JS):
 * audio runs through your computer headset. The floating call bar
 * (mute / keypad / hangup) appears once the call starts.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { toE164, formatDisplay } from '@/lib/dialer/e164';
import { useWebPhone } from '@/components/webphone/WebPhone';
import { isMissedCall, markMissedCallsSeen, missedClockLabel } from '@/lib/telephony/missed';
import { formatBookPhone, type BookContact } from '@/lib/phoneBook';

const KEYPAD: { d: string; letters: string }[] = [
  { d: '1', letters: '' },     { d: '2', letters: 'ABC' }, { d: '3', letters: 'DEF' },
  { d: '4', letters: 'GHI' },  { d: '5', letters: 'JKL' }, { d: '6', letters: 'MNO' },
  { d: '7', letters: 'PQRS' }, { d: '8', letters: 'TUV' }, { d: '9', letters: 'WXYZ' },
  { d: '*', letters: '' },     { d: '0', letters: '+' },   { d: '#', letters: '' },
];

interface HistoryRow {
  id: string;
  lead_name: string | null;
  to_number: string | null;
  from_number: string | null;
  direction: string | null;
  status: string | null;
  started_at: string;
  answered_at: string | null;
  duration_seconds: number | null;
}

function isMissed(c: HistoryRow) {
  return isMissedCall(c);
}

function partyNumber(c: HistoryRow) {
  const from = c.from_number || '';
  const to = c.to_number || '';
  if (c.direction === 'inbound') return from || to;
  return to || from;
}

function whenLabel(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function statusLabel(c: HistoryRow) {
  if (isMissed(c)) return 'Missed';
  if (c.direction === 'inbound') return 'Incoming';
  if (c.status === 'no_answer') return 'No answer';
  if (c.status === 'busy') return 'Busy';
  if (c.status === 'failed') return 'Failed';
  if (c.status === 'canceled' || c.status === 'cancelled') return 'Canceled';
  return 'Outgoing';
}

export default function ManualDialPanel({
  onClose,
  className = '',
  initialNumber = '',
}: {
  onClose?: () => void;
  className?: string;
  initialNumber?: string;
}) {
  const [number, setNumber] = useState(initialNumber);
  const [view, setView] = useState<'pad' | 'history' | 'book'>('pad');
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [contacts, setContacts] = useState<BookContact[]>([]);
  const [bookLoading, setBookLoading] = useState(false);
  const [bookQ, setBookQ] = useState('');
  const [openId, setOpenId] = useState<string | 'new' | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftRep, setDraftRep] = useState('');
  const [draftEmails, setDraftEmails] = useState<string[]>(['']);
  const [draftPhones, setDraftPhones] = useState<string[]>(['']);
  const [savingContact, setSavingContact] = useState(false);
  const [copied, setCopied] = useState('');

  useEffect(() => {
    if (initialNumber) setNumber(initialNumber);
  }, [initialNumber]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const webphone = useWebPhone();

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/telephony/calls?limit=40');
      const data = await res.json();
      if (res.ok) setHistory(data.calls ?? []);
    } catch { /* ignore */ }
    setHistoryLoading(false);
  }, []);

  const loadBook = useCallback(async () => {
    setBookLoading(true);
    try {
      const res = await fetch('/api/phone-book', { cache: 'no-store' });
      const data = await res.json();
      if (res.ok) setContacts(Array.isArray(data.contacts) ? data.contacts : []);
    } catch { /* ignore */ }
    setBookLoading(false);
  }, []);

  useEffect(() => {
    if (view === 'history') void loadHistory();
    if (view === 'book') void loadBook();
  }, [view, loadHistory, loadBook]);

  useEffect(() => {
    if (view !== 'history' || historyLoading) return;
    markMissedCallsSeen();
  }, [view, historyLoading]);

  const e164 = toE164(number);
  const busy = webphone.status === 'connecting' || webphone.status === 'ringing' || webphone.status === 'in-call';

  const press = (d: string) => {
    if (busy) return;
    setNumber((n) => n + d);
    setError(null);
  };

  const backspace = () => setNumber((n) => n.slice(0, -1));

  const startCall = async (raw?: string) => {
    const dest = raw ? toE164(raw) : e164;
    if (!dest || busy) return;
    setError(null);
    setView('pad');
    if (raw) setNumber(raw.replace(/[^\d+*#]/g, ''));
    try {
      await webphone.connect(dest);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Call failed');
    }
  };

  const pickHistory = (c: HistoryRow) => {
    const n = partyNumber(c);
    if (!n) return;
    setNumber(n.replace(/[^\d+*#]/g, ''));
    setView('pad');
    setError(null);
  };

  const pickPhone = (raw: string) => {
    const dest = toE164(raw) || raw.replace(/[^\d+*#]/g, '');
    if (!dest) return;
    setNumber(dest.replace(/[^\d+*#]/g, ''));
    setView('pad');
    setError(null);
  };

  const copyEmail = async (email: string) => {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(email);
      setTimeout(() => setCopied(''), 1500);
    } catch { /* ignore */ }
  };

  const openContact = (c: BookContact | 'new') => {
    if (c === 'new') {
      setOpenId('new');
      setDraftName('');
      setDraftRep('');
      setDraftEmails(['']);
      setDraftPhones(['']);
      return;
    }
    setOpenId(c.id);
    setDraftName(c.name);
    setDraftRep(c.repName || '');
    setDraftEmails(c.emails.length ? [...c.emails] : ['']);
    setDraftPhones(c.phones.length ? c.phones.map(formatBookPhone) : ['']);
  };

  const saveOpenContact = async () => {
    const name = draftName.trim();
    const emails = draftEmails.map(e => e.trim()).filter(Boolean);
    const phones = draftPhones.map(p => p.trim()).filter(Boolean);
    if (!name && !emails.length && !phones.length) return;
    const current = openId && openId !== 'new' ? contacts.find(c => c.id === openId) : null;
    setSavingContact(true);
    setError(null);
    try {
      const isNew = openId === 'new' || !current;
      const res = await fetch('/api/phone-book', {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: isNew ? undefined : current?.id,
          lenderId: current?.lenderId,
          name,
          repName: draftRep.trim() || undefined,
          emails,
          phones,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Could not save contact');
        return;
      }
      const list = Array.isArray(data.contacts) ? data.contacts as BookContact[] : [];
      setContacts(list);
      const saved = (data.contact as BookContact | undefined) || list.find(c => c.id === current?.id);
      if (saved) openContact(saved);
      else setOpenId(null);
    } finally {
      setSavingContact(false);
    }
  };

  const q = bookQ.trim().toLowerCase();
  const shownContacts = q
    ? contacts.filter(c =>
        c.name.toLowerCase().includes(q)
        || (c.repName || '').toLowerCase().includes(q)
        || c.emails.some(e => e.includes(q))
        || c.phones.some(p => p.replace(/\D/g, '').includes(q.replace(/\D/g, ''))),
      )
    : contacts;
  const openContactRow = openId && openId !== 'new' ? contacts.find(c => c.id === openId) : null;

  const display = e164 ? formatDisplay(e164) : number;

  return (
    <div className={`bg-white border border-[#e5e5e5] rounded-2xl shadow-sm p-5 h-[428px] flex flex-col ${className}`}>
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <h3 className="text-sm font-semibold text-[#1a1a1a]">
            {view === 'history' ? 'History' : view === 'book' ? 'Contacts' : 'Phone'}
          </h3>
          <button
            type="button"
            onClick={() => setView(v => {
              if (v === 'book') {
                setOpenId(null);
                return 'pad';
              }
              return 'book';
            })}
            title="Contacts"
            aria-label="Contacts"
            className={`p-0.5 rounded-md focus:outline-none ${
              view === 'book' ? 'text-[#1a1a1a]' : 'text-[#9b9b9b] hover:text-[#1a1a1a]'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5 4.5A1.5 1.5 0 016.5 3H18a2 2 0 012 2v14.5a.5.5 0 01-.8.4L16 17H6.5A1.5 1.5 0 015 15.5v-11z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12.5 8.2a1.6 1.6 0 11-3.2 0 1.6 1.6 0 013.2 0zM8.7 13.2c.4-.8 1.4-1.3 2.6-1.3s2.2.5 2.6 1.3" />
            </svg>
          </button>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setView(v => v === 'history' ? 'pad' : 'history')}
            className={`text-[11px] font-medium transition-colors ${
              view === 'history' ? 'text-[#1a1a1a]' : 'text-[#6b6b6b] hover:text-[#1a1a1a]'
            }`}
          >
            {view === 'history' ? 'Keypad' : 'History'}
          </button>
          <span
            className={`inline-block w-2 h-2 rounded-full ${webphone.ready ? 'bg-green-500' : 'bg-[#d4d4d4]'}`}
            title={webphone.ready ? 'Phone ready' : 'Phone offline'}
          />
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-[#6b6b6b] hover:text-[#1a1a1a] transition-colors p-0.5 rounded hover:bg-[#f5f5f5]"
              title="Close"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {view === 'book' ? (
        <div className="flex-1 min-h-0 flex flex-col">
          {openId ? (
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="flex items-center justify-between mb-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setOpenId(null)}
                  className="text-[12px] text-[#6b6b6b] hover:text-[#1a1a1a]"
                >
                  ‹ Contacts
                </button>
                <button
                  type="button"
                  onClick={() => void saveOpenContact()}
                  disabled={savingContact}
                  className="text-[12px] font-medium text-[#1a1a1a] disabled:opacity-40"
                >
                  {savingContact ? 'Saving…' : 'Save'}
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-0.5">
                <label className="block">
                  <span className="text-[10px] text-[#9b9b9b]">Business</span>
                  <input
                    value={draftName}
                    onChange={e => setDraftName(e.target.value)}
                    className="mt-0.5 w-full border-b border-[#e5e5e5] py-1 text-[15px] font-semibold text-[#1a1a1a] focus:outline-none focus:border-[#1a1a1a]"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] text-[#9b9b9b]">Contact</span>
                  <input
                    value={draftRep}
                    onChange={e => setDraftRep(e.target.value)}
                    placeholder="Rep name"
                    className="mt-0.5 w-full border-b border-[#e5e5e5] py-1 text-[13px] text-[#1a1a1a] placeholder:text-[#d4d4d4] focus:outline-none focus:border-[#1a1a1a]"
                  />
                </label>
                <div>
                  <p className="text-[10px] text-[#9b9b9b] mb-1">Phone</p>
                  {draftPhones.map((p, i) => (
                    <div key={`ph-${i}`} className="flex items-center gap-2 mb-1.5">
                      <input
                        value={p}
                        onChange={e => setDraftPhones(list => list.map((v, n) => n === i ? e.target.value : v))}
                        placeholder="(555) 123-4567"
                        className="min-w-0 flex-1 border-b border-[#e5e5e5] py-1 text-[13px] text-[#1a1a1a] placeholder:text-[#d4d4d4] focus:outline-none focus:border-[#1a1a1a]"
                      />
                      <button
                        type="button"
                        onClick={() => void startCall(p)}
                        disabled={!webphone.ready || busy || !toE164(p)}
                        className="text-[11px] font-medium text-[#1a1a1a] disabled:opacity-30 shrink-0"
                      >
                        Call
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setDraftPhones(list => [...list, ''])}
                    className="text-[11px] text-[#6b6b6b] hover:text-[#1a1a1a]"
                  >
                    + Phone
                  </button>
                </div>
                <div>
                  <p className="text-[10px] text-[#9b9b9b] mb-1">Email</p>
                  {draftEmails.map((email, i) => (
                    <div key={`em-${i}`} className="flex items-center gap-2 mb-1.5">
                      <input
                        value={email}
                        onChange={e => setDraftEmails(list => list.map((v, n) => n === i ? e.target.value : v))}
                        placeholder="name@company.com"
                        className="min-w-0 flex-1 border-b border-[#e5e5e5] py-1 text-[13px] text-[#1a1a1a] placeholder:text-[#d4d4d4] focus:outline-none focus:border-[#1a1a1a]"
                      />
                      {email.trim() && (
                        <button
                          type="button"
                          onClick={() => void copyEmail(email.trim())}
                          className="text-[11px] text-[#6b6b6b] hover:text-[#1a1a1a] shrink-0"
                        >
                          {copied === email.trim() ? 'Copied' : 'Copy'}
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setDraftEmails(list => [...list, ''])}
                    className="text-[11px] text-[#6b6b6b] hover:text-[#1a1a1a]"
                  >
                    + Email
                  </button>
                </div>
                {openContactRow && draftPhones.some(p => toE164(p)) && (
                  <button
                    type="button"
                    onClick={() => pickPhone(draftPhones.find(p => toE164(p)) || '')}
                    className="text-[11px] text-[#6b6b6b] hover:text-[#1a1a1a]"
                  >
                    Use number on keypad
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-2 shrink-0">
                <input
                  value={bookQ}
                  onChange={e => setBookQ(e.target.value)}
                  placeholder="Search"
                  className="min-w-0 flex-1 h-8 rounded-lg bg-[#f5f5f5] px-2.5 text-[12px] text-[#1a1a1a] placeholder:text-[#b0b0b0] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => openContact('new')}
                  className="shrink-0 text-[11px] font-medium text-[#1a1a1a]"
                >
                  Add
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto -mx-1">
                {bookLoading ? (
                  <p className="text-[11px] text-[#9ca3af] text-center py-10">Loading…</p>
                ) : shownContacts.length === 0 ? (
                  <p className="text-[11px] text-[#9ca3af] text-center py-10">No contacts yet</p>
                ) : (
                  shownContacts.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => openContact(c)}
                      className="flex w-full items-center justify-between gap-2 px-1 py-2.5 border-b border-[#f0f0f0] text-left"
                    >
                      <span className="min-w-0 truncate text-[13px] font-medium text-[#1a1a1a]">{c.name}</span>
                      <span className="text-[#c4c4c4] shrink-0 text-[13px]">›</span>
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      ) : view === 'history' ? (
        <div className="flex-1 min-h-0 overflow-y-auto -mx-1">
          {historyLoading ? (
            <p className="text-[11px] text-[#9ca3af] text-center py-10">Loading…</p>
          ) : history.length === 0 ? (
            <p className="text-[11px] text-[#9ca3af] text-center py-10">No calls yet</p>
          ) : (
            history.map((c) => {
              const missed = isMissed(c);
              const n = partyNumber(c);
              const phone = n ? formatDisplay(toE164(n) || n) : '';
              const name = c.lead_name && c.lead_name !== n ? c.lead_name : null;
              return (
                <div
                  key={c.id}
                  className="w-full flex items-center justify-between gap-2 px-1 py-2 border-b border-[#f0f0f0]"
                >
                  <button
                    type="button"
                    onClick={() => pickHistory(c)}
                    className="min-w-0 text-left flex-1"
                  >
                    <p className={`text-[12px] font-medium truncate ${missed ? 'text-red-600' : 'text-[#1a1a1a]'}`}>
                      {name || phone || 'Unknown'}
                    </p>
                    <p className={`text-[10px] truncate ${missed ? 'text-red-400' : 'text-[#9ca3af]'}`}>
                      {statusLabel(c)}
                      {phone && name ? ` · ${phone}` : ''}
                    </p>
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-right leading-tight ${missed ? 'text-red-500' : 'text-[#9ca3af]'}`}>
                      {missed && (
                        <span className="block text-[10px] font-medium">{missedClockLabel(c.started_at)}</span>
                      )}
                      <span className={`block text-[10px] ${missed ? 'text-red-400' : ''}`}>{whenLabel(c.started_at)}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => void startCall(partyNumber(c))}
                      disabled={!webphone.ready || busy || !toE164(partyNumber(c))}
                      className="text-[10px] font-medium text-[#1a1a1a] hover:underline disabled:opacity-40"
                    >
                      Call
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        <>
          <input
            ref={inputRef}
            type="tel"
            value={display}
            onChange={(e) => {
              if (busy) return;
              setNumber(e.target.value.replace(/[^\d+*#]/g, ''));
              setError(null);
            }}
            onKeyDown={(e) => { if (e.key === 'Enter') void startCall(); }}
            placeholder="(555) 123-4567"
            disabled={busy}
            className="w-full text-center text-xl font-medium text-[#1a1a1a] tracking-wide border-b border-[#e5e5e5] pb-2 mb-4 focus:outline-none focus:border-[#1a1a1a] placeholder:text-[#d4d4d4] disabled:bg-transparent shrink-0"
          />

          {error && <p className="text-xs text-red-600 text-center mb-3 shrink-0">{error}</p>}

          <div className="grid grid-cols-3 gap-2 mb-4">
            {KEYPAD.map(({ d, letters }) => (
              <button
                key={d}
                onClick={() => press(d)}
                disabled={busy}
                className="py-2.5 rounded-xl border border-[#f0f0f0] hover:bg-[#f7f7f7] active:bg-[#efefef] transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <span className="block text-base font-medium text-[#1a1a1a] leading-none">{d}</span>
                <span className="block text-[8px] text-[#b0b0b0] tracking-widest mt-0.5 h-2">{letters}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {busy ? (
              <button
                onClick={webphone.hangup}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors"
              >
                Hang Up
              </button>
            ) : (
              <button
                onClick={() => void startCall()}
                disabled={!e164 || !webphone.ready}
                className="flex-1 py-2.5 rounded-xl bg-[#1a1a1a] text-white text-sm font-medium hover:bg-[#333] disabled:opacity-40 transition-colors"
              >
                Call
              </button>
            )}
            <button
              onClick={backspace}
              disabled={busy || !number}
              aria-label="Delete digit"
              className="px-3.5 py-2.5 rounded-xl border border-[#e5e5e5] text-[#6b7280] hover:bg-[#f7f7f7] disabled:opacity-40 transition-colors"
            >
              ⌫
            </button>
          </div>

          <p className="text-[10px] text-[#b0b0b0] mt-3 text-center shrink-0">
            {webphone.fromNumber
              ? `Calling from ${formatDisplay(toE164(webphone.fromNumber) || webphone.fromNumber)}`
              : busy
                ? ''
                : 'Calls run in the browser — audio through your headset.'}
          </p>
        </>
      )}
    </div>
  );
}
