'use client';

import { useEffect, useRef, useState } from 'react';
import { formatDisplay, toE164 } from '@/lib/dialer/e164';

export type CallLead = { id: string; name: string; company?: string | null; notes?: string | null };

const drafts = new Map<string, { name: string; company: string; notes: string }>();

function saveNotes(leadId: string, notes: string) {
  void fetch('/api/leads/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ leadId, field: 'notes', value: notes }),
  }).catch(() => {});
}

export default function CallLeadTools({
  phone,
  lead,
  onCreated,
  dark,
}: {
  phone: string | null;
  lead: CallLead | null;
  onCreated: (lead: CallLead) => void;
  dark?: boolean;
}) {
  const e164 = toE164(phone) || phone || '';
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const leadIdRef = useRef(lead?.id || null);
  leadIdRef.current = lead?.id || null;
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const draft = e164 ? drafts.get(e164) : null;
    dirty.current = false;
    setName(lead?.name || draft?.name || '');
    setCompany(lead?.company || draft?.company || '');
    setNotes(lead?.notes || draft?.notes || '');
    setError('');
  }, [e164, lead?.id]);

  useEffect(() => {
    if (!lead?.id || lead.notes != null) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/leads/${lead.id}`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const existing = typeof data.lead?.notes === 'string' ? data.lead.notes : '';
        if (cancelled || dirty.current) return;
        if (existing) {
          setNotes(existing);
          if (e164) {
            const prev = drafts.get(e164);
            drafts.set(e164, { name: prev?.name || '', company: prev?.company || '', notes: existing });
          }
        }
      } catch { /* keep local notes */ }
    })();
    return () => { cancelled = true; };
  }, [lead?.id, lead?.notes, e164]);

  useEffect(() => {
    if (!e164) return;
    drafts.set(e164, { name, company, notes });
  }, [e164, name, company, notes]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      const id = leadIdRef.current;
      if (id && dirty.current) saveNotes(id, notesRef.current);
    };
  }, []);

  function queueNotes(next: string) {
    dirty.current = true;
    setNotes(next);
    if (!lead?.id) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => saveNotes(lead.id, next), 500);
  }

  async function createLead() {
    if (!e164 || saving) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/leads/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim() || formatDisplay(e164),
          company: company.trim() || null,
          phone: e164,
          notes: notes.trim() || null,
          in_pipeline: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.lead?.id) {
        setError(data.error || 'Could not create lead');
        return;
      }
      const created: CallLead = {
        id: data.lead.id,
        name: data.lead.name || name.trim() || formatDisplay(e164),
        company: data.lead.company,
        notes: data.lead.notes ?? notes,
      };
      drafts.set(e164, { name: created.name, company: created.company || '', notes: created.notes || '' });
      onCreated(created);
    } catch {
      setError('Could not create lead');
    } finally {
      setSaving(false);
    }
  }

  const label = dark ? 'text-white/50' : 'text-[#9b9b9b]';
  const input = dark
    ? 'w-full bg-transparent border-b border-white/20 py-1 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-white/50'
    : 'w-full bg-transparent border-b border-[#e5e5e5] py-1 text-xs text-[#1a1a1a] placeholder:text-[#d4d4d4] focus:outline-none focus:border-[#1a1a1a]';
  const area = dark
    ? 'w-full bg-white/10 rounded-lg px-2 py-1.5 text-xs text-white placeholder:text-white/30 focus:outline-none resize-none'
    : 'w-full bg-[#f7f7f7] rounded-lg px-2 py-1.5 text-xs text-[#1a1a1a] placeholder:text-[#b0b0b0] focus:outline-none resize-none';

  return (
    <div className="space-y-2">
      {!lead && (
        <>
          <p className={`text-[10px] uppercase tracking-wider ${label}`}>New lead</p>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Name" className={input} />
          <input value={company} onChange={e => setCompany(e.target.value)} placeholder="Company" className={input} />
        </>
      )}
      {lead && (
        <p className={`truncate text-[12px] font-medium ${dark ? 'text-white' : 'text-[#1a1a1a]'}`}>
          {lead.name}
        </p>
      )}
      <textarea
        value={notes}
        onChange={e => queueNotes(e.target.value)}
        rows={lead ? 4 : 3}
        placeholder={lead ? 'Notes from this call' : 'Notes'}
        className={area}
      />
      {!lead && (
        <button
          type="button"
          onClick={() => void createLead()}
          disabled={!e164 || saving}
          className={dark
            ? 'text-[11px] font-medium text-white disabled:opacity-40'
            : 'text-[11px] font-medium text-[#1a1a1a] disabled:opacity-40'}
        >
          {saving ? 'Saving…' : 'Save as lead'}
        </button>
      )}
      {lead && (
        <p className={`text-[10px] ${label}`}>Notes save as you type</p>
      )}
      {error && <p className="text-[11px] text-red-500">{error}</p>}
    </div>
  );
}
