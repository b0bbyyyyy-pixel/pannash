'use client';

import { useState, useRef, DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import { parseLeadPasteText } from '@/lib/parse-lead-paste';

type Method = 'choose' | 'manual' | 'paste' | 'upload';

interface Fields {
  name: string;
  email: string;
  phone: string;
  company: string;
  notes: string;
}

const EMPTY: Fields = { name: '', email: '', phone: '', company: '', notes: '' };

// Parsed field labels matching parse-application output
const FIELD_MAP: Record<string, keyof Fields> = {
  name: 'name', full_name: 'name',
  email: 'email', email_address: 'email',
  phone: 'phone', phone_number: 'phone', mobile: 'phone',
  company: 'company', business_name: 'company', dba: 'company',
  notes: 'notes',
};

interface Props {
  onClose: () => void;
}

function fmtSize(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AddPipelineLeadModal({ onClose }: Props) {
  const router = useRouter();
  const [method, setMethod] = useState<Method>('choose');
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [quickPaste, setQuickPaste] = useState('');
  const [parseNote, setParseNote] = useState('');

  // Upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<Record<string, unknown> | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  // Create state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // ── Helpers ────────────────────────────────────────────────────────────────
  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setFields(f => ({ ...f, [k]: e.target.value }));

  const applyPaste = () => {
    const p = parseLeadPasteText(quickPaste);
    const merged: Fields = {
      name:    p.name    || fields.name,
      email:   p.email   || fields.email,
      phone:   p.phone   || fields.phone,
      company: p.company || fields.company,
      notes:   p.remainder
        ? fields.notes.trim() ? `${fields.notes}\n\n${p.remainder}` : p.remainder
        : fields.notes,
    };
    setFields(merged);
    const n = [p.name, p.email, p.phone, p.company].filter(Boolean).length;
    setParseNote(
      n > 0
        ? `Auto-filled ${n} field${n > 1 ? 's' : ''}.`
        : 'Could not detect fields — try "Name: / Email:" labels or separate lines.'
    );
    setMethod('manual'); // move to review form
  };

  // ── Upload + parse ─────────────────────────────────────────────────────────
  const onDrop = (e: DragEvent) => {
    e.preventDefault(); setDragOver(false);
    if (e.dataTransfer.files[0]) setUploadFile(e.dataTransfer.files[0]);
  };

  const parseApp = async () => {
    if (!uploadFile) return;
    setParsing(true);
    setError('');
    const fd = new FormData();
    fd.append('file', uploadFile);
    try {
      const res = await fetch('/api/leads/parse-application', { method: 'POST', body: fd, credentials: 'include' });
      if (!res.ok) throw new Error((await res.json()).error || 'Parse failed');
      const json = await res.json();
      setParsed(json);
      // Pre-select all keys that map to our fields
      const keys = Object.keys(json).filter(k => FIELD_MAP[k] && json[k]);
      setSelectedKeys(new Set(keys));
      // Pre-fill form
      const newFields = { ...EMPTY };
      for (const k of keys) {
        const fk = FIELD_MAP[k];
        if (fk && json[k]) newFields[fk] = String(json[k]);
      }
      setFields(newFields);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Parse failed');
    } finally {
      setParsing(false);
    }
  };

  // ── Create lead in Pipeline ────────────────────────────────────────────────
  const createLead = async () => {
    if (!fields.name.trim() || !fields.email.trim()) {
      setError('Name and email are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      // 1. Create lead
      const res = await fetch('/api/leads/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name:    fields.name.trim(),
          email:   fields.email.trim(),
          phone:   fields.phone.trim() || null,
          company: fields.company.trim() || null,
          notes:   fields.notes.trim() || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Create failed');
      const { lead } = await res.json();

      // 2. Move to pipeline
      await fetch('/api/leads/pipeline', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ leadId: lead.id }),
      });

      // 3. Navigate to lead workspace
      router.push(`/pipeline/${lead.id}`);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  // ── Render helpers ─────────────────────────────────────────────────────────
  const canCreate = fields.name.trim() && fields.email.trim();

  const inputCls = 'w-full px-3.5 py-2.5 bg-white border border-[#e5e5e5] rounded-lg text-sm text-[#1a1a1a] placeholder:text-[#b0b0b0] focus:outline-none focus:ring-2 focus:ring-[#1a1a1a]/10 focus:border-[#1a1a1a] transition-colors';
  const labelCls = 'block text-xs font-semibold text-[#6b6b6b] uppercase tracking-wider mb-1.5';

  // ── The shared lead fields form ────────────────────────────────────────────
  const LeadForm = () => (
    <div className="space-y-3.5">
      <div className="grid grid-cols-2 gap-3.5">
        <div>
          <label className={labelCls}>Name <span className="text-red-400">*</span></label>
          <input type="text" value={fields.name} onChange={set('name')} placeholder="John Smith" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Email <span className="text-red-400">*</span></label>
          <input type="email" value={fields.email} onChange={set('email')} placeholder="john@company.com" className={inputCls} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3.5">
        <div>
          <label className={labelCls}>Phone</label>
          <input type="tel" value={fields.phone} onChange={set('phone')} placeholder="555-1234" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Company</label>
          <input type="text" value={fields.company} onChange={set('company')} placeholder="Acme Corp" className={inputCls} />
        </div>
      </div>
      <div>
        <label className={labelCls}>Notes</label>
        <textarea value={fields.notes} onChange={set('notes')} placeholder="Additional information…" rows={2}
          className={`${inputCls} resize-none`} />
      </div>
    </div>
  );

  // ── Modal ──────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#f0f0f0] flex-shrink-0">
          <div className="flex items-center gap-2.5">
            {method !== 'choose' && (
              <button onClick={() => { setMethod('choose'); setError(''); setParsed(null); setUploadFile(null); }}
                className="text-[#9b9b9b] hover:text-[#1a1a1a] mr-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <div className="w-8 h-8 rounded-lg bg-[#1a1a1a] flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold text-[#1a1a1a] leading-none">Add Pipeline Lead</p>
              <p className="text-[11px] text-[#9b9b9b] mt-0.5">
                {method === 'choose' ? 'Choose how to add' : method === 'manual' ? 'Manual entry' : method === 'paste' ? 'Quick paste' : 'Upload application'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-[#9b9b9b] hover:text-[#1a1a1a] transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* ── METHOD CHOOSER ─────────────────────────────────────────── */}
          {method === 'choose' && (
            <div className="space-y-3">
              <p className="text-xs text-[#9b9b9b] mb-4">Select how you'd like to add a new lead to your pipeline.</p>

              {/* Manual */}
              <button onClick={() => setMethod('manual')}
                className="w-full flex items-center gap-4 p-4 rounded-xl border border-[#e5e5e5] hover:border-[#1a1a1a] hover:bg-[#fafafa] transition-all text-left group">
                <div className="w-10 h-10 rounded-xl bg-[#f5f5f5] group-hover:bg-[#ebebeb] flex items-center justify-center flex-shrink-0 transition-colors">
                  <svg className="w-5 h-5 text-[#6b6b6b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#1a1a1a]">Enter manually</p>
                  <p className="text-xs text-[#9b9b9b] mt-0.5">Type in name, email, phone, and company</p>
                </div>
                <svg className="w-4 h-4 text-[#d4d4d4] group-hover:text-[#6b6b6b] ml-auto flex-shrink-0 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>

              {/* Quick paste */}
              <button onClick={() => setMethod('paste')}
                className="w-full flex items-center gap-4 p-4 rounded-xl border border-[#e5e5e5] hover:border-[#1a1a1a] hover:bg-[#fafafa] transition-all text-left group">
                <div className="w-10 h-10 rounded-xl bg-[#f5f5f5] group-hover:bg-[#ebebeb] flex items-center justify-center flex-shrink-0 transition-colors">
                  <svg className="w-5 h-5 text-[#6b6b6b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#1a1a1a]">Quick paste</p>
                  <p className="text-xs text-[#9b9b9b] mt-0.5">Paste a signature, spreadsheet row, or vCard — we auto-parse it</p>
                </div>
                <svg className="w-4 h-4 text-[#d4d4d4] group-hover:text-[#6b6b6b] ml-auto flex-shrink-0 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>

              {/* Upload App */}
              <button onClick={() => setMethod('upload')}
                className="w-full flex items-center gap-4 p-4 rounded-xl border border-[#e5e5e5] hover:border-[#1a1a1a] hover:bg-[#fafafa] transition-all text-left group">
                <div className="w-10 h-10 rounded-xl bg-[#f5f5f5] group-hover:bg-[#ebebeb] flex items-center justify-center flex-shrink-0 transition-colors">
                  <svg className="w-5 h-5 text-[#6b6b6b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#1a1a1a]">Upload application</p>
                  <p className="text-xs text-[#9b9b9b] mt-0.5">Drop a PDF or DOCX — AI parses the fields directly into the lead</p>
                </div>
                <svg className="w-4 h-4 text-[#d4d4d4] group-hover:text-[#6b6b6b] ml-auto flex-shrink-0 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}

          {/* ── MANUAL / POST-PARSE FORM ───────────────────────────────── */}
          {(method === 'manual' || (method === 'paste' && parseNote) || (method === 'upload' && parsed)) && (
            <div className="space-y-5">
              {parseNote && (
                <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-medium">
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  {parseNote}
                </div>
              )}
              {parsed && (
                <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-medium">
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Application parsed — review and confirm the fields below.
                </div>
              )}
              <LeadForm />
            </div>
          )}

          {/* ── QUICK PASTE ────────────────────────────────────────────── */}
          {method === 'paste' && !parseNote && (
            <div className="space-y-4">
              <p className="text-xs text-[#9b9b9b]">Paste a contact signature, vCard, or a row of spreadsheet data. We'll extract name, email, phone, and company automatically.</p>
              <textarea
                value={quickPaste}
                onChange={e => setQuickPaste(e.target.value)}
                autoFocus
                rows={7}
                placeholder={`Paste anything here, e.g:\n\nJohn Smith\nAcme Corp\njohn@acme.com\n(555) 123-4567`}
                className="w-full px-3.5 py-3 border border-[#e5e5e5] rounded-xl text-sm font-mono text-[#1a1a1a] bg-[#fafafa] placeholder:text-[#b0b0b0] focus:outline-none focus:ring-2 focus:ring-[#1a1a1a]/10 focus:border-[#1a1a1a] resize-none"
              />
            </div>
          )}

          {/* ── UPLOAD APP ─────────────────────────────────────────────── */}
          {method === 'upload' && !parsed && (
            <div className="space-y-4">
              <p className="text-xs text-[#9b9b9b]">Upload the merchant's funding application (PDF, DOC, DOCX). Our AI will extract their name, email, phone, company, and financial info.</p>

              {!uploadFile ? (
                <div
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={onDrop}
                  onClick={() => fileRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-[#d4d4d4] hover:border-[#9b9b9b] bg-[#fafafa]'}`}
                >
                  <svg className="w-10 h-10 mx-auto text-[#c4c4c4] mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  <p className="text-sm font-semibold text-[#6b6b6b]">Drop application here</p>
                  <p className="text-xs text-[#9b9b9b] mt-1">or click to browse · PDF, DOC, DOCX · Max 20 MB</p>
                </div>
              ) : (
                <div className="flex items-center gap-3 px-4 py-3.5 bg-[#fafafa] border border-[#e5e5e5] rounded-xl">
                  <div className="w-10 h-10 rounded-lg bg-white border border-[#e5e5e5] flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-[#9b9b9b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#1a1a1a] truncate">{uploadFile.name}</p>
                    <p className="text-xs text-[#9b9b9b]">{fmtSize(uploadFile.size)}</p>
                  </div>
                  <button onClick={() => setUploadFile(null)} className="text-[#9b9b9b] hover:text-red-500 transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
              <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.txt" className="hidden"
                onChange={e => { if (e.target.files?.[0]) setUploadFile(e.target.files[0]); }} />
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="mt-3 text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-6 py-4 border-t border-[#f0f0f0] flex gap-2.5">
          {/* CHOOSE — no footer buttons */}
          {method === 'choose' && (
            <button onClick={onClose}
              className="flex-1 py-2.5 border border-[#e5e5e5] rounded-xl text-sm text-[#6b6b6b] hover:bg-[#f5f5f5] transition-colors">
              Cancel
            </button>
          )}

          {/* PASTE — Parse button first, then create */}
          {method === 'paste' && !parseNote && (
            <>
              <button onClick={onClose}
                className="px-4 py-2.5 border border-[#e5e5e5] rounded-xl text-sm text-[#6b6b6b] hover:bg-[#f5f5f5] transition-colors">
                Cancel
              </button>
              <button onClick={applyPaste} disabled={!quickPaste.trim()}
                className="flex-1 py-2.5 bg-[#1a1a1a] text-white rounded-xl text-sm font-semibold hover:bg-[#333] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                Parse & Fill Fields →
              </button>
            </>
          )}

          {/* UPLOAD — Parse button */}
          {method === 'upload' && !parsed && (
            <>
              <button onClick={onClose}
                className="px-4 py-2.5 border border-[#e5e5e5] rounded-xl text-sm text-[#6b6b6b] hover:bg-[#f5f5f5] transition-colors">
                Cancel
              </button>
              <button onClick={parseApp} disabled={!uploadFile || parsing}
                className="flex-1 py-2.5 bg-[#1a1a1a] text-white rounded-xl text-sm font-semibold hover:bg-[#333] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
                {parsing
                  ? <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Parsing…</>
                  : 'Parse Application →'}
              </button>
            </>
          )}

          {/* FORM READY — Create lead */}
          {(method === 'manual' || (method === 'paste' && parseNote) || (method === 'upload' && parsed)) && (
            <>
              <button onClick={onClose}
                className="px-4 py-2.5 border border-[#e5e5e5] rounded-xl text-sm text-[#6b6b6b] hover:bg-[#f5f5f5] transition-colors">
                Cancel
              </button>
              <button onClick={createLead} disabled={!canCreate || saving}
                className="flex-1 py-2.5 bg-[#1a1a1a] text-white rounded-xl text-sm font-semibold hover:bg-[#333] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
                {saving
                  ? <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Creating…</>
                  : <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Create Pipeline Lead
                    </>}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
