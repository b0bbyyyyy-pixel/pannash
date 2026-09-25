'use client';

import { useState, useRef, DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import { parseLeadPasteText } from '@/lib/parse-lead-paste';
import {
  compactMetricsForStorage,
  mapAnalyzerMetricsToUnderwritingFields,
  mapParsedBankFieldsToUd,
  requestedAmountFromMonthlyRevenue,
  seedBankAnalysisFromParsed,
  statementMonthFromFields,
  type StatementMonth,
} from '@/lib/bankAnalyzer';

type Method = 'choose' | 'manual' | 'paste' | 'upload' | 'fullpack';
type DocKind = 'application' | 'bank_statement';

interface Fields {
  name: string;
  email: string;
  phone: string;
  company: string;
  notes: string;
}

const EMPTY: Fields = { name: '', email: '', phone: '', company: '', notes: '' };

// Fields that map directly to the lead record (top-level columns)
const LEAD_FIELD_MAP: Record<string, keyof Fields> = {
  name: 'name', full_name: 'name',
  email: 'email', email_address: 'email',
  phone: 'phone', phone_number: 'phone', mobile: 'phone', cell: 'phone',
  company: 'company', business_name: 'company', legal_name: 'company',
  notes: 'notes',
};

// Everything else from the parser goes into underwriting_data
// These are the keys the parse-application API can return
const UW_KEYS = new Set([
  'dob','ssn','homeAddress','city','state','zip','country','creditScore',
  'creditUtilization','creditInquiries','creditLates',
  'dba','businessAddress','businessCity','businessState','businessZip',
  'industry','businessStartDate','ein','entityType','ownershipPercent',
  'businessPhone','fax',
  'requestedAmount','monthlyRevenue','avgDailyBalance','purposeOfFunds',
  'openingBalance','endingBalance','totalDeposits','totalWithdrawals',
  'nsfCount','depositCount','largestDeposit','bankName','accountNumber',
  'statementMonth','month1Revenue','month2Revenue','month3Revenue','month4Revenue',
  'owner2FirstName','owner2LastName','owner2Ownership','owner2DOB','owner2SSN',
]);

/** Split extracted fields into lead columns and underwriting_data */
function splitExtracted(raw: Record<string, unknown>): { leadFields: Partial<Fields>; uw: Record<string, string> } {
  const leadFields: Partial<Fields> = {};
  const uw: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const val = String(v ?? '').trim();
    if (!val || val === 'null' || val === 'undefined') continue;
    if (k in LEAD_FIELD_MAP) {
      leadFields[LEAD_FIELD_MAP[k]] = val;
    } else if (UW_KEYS.has(k)) {
      uw[k] = val;
    }
  }
  return { leadFields, uw };
}

function displayUwValue(k: string, v: unknown): string | null {
  if (v == null || v === '') return null;
  if (k === 'bankStatementAnalysis') return 'Saved';
  if (k === 'statementMonths') {
    const n = Array.isArray(v) ? v.length : 0;
    return n ? `${n} month${n === 1 ? '' : 's'}` : null;
  }
  if (k === 'mcaPositions') {
    const n = Array.isArray(v) ? v.length : 0;
    return n ? `${n} position${n === 1 ? '' : 's'}` : null;
  }
  if (typeof v === 'object') return null;
  return String(v);
}

async function parseDoc(file: File, documentType: DocKind) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('documentType', documentType);
  const res = await fetch('/api/leads/parse-application', { method: 'POST', body: fd, credentials: 'include' });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `Failed to parse ${file.name}`);
  return json as { fields?: Record<string, string>; documentType?: string; warning?: string };
}

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
  const [appFile, setAppFile] = useState<File | null>(null);
  const [bankFiles, setBankFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [dragOverApp, setDragOverApp] = useState(false);
  const [dragOverBank, setDragOverBank] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parseStatus, setParseStatus] = useState('');
  const [parsed, setParsed] = useState<Record<string, unknown> | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);
  const appRef = useRef<HTMLInputElement>(null);
  const bankRef = useRef<HTMLInputElement>(null);

  // Create state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // ── Helpers ────────────────────────────────────────────────────────────────
  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setFields(f => ({ ...f, [k]: e.target.value }));

  // Extra underwriting fields extracted from paste / parse
  const [pasteUW, setPasteUW] = useState<Record<string, unknown>>({});

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

    // Collect extra underwriting fields
    const uw: Record<string, string> = {};
    if (p.ssn)               uw.ssn               = p.ssn;
    if (p.ein)               uw.ein               = p.ein;
    if (p.dob)               uw.dob               = p.dob;
    if (p.homeAddress)       uw.homeAddress        = p.homeAddress;
    if (p.city)              uw.city               = p.city;
    if (p.state)             uw.state              = p.state;
    if (p.zip)               uw.zip                = p.zip;
    if (p.industry)          uw.industry           = p.industry;
    if (p.businessStartDate) uw.businessStartDate  = p.businessStartDate;
    if (p.monthlyRevenue)    uw.monthlyRevenue     = p.monthlyRevenue;
    if (p.creditScore)       uw.creditScore        = p.creditScore;
    setPasteUW(uw);

    const baseFields = [p.name, p.email, p.phone, p.company].filter(Boolean).length;
    const extraFields = Object.keys(uw).length;
    const total = baseFields + extraFields;
    setParseNote(
      total > 0
        ? `Auto-filled ${total} field${total > 1 ? 's' : ''}.`
        : 'Could not detect fields — try "Name: / Email:" labels or separate lines.'
    );
    setMethod('manual');
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
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Parse failed');

      const extractedFields: Record<string, unknown> = json.fields ?? json;
      setParsed(extractedFields);

      // Split into lead columns + underwriting_data
      const { leadFields, uw } = splitExtracted(extractedFields);
      setPasteUW(uw); // reuse pasteUW to carry UW data into createLead

      // Pre-fill the visible form fields
      setFields(prev => ({
        ...prev,
        name:    leadFields.name    || prev.name,
        email:   leadFields.email   || prev.email,
        phone:   leadFields.phone   || prev.phone,
        company: leadFields.company || prev.company,
        notes:   leadFields.notes   || prev.notes,
      }));

      const total = Object.keys(leadFields).length + Object.keys(uw).length;
      if (json.warning || total === 0) {
        setError('Limited data extracted — please review and fill in any missing fields.');
      } else {
        setError('');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Parse failed');
    } finally {
      setParsing(false);
    }
  };

  const addBankFiles = (incoming: File[]) => {
    const valid = incoming.filter(f => {
      if (f.size > 20 * 1024 * 1024) {
        setError(`${f.name} exceeds 20 MB limit.`);
        return false;
      }
      return true;
    });
    setBankFiles(prev => {
      const next = [...prev];
      for (const f of valid) {
        if (!next.some(x => x.name === f.name && x.size === f.size)) next.push(f);
      }
      return next.slice(0, 10);
    });
  };

  const parseFullPack = async () => {
    if (!appFile || bankFiles.length === 0) {
      setError('Add both the application and at least one bank statement.');
      return;
    }
    setParsing(true);
    setError('');
    setParseStatus('Parsing application…');

    const mergedRaw: Record<string, string> = {};
    const months: StatementMonth[] = [];
    let appLead: Partial<Fields> = {};
    let appUw: Record<string, string> = {};
    let bankLead: Partial<Fields> = {};

    try {
      const appJson = await parseDoc(appFile, 'application');
      const appFields = (appJson.fields ?? {}) as Record<string, string>;
      Object.assign(mergedRaw, appFields);
      const splitApp = splitExtracted(appFields);
      appLead = splitApp.leadFields;
      appUw = splitApp.uw;

      for (let i = 0; i < bankFiles.length; i++) {
        const file = bankFiles[i];
        setParseStatus(`Parsing statement ${i + 1} of ${bankFiles.length}…`);
        try {
          const bankJson = await parseDoc(file, 'bank_statement');
          const incoming = (bankJson.fields ?? {}) as Record<string, string>;
          const row = statementMonthFromFields(incoming);
          if (row) months.push(row);
          for (const [k, v] of Object.entries(incoming)) {
            if (!v) continue;
            if (!mergedRaw[k]) mergedRaw[k] = v;
          }
          const splitBank = splitExtracted(incoming);
          bankLead = { ...splitBank.leadFields, ...bankLead };
        } catch (e) {
          console.warn('Bank parse failed for', file.name, e);
        }
      }

      const bankUd = mapParsedBankFieldsToUd({
        ...mergedRaw,
        ...(months.length ? { statementMonths: months } : {}),
      });

      setParseStatus('Analyzing bank statements…');
      try {
        const fd = new FormData();
        if (bankFiles.length === 1) {
          fd.append('file', bankFiles[0], bankFiles[0].name);
        } else {
          bankFiles.forEach(f => fd.append('files', f, f.name));
        }
        const resp = await fetch('/api/bank-analyze', { method: 'POST', body: fd, credentials: 'include' });
        if (resp.ok) {
          const data = await resp.json() as {
            metrics?: Record<string, unknown>;
            per_file?: Array<{ filename: string; metrics: Record<string, unknown> }>;
            transactions?: unknown[];
            ai_assisted?: boolean;
            ai_assisted_message?: string | null;
          };
          if (data.metrics && typeof data.metrics === 'object') {
            const mapped = mapAnalyzerMetricsToUnderwritingFields(data.metrics);
            for (const [k, v] of Object.entries(mapped)) {
              if (typeof v === 'number' && v !== 0) bankUd[k] = v;
            }
            bankUd.bankStatementAnalysis = {
              analyzedAt: new Date().toISOString(),
              ai_assisted: !!data.ai_assisted,
              ai_assisted_message: data.ai_assisted_message ?? null,
              displayMetrics: compactMetricsForStorage(data.metrics),
              per_file: data.per_file,
              transactions: data.transactions ?? [],
            };
          }
        }
      } catch {
        // Analyzer is optional — parse-application already filled statement fields
      }

      if (!bankUd.bankStatementAnalysis && Object.keys(bankUd).length > 0) {
        bankUd.bankStatementAnalysis = seedBankAnalysisFromParsed(
          { ...mergedRaw, ...(months.length ? { statementMonths: months } : {}) },
          null,
        );
      }

      const mergedUw: Record<string, unknown> = { ...appUw, ...bankUd };
      setPasteUW(mergedUw);
      setParsed(mergedRaw);
      setFields(prev => ({
        ...prev,
        name:    appLead.name    || bankLead.name    || prev.name,
        email:   appLead.email   || bankLead.email   || prev.email,
        phone:   appLead.phone   || bankLead.phone   || prev.phone,
        company: appLead.company || bankLead.company || prev.company,
        notes:   appLead.notes   || bankLead.notes   || prev.notes,
      }));

      const total = Object.keys(appLead).length + Object.keys(mergedUw).length;
      if (total === 0) {
        setError('Limited data extracted — please review and fill in any missing fields.');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Parse failed');
    } finally {
      setParseStatus('');
      setParsing(false);
    }
  };

  // ── Create lead in Pipeline ────────────────────────────────────────────────
  const createLead = async () => {
    if (!fields.name.trim()) {
      setError('Name is required.');
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
          in_pipeline: true,
          ...(Object.keys(pasteUW).length > 0 ? { underwriting_data: pasteUW } : {}),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Create failed');
      const { lead } = await res.json();

      // 2. Ensure pipeline flag (create already sets it; keep this if the column was added later)
      const moved = await fetch('/api/leads/pipeline', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ leadId: lead.id }),
      });
      if (!moved.ok) {
        const err = await moved.json().catch(() => ({}));
        throw new Error(err.error || 'Created but failed to add to pipeline');
      }

      const requested = requestedAmountFromMonthlyRevenue(pasteUW.requestedAmount);
      if (requested != null) {
        await fetch('/api/leads/update-crm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ leadId: lead.id, field: 'value', value: requested }),
        });
      }

      // Full pack: persist statements only — the uploaded application is discarded
      if (method === 'fullpack' && bankFiles.length > 0) {
        for (const file of bankFiles) {
          const fd = new FormData();
          fd.append('file', file);
          fd.append('leadId', lead.id);
          fd.append('columnField', 'bank_statements');
          try {
            await fetch('/api/attachments', { method: 'POST', body: fd, credentials: 'include' });
          } catch (e) {
            console.warn('Failed to save statement', file.name, e);
          }
        }
      }

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
  const canCreate = fields.name.trim();

  const inputCls = 'w-full px-3.5 py-2.5 bg-white border border-[#e5e5e5] rounded-lg text-sm text-[#1a1a1a] placeholder:text-[#b0b0b0] focus:outline-none focus:ring-2 focus:ring-[#1a1a1a]/10 focus:border-[#1a1a1a] transition-colors';
  const labelCls = 'block text-xs font-semibold text-[#6b6b6b] uppercase tracking-wider mb-1.5';

  // Keep this as JSX, not an inner component — a nested <LeadForm /> remounts
  // on every keystroke and steals focus after the first letter.
  const leadForm = (
    <div className="space-y-3.5">
      <div className="grid grid-cols-2 gap-3.5">
        <div>
          <label className={labelCls}>Name <span className="text-red-400">*</span></label>
          <input type="text" value={fields.name} onChange={set('name')} placeholder="John Smith" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Email</label>
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
              <button onClick={() => {
                setMethod('choose');
                setError('');
                setParsed(null);
                setUploadFile(null);
                setAppFile(null);
                setBankFiles([]);
                setParseStatus('');
              }}
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
                </div>
                <svg className="w-4 h-4 text-[#d4d4d4] group-hover:text-[#6b6b6b] ml-auto flex-shrink-0 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>

              {/* Full pack */}
              <button onClick={() => setMethod('fullpack')}
                className="w-full flex items-center gap-4 p-4 rounded-xl border border-[#e5e5e5] hover:border-[#1a1a1a] hover:bg-[#fafafa] transition-all text-left group">
                <div className="w-10 h-10 rounded-xl bg-[#f5f5f5] group-hover:bg-[#ebebeb] flex items-center justify-center flex-shrink-0 transition-colors">
                  <svg className="w-5 h-5 text-[#6b6b6b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#1a1a1a]">Add full pack</p>
                </div>
                <svg className="w-4 h-4 text-[#d4d4d4] group-hover:text-[#6b6b6b] ml-auto flex-shrink-0 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}

          {/* ── MANUAL / POST-PARSE FORM ───────────────────────────────── */}
          {(method === 'manual' || (method === 'paste' && parseNote) || ((method === 'upload' || method === 'fullpack') && parsed)) && (
            <div className="space-y-5">
              {parseNote && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-medium">
                    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    {parseNote}
                  </div>
                  {Object.keys(pasteUW).length > 0 && (
                    <div className="bg-[#fafafa] border border-[#e5e5e5] rounded-lg px-3 py-2">
                      <p className="text-[10px] font-semibold text-[#9b9b9b] uppercase tracking-wider mb-1.5">Also saved to Lead Info</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {Object.entries(pasteUW).map(([k, v]) => {
                          const shown = displayUwValue(k, v);
                          if (!shown) return null;
                          return (
                            <span key={k} className="text-xs text-[#6b6b6b]">
                              <span className="font-medium text-[#1a1a1a]">{k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}:</span>{' '}{shown}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {parsed && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-medium">
                    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    {method === 'fullpack'
                      ? `Full pack parsed — ${Object.keys(parsed).length} field${Object.keys(parsed).length !== 1 ? 's' : ''} extracted. ${bankFiles.length} statement${bankFiles.length === 1 ? '' : 's'} will be saved; the application file will not.`
                      : `Application parsed — ${Object.keys(parsed).length} field${Object.keys(parsed).length !== 1 ? 's' : ''} extracted. Review below.`}
                  </div>
                  {Object.keys(pasteUW).length > 0 && (
                    <div className="bg-[#fafafa] border border-[#e5e5e5] rounded-lg px-3 py-2">
                      <p className="text-[10px] font-semibold text-[#9b9b9b] uppercase tracking-wider mb-1.5">Also saved to Lead Info</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {Object.entries(pasteUW).map(([k, v]) => {
                          const shown = displayUwValue(k, v);
                          if (!shown) return null;
                          return (
                            <span key={k} className="text-xs text-[#6b6b6b]">
                              <span className="font-medium text-[#1a1a1a]">{k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}:</span>{' '}{shown}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {leadForm}
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

          {/* ── FULL PACK ──────────────────────────────────────────────── */}
          {method === 'fullpack' && !parsed && (
            <div className="space-y-4">
              <p className="text-xs text-[#9b9b9b]">
                Upload the funding application and bank statements. Each file is marked and parsed as its type.
                Statement files are saved to the lead. The application is used for data only and is not kept.
              </p>

              <div>
                <p className="text-[10px] font-semibold text-[#9b9b9b] uppercase tracking-wider mb-1.5">Application</p>
                {!appFile ? (
                  <div
                    onDragOver={e => { e.preventDefault(); setDragOverApp(true); }}
                    onDragLeave={() => setDragOverApp(false)}
                    onDrop={e => {
                      e.preventDefault(); setDragOverApp(false);
                      if (e.dataTransfer.files[0]) setAppFile(e.dataTransfer.files[0]);
                    }}
                    onClick={() => appRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${dragOverApp ? 'border-indigo-400 bg-indigo-50' : 'border-[#d4d4d4] hover:border-[#9b9b9b] bg-[#fafafa]'}`}
                  >
                    <p className="text-sm font-semibold text-[#6b6b6b]">Drop application here</p>
                    <p className="text-xs text-[#9b9b9b] mt-1">or click to browse · PDF, DOC, DOCX · Max 20 MB</p>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 px-4 py-3 bg-[#fafafa] border border-[#e5e5e5] rounded-xl">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6b6b6b] bg-[#ebebeb] px-1.5 py-0.5 rounded">App</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#1a1a1a] truncate">{appFile.name}</p>
                      <p className="text-xs text-[#9b9b9b]">{fmtSize(appFile.size)}</p>
                    </div>
                    <button onClick={() => setAppFile(null)} className="text-[#9b9b9b] hover:text-red-500 transition-colors">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )}
                <input ref={appRef} type="file" accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png" className="hidden"
                  onChange={e => { if (e.target.files?.[0]) setAppFile(e.target.files[0]); e.target.value = ''; }} />
              </div>

              <div>
                <p className="text-[10px] font-semibold text-[#9b9b9b] uppercase tracking-wider mb-1.5">Bank statements</p>
                <div
                  onDragOver={e => { e.preventDefault(); setDragOverBank(true); }}
                  onDragLeave={() => setDragOverBank(false)}
                  onDrop={e => {
                    e.preventDefault(); setDragOverBank(false);
                    addBankFiles(Array.from(e.dataTransfer.files));
                  }}
                  onClick={() => bankRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${dragOverBank ? 'border-indigo-400 bg-indigo-50' : 'border-[#d4d4d4] hover:border-[#9b9b9b] bg-[#fafafa]'}`}
                >
                  <p className="text-sm font-semibold text-[#6b6b6b]">Drop statements here</p>
                  <p className="text-xs text-[#9b9b9b] mt-1">or click to browse · PDF, CSV · up to 10 files</p>
                </div>
                {bankFiles.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {bankFiles.map((file, idx) => (
                      <div key={`${file.name}-${file.size}-${idx}`} className="flex items-center gap-3 px-4 py-2.5 bg-[#fafafa] border border-[#e5e5e5] rounded-xl">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6b6b6b] bg-[#ebebeb] px-1.5 py-0.5 rounded">Statement</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[#1a1a1a] truncate">{file.name}</p>
                          <p className="text-xs text-[#9b9b9b]">{fmtSize(file.size)}</p>
                        </div>
                        <button
                          onClick={e => { e.stopPropagation(); setBankFiles(prev => prev.filter((_, i) => i !== idx)); }}
                          className="text-[#9b9b9b] hover:text-red-500 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <input ref={bankRef} type="file" multiple accept=".pdf,.csv,.jpg,.jpeg,.png" className="hidden"
                  onChange={e => { if (e.target.files?.length) addBankFiles(Array.from(e.target.files)); e.target.value = ''; }} />
              </div>
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

          {/* FULL PACK — Parse button */}
          {method === 'fullpack' && !parsed && (
            <>
              <button onClick={onClose}
                className="px-4 py-2.5 border border-[#e5e5e5] rounded-xl text-sm text-[#6b6b6b] hover:bg-[#f5f5f5] transition-colors">
                Cancel
              </button>
              <button onClick={parseFullPack} disabled={!appFile || bankFiles.length === 0 || parsing}
                className="flex-1 py-2.5 bg-[#1a1a1a] text-white rounded-xl text-sm font-semibold hover:bg-[#333] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
                {parsing
                  ? <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>{parseStatus || 'Parsing…'}</>
                  : 'Parse Full Pack →'}
              </button>
            </>
          )}

          {/* FORM READY — Create lead */}
          {(method === 'manual' || (method === 'paste' && parseNote) || ((method === 'upload' || method === 'fullpack') && parsed)) && (
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
