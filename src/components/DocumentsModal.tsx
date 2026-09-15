'use client';

import { useState, useEffect, useRef, useCallback, DragEvent } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Attachment {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  file_type: string;
  column_field: string;
  created_at: string;
}

interface DocumentsModalProps {
  leadId: string;
  leadName: string;
  leadCompany?: string | null;
  /** If provided, "Analyze" buttons will call this for PDFs */
  onAnalyze?: (attachment: Attachment) => void;
  /** If provided, "Parse as Application" toggle will appear and call this on apply */
  onApplyParsed?: (fields: Record<string, string>, selected: Set<string>) => Promise<void>;
  onClose: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fileIcon(type: string) {
  if (type.includes('pdf')) return (
    <div className="w-9 h-9 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
      <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 24 24">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM8 17v-1h8v1H8zm0-3v-1h8v1H8zm0-3v-1h5v1H8z"/>
      </svg>
    </div>
  );
  if (type.includes('image')) return (
    <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
      <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    </div>
  );
  if (type.includes('sheet') || type.includes('excel') || type.includes('csv')) return (
    <div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
      <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 24 24">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM7 13h2v2H7v-2zm0 3h2v2H7v-2zm3-3h2v2h-2v-2zm0 3h2v2h-2v-2zm3-3h2v2h-2v-2zm0 3h2v2h-2v-2z"/>
      </svg>
    </div>
  );
  return (
    <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
      <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    </div>
  );
}

// ── Parse review helpers ───────────────────────────────────────────────────────
const FIELD_LABELS: Record<string, string> = {
  // Application fields
  name: 'Full Name', email: 'Email', phone: 'Mobile Phone', dob: 'Date of Birth',
  ssn: 'SSN', homeAddress: 'Home Address', city: 'City', state: 'State', zip: 'ZIP',
  creditScore: 'Credit Score', company: 'Legal Business Name', dba: 'DBA',
  businessAddress: 'Business Address', businessCity: 'Business City',
  businessState: 'Business State', businessZip: 'Business ZIP',
  industry: 'Industry', businessStartDate: 'Business Start Date', ein: 'EIN',
  entityType: 'Entity Type', ownershipPercent: 'Ownership %', businessPhone: 'Business Phone',
  fax: 'Fax', requestedAmount: 'Amount Requested', monthlyRevenue: 'Avg Monthly Revenue',
  avgDailyBalance: 'Avg Daily Balance', purposeOfFunds: 'Use of Funds',
  owner2FirstName: 'Owner 2 First Name', owner2LastName: 'Owner 2 Last Name',
  owner2Ownership: 'Owner 2 Ownership %', owner2DOB: 'Owner 2 DOB', owner2SSN: 'Owner 2 SSN',
  // Bank statement fields
  bankName: 'Bank Name', accountNumber: 'Account # (last 4)', statementMonth: 'Statement Month',
  openingBalance: 'Opening Balance', endingBalance: 'Ending Balance',
  totalDeposits: 'Total Deposits', totalWithdrawals: 'Total Withdrawals',
  nsfCount: 'NSF / OD Count', depositCount: 'Deposit Count', largestDeposit: 'Largest Deposit',
  month1Revenue: 'Month 1 Deposits', month2Revenue: 'Month 2 Deposits',
  month3Revenue: 'Month 3 Deposits', month4Revenue: 'Month 4 Deposits',
};

const PARSE_SECTIONS = [
  { label: 'Person',          keys: ['name','email','phone','dob','ssn','homeAddress','city','state','zip','creditScore'] },
  { label: 'Company',         keys: ['company','dba','businessAddress','businessCity','businessState','businessZip','industry','businessStartDate','ein','entityType','ownershipPercent','businessPhone','fax'] },
  { label: 'Deal / Financials', keys: ['requestedAmount','monthlyRevenue','avgDailyBalance','purposeOfFunds'] },
  { label: 'Owner 2',         keys: ['owner2FirstName','owner2LastName','owner2Ownership','owner2DOB','owner2SSN'] },
  { label: 'Bank Statement',  keys: ['bankName','accountNumber','statementMonth','openingBalance','endingBalance','totalDeposits','totalWithdrawals','nsfCount','depositCount','largestDeposit','month1Revenue','month2Revenue','month3Revenue','month4Revenue'] },
];

const ALLOWED_TYPES = '.pdf,.doc,.docx,.jpg,.jpeg,.png,.xls,.xlsx';
const MAX_SIZE_MB   = 20;
const MAX_FILES     = 10;

// ── Main Modal ────────────────────────────────────────────────────────────────
export default function DocumentsModal({
  leadId, leadName, leadCompany, onAnalyze, onApplyParsed, onClose,
}: DocumentsModalProps) {
  const [attachments, setAttachments]   = useState<Attachment[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [sortOrder, setSortOrder]       = useState<'newest' | 'oldest' | 'name'>('newest');
  const [selected, setSelected]         = useState<Set<string>>(new Set());

  // Upload sub-modal
  const [showUpload, setShowUpload]       = useState(false);
  const [dragOver, setDragOver]           = useState(false);
  const [pendingFiles, setPendingFiles]   = useState<File[]>([]);
  const [uploading, setUploading]         = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, 'pending' | 'done' | 'error'>>({});

  // "Parse as Application" flow
  const [parseAsApp, setParseAsApp]       = useState(true); // ON by default
  const [parseStep, setParseStep]         = useState<'upload' | 'parsing' | 'review'>('upload');
  const [parsedFields, setParsedFields]   = useState<Record<string, string>>({});
  const [parsedSelected, setParsedSelected] = useState<Set<string>>(new Set());
  const [applying, setApplying]           = useState(false);

  // Rename / download / delete / re-extract
  const [renamingId, setRenamingId]   = useState<string | null>(null);
  const [renameVal, setRenameVal]     = useState('');
  const [downloading, setDownloading] = useState<string | null>(null);
  const [deleting, setDeleting]       = useState<string | null>(null);
  const [reExtracting, setReExtracting] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/attachments?leadId=${leadId}`, { credentials: 'include' });
      if (res.ok) {
        const { attachments: data } = await res.json();
        setAttachments(data || []);
      }
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  // ── Reset upload sub-modal ─────────────────────────────────────────────────
  const closeUpload = useCallback(() => {
    if (uploading) return;
    setShowUpload(false);
    setPendingFiles([]);
    setUploadProgress({});
    setParseAsApp(false);
    setParseStep('upload');
    setParsedFields({});
    setParsedSelected(new Set());
  }, [uploading]);

  // ── Sort + filter ──────────────────────────────────────────────────────────
  const displayed = attachments
    .filter(a => !search || a.file_name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortOrder === 'name')   return a.file_name.localeCompare(b.file_name);
      if (sortOrder === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  // ── Selection helpers ──────────────────────────────────────────────────────
  const toggleSelect = (id: string) =>
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const selectAll = () =>
    setSelected(displayed.length === selected.size ? new Set() : new Set(displayed.map(a => a.id)));

  // ── Drop handlers ──────────────────────────────────────────────────────────
  const onDragOver  = (e: DragEvent) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = () => setDragOver(false);
  const onDrop      = (e: DragEvent) => {
    e.preventDefault(); setDragOver(false);
    addFiles(Array.from(e.dataTransfer.files));
  };

  const addFiles = (files: File[]) => {
    const valid = files.filter(f => {
      if (f.size > MAX_SIZE_MB * 1024 * 1024) { alert(`${f.name} exceeds ${MAX_SIZE_MB} MB limit.`); return false; }
      return true;
    });
    setPendingFiles(prev => [...prev, ...valid].slice(0, MAX_FILES));
  };

  const removePending = (idx: number) =>
    setPendingFiles(prev => prev.filter((_, i) => i !== idx));

  // ── Upload ─────────────────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!pendingFiles.length) return;
    setUploading(true);
    const progress: Record<string, 'pending' | 'done' | 'error'> = {};
    pendingFiles.forEach(f => { progress[f.name] = 'pending'; });
    setUploadProgress({ ...progress });

    const newAttachments: Attachment[] = [];

    for (const file of pendingFiles) {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('leadId', leadId);
      fd.append('columnField', 'documents');
      try {
        const res = await fetch('/api/attachments', { method: 'POST', body: fd, credentials: 'include' });
        if (res.ok) {
          const { attachment } = await res.json();
          newAttachments.push(attachment);
          setUploadProgress(p => ({ ...p, [file.name]: 'done' }));
        } else {
          setUploadProgress(p => ({ ...p, [file.name]: 'error' }));
        }
      } catch {
        setUploadProgress(p => ({ ...p, [file.name]: 'error' }));
      }
    }

    setAttachments(prev => [...newAttachments, ...prev]);
    setUploading(false);

    // If auto-extract is ON, process ALL uploaded files and merge results
    if (parseAsApp && onApplyParsed && newAttachments.length > 0) {
      setPendingFiles([]);
      setUploadProgress({});
      setParseStep('parsing');

      const mergedFields: Record<string, string> = {};
      let anySuccess = false;

      for (const file of pendingFiles) {
        const fd = new FormData();
        fd.append('file', file);
        try {
          const res  = await fetch('/api/leads/parse-application', { method: 'POST', body: fd, credentials: 'include' });
          const json = await res.json();
          if (res.ok && json.fields && Object.keys(json.fields).length > 0) {
            // Merge — later files don't overwrite already-filled fields
            for (const [k, v] of Object.entries(json.fields as Record<string, string>)) {
              if (!mergedFields[k]) mergedFields[k] = v;
            }
            anySuccess = true;
          }
        } catch {
          console.warn('Parse failed for', file.name);
        }
      }

      if (anySuccess && Object.keys(mergedFields).length > 0) {
        setParsedFields(mergedFields);
        setParsedSelected(new Set(Object.keys(mergedFields)));
        setParseStep('review');
      } else {
        alert('Could not extract data from any of the uploaded files. They were uploaded successfully — you can re-extract individually later.');
        closeUpload();
      }
    } else {
      setPendingFiles([]);
      setUploadProgress({});
      setShowUpload(false);
    }
  };

  // ── Apply parsed fields ────────────────────────────────────────────────────
  const handleApplyFields = async () => {
    if (!onApplyParsed) return;
    setApplying(true);
    await onApplyParsed(parsedFields, parsedSelected);
    setApplying(false);
    closeUpload();
  };

  // ── Download ───────────────────────────────────────────────────────────────
  const handleDownload = async (id: string) => {
    setDownloading(id);
    try {
      const res = await fetch(`/api/attachments/download?id=${id}`, { credentials: 'include' });
      if (res.ok) {
        const { url, fileName } = await res.json();
        const link = document.createElement('a');
        link.href = url; link.download = fileName;
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
      }
    } finally { setDownloading(null); }
  };

  const handleView = async (id: string) => {
    const res = await fetch(`/api/attachments/download?id=${id}`, { credentials: 'include' });
    if (res.ok) { const { url } = await res.json(); window.open(url, '_blank', 'noopener,noreferrer'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this document permanently?')) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/attachments?id=${id}`, { method: 'DELETE', credentials: 'include' });
      if (res.ok) setAttachments(prev => prev.filter(a => a.id !== id));
    } finally { setDeleting(null); }
  };

  // Re-extract: download the file from storage then send to parse-application
  const handleReExtract = async (a: Attachment) => {
    if (!onApplyParsed) return;
    setReExtracting(a.id);
    try {
      // Get signed URL for the file
      const dlRes = await fetch(`/api/attachments/download?id=${a.id}`, { credentials: 'include' });
      if (!dlRes.ok) throw new Error('Could not fetch file');
      const { url } = await dlRes.json();
      const fileBlob = await fetch(url).then(r => r.blob());
      const file = new File([fileBlob], a.file_name, { type: a.file_type || 'application/pdf' });
      const fd = new FormData();
      fd.append('file', file);
      const res  = await fetch('/api/leads/parse-application', { method: 'POST', body: fd, credentials: 'include' });
      const json = await res.json();
      if (res.ok && json.fields && Object.keys(json.fields).length > 0) {
        setParsedFields(json.fields);
        setParsedSelected(new Set(Object.keys(json.fields)));
        setParseStep('review');
        setShowUpload(true); // Show upload panel so review is visible
      } else {
        alert(json.error || 'Could not extract data from this file.');
      }
    } catch (e) {
      alert('Re-extraction failed: ' + (e instanceof Error ? e.message : 'unknown error'));
    } finally {
      setReExtracting(null);
    }
  };

  const startRename = (a: Attachment) => { setRenamingId(a.id); setRenameVal(a.file_name); };
  const saveRename  = async () => {
    if (!renamingId || !renameVal.trim()) return;
    const res = await fetch('/api/attachments', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: renamingId, file_name: renameVal.trim() }),
      credentials: 'include',
    });
    if (res.ok) {
      const { attachment } = await res.json();
      setAttachments(prev => prev.map(a => a.id === renamingId ? { ...a, file_name: attachment.file_name } : a));
    }
    setRenamingId(null);
  };

  const isBankStatement = (a: Attachment) =>
    a.file_type.includes('pdf') || a.file_name.toLowerCase().includes('bank') || a.file_name.toLowerCase().includes('statement');

  const displayName = leadCompany || leadName;
  const parsedCount = Object.keys(parsedFields).length;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Main modal ────────────────────────────────────────────────────── */}
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
        <div
          className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5 border-b border-[#f0f0f0] flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-bold text-[#1a1a1a]">Documents</h2>
                <p className="text-xs text-[#9b9b9b] flex items-center gap-1.5 mt-0.5">
                  {displayName}
                  <span className="inline-flex items-center bg-[#f0f0f0] text-[#6b6b6b] text-[11px] font-mono px-1.5 py-0.5 rounded">
                    # {leadId.slice(0, 5).toUpperCase()}
                  </span>
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-[#9b9b9b] hover:text-[#1a1a1a] hover:bg-[#f5f5f5] transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Toolbar */}
          <div className="px-6 py-3.5 border-b border-[#f0f0f0] flex items-center gap-3 flex-shrink-0">
            <span className="text-xs font-semibold text-[#6b6b6b] whitespace-nowrap">
              {loading ? '…' : `${displayed.length} OF ${attachments.length}`}
            </span>
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9b9b9b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-[#e5e5e5] rounded-lg bg-[#fafafa] text-[#1a1a1a] placeholder:text-[#9b9b9b] focus:outline-none focus:ring-1 focus:ring-[#1a1a1a] focus:bg-white"
              />
            </div>
            <select
              value={sortOrder} onChange={e => setSortOrder(e.target.value as typeof sortOrder)}
              className="text-xs border border-[#e5e5e5] rounded-lg px-2.5 py-1.5 bg-white text-[#1a1a1a] focus:outline-none focus:ring-1 focus:ring-[#1a1a1a] cursor-pointer"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="name">Name A–Z</option>
            </select>
            <button
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#22c55e] text-white text-xs font-semibold rounded-lg hover:bg-[#16a34a] transition-colors whitespace-nowrap"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Upload Files
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="py-16 text-center text-sm text-[#9b9b9b]">Loading documents…</div>
            ) : displayed.length === 0 ? (
              <div className="py-16 text-center">
                <svg className="w-10 h-10 mx-auto text-[#d4d4d4] mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-sm font-medium text-[#6b6b6b]">{search ? 'No documents match your search' : 'No documents yet'}</p>
                {!search && (
                  <button onClick={() => setShowUpload(true)} className="mt-3 text-xs text-[#5a7fc7] hover:text-[#4a6fb7] underline underline-offset-2">
                    Upload the first document
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="px-5 py-2.5 flex items-center gap-3 border-b border-[#f5f5f5]">
                  <input
                    type="checkbox"
                    checked={selected.size === displayed.length && displayed.length > 0}
                    onChange={selectAll}
                    className="w-4 h-4 rounded border-[#d4d4d4] accent-[#1a1a1a] cursor-pointer"
                  />
                  <span className="text-[11px] font-semibold text-[#9b9b9b] uppercase tracking-wider">Select All</span>
                </div>

                {displayed.map(a => {
                  const isRenaming = renamingId === a.id;
                  return (
                    <div
                      key={a.id}
                      className={`px-5 py-3.5 flex items-center gap-3 border-b border-[#f5f5f5] hover:bg-[#fafafa] transition-colors ${deleting === a.id ? 'opacity-40' : ''}`}
                    >
                      <input
                        type="checkbox" checked={selected.has(a.id)} onChange={() => toggleSelect(a.id)}
                        className="w-4 h-4 rounded border-[#d4d4d4] accent-[#1a1a1a] cursor-pointer flex-shrink-0"
                      />
                      {fileIcon(a.file_type)}
                      <div className="flex-1 min-w-0">
                        {isRenaming ? (
                          <div className="flex items-center gap-2">
                            <input
                              autoFocus type="text" value={renameVal}
                              onChange={e => setRenameVal(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') setRenamingId(null); }}
                              className="flex-1 px-2 py-0.5 text-sm border border-[#5a7fc7] rounded focus:outline-none"
                            />
                            <button onClick={saveRename} className="text-xs text-[#5a7fc7] font-medium hover:text-[#4a6fb7]">Save</button>
                            <button onClick={() => setRenamingId(null)} className="text-xs text-[#9b9b9b] hover:text-[#1a1a1a]">Cancel</button>
                          </div>
                        ) : (
                          <p className="text-sm font-semibold text-[#1a1a1a] truncate leading-tight">{a.file_name}</p>
                        )}
                        <p className="text-[11px] text-[#9b9b9b] mt-0.5 truncate">
                          {a.file_path.split('/').pop()} · {fmtSize(a.file_size)} · {fmtDate(a.created_at)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {onAnalyze && isBankStatement(a) && (
                          <button
                            onClick={() => { onAnalyze(a); onClose(); }}
                            className="flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-md text-[11px] font-semibold transition-colors"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                            Analyze
                          </button>
                        )}
                        {/* Re-extract — only show when onApplyParsed is wired */}
                        {onApplyParsed && (
                          <button
                            onClick={() => handleReExtract(a)}
                            disabled={reExtracting === a.id}
                            title="Re-extract & fill lead data"
                            className="p-1.5 rounded-lg text-indigo-500 hover:bg-indigo-50 transition-colors disabled:opacity-40"
                          >
                            {reExtracting === a.id ? (
                              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                            ) : (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
                            )}
                          </button>
                        )}
                        <button onClick={() => handleView(a.id)} title="View" className="p-1.5 rounded-lg text-emerald-500 hover:bg-emerald-50 transition-colors">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </button>
                        <button onClick={() => handleDownload(a.id)} disabled={downloading === a.id} title="Download" className="p-1.5 rounded-lg text-emerald-500 hover:bg-emerald-50 transition-colors disabled:opacity-40">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                        </button>
                        <button onClick={() => startRename(a)} title="Rename" className="p-1.5 rounded-lg text-blue-400 hover:bg-blue-50 transition-colors">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button onClick={() => handleDelete(a.id)} disabled={deleting === a.id} title="Delete" className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 transition-colors disabled:opacity-40">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Upload + optional parse sub-modal ────────────────────────────────── */}
      {showUpload && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4"
          onClick={() => closeUpload()}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* ── Upload step ──────────────────────────────────────────────── */}
            {parseStep === 'upload' && (
              <>
                <div className="flex items-center justify-between px-6 py-5 border-b border-[#f0f0f0]">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center">
                      <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-[#1a1a1a]">Upload Documents</h3>
                      <p className="text-xs text-[#9b9b9b]">Select files, then upload.</p>
                    </div>
                  </div>
                  {!uploading && (
                    <button onClick={closeUpload} className="p-1.5 rounded-lg text-[#9b9b9b] hover:text-[#1a1a1a] hover:bg-[#f5f5f5]">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>

                <div className="px-6 pt-5 pb-2">
                  {/* Drop zone */}
                  <div
                    onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                      dragOver ? 'border-emerald-400 bg-emerald-50' : 'border-[#d4d4d4] hover:border-[#9b9b9b] bg-[#fafafa] hover:bg-white'
                    }`}
                  >
                    <div className="w-12 h-12 rounded-xl bg-white border border-[#e5e5e5] shadow-sm flex items-center justify-center mx-auto mb-3">
                      <svg className="w-6 h-6 text-[#6b6b6b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                    </div>
                    <p className="text-sm font-semibold text-[#1a1a1a] mb-1">Drag &amp; drop files here</p>
                    <p className="text-sm text-[#9b9b9b]">or <span className="text-emerald-600 underline underline-offset-2 font-medium">click to browse</span></p>
                    <p className="text-[11px] text-[#9b9b9b] mt-3">
                      PDF, DOC, DOCX, XLS, XLSX, JPG, JPEG, PNG · Max {MAX_SIZE_MB} MB each · up to {MAX_FILES} files
                    </p>
                  </div>
                  <input
                    ref={fileInputRef} type="file" multiple accept={ALLOWED_TYPES} className="hidden"
                    onChange={e => { if (e.target.files) addFiles(Array.from(e.target.files)); }}
                  />
                </div>

                {/* Pending file list */}
                {pendingFiles.length > 0 && (
                  <div className="px-6 py-3 max-h-40 overflow-y-auto space-y-2">
                    {pendingFiles.map((f, i) => {
                      const prog = uploadProgress[f.name];
                      return (
                        <div key={i} className="flex items-center gap-3 p-2.5 bg-[#fafafa] rounded-lg border border-[#f0f0f0]">
                          {fileIcon(f.type)}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-[#1a1a1a] truncate">{f.name}</p>
                            <p className="text-[11px] text-[#9b9b9b]">{fmtSize(f.size)}</p>
                          </div>
                          {prog === 'done'    && <span className="text-emerald-500 text-xs font-semibold">✓ Done</span>}
                          {prog === 'error'   && <span className="text-red-500 text-xs font-semibold">✗ Failed</span>}
                          {prog === 'pending' && <span className="text-[#9b9b9b] text-xs">Uploading…</span>}
                          {!prog && !uploading && (
                            <button onClick={() => removePending(i)} className="text-[#9b9b9b] hover:text-red-500 transition-colors">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Auto-extract toggle — shown whenever onApplyParsed is wired */}
                {onApplyParsed && pendingFiles.length > 0 && (
                  <div className="px-6 pb-2 pt-1">
                    <label className="flex items-start gap-3 p-3 bg-indigo-50 border border-indigo-100 rounded-xl cursor-pointer hover:bg-indigo-100/60 transition-colors">
                      <input
                        type="checkbox"
                        checked={parseAsApp}
                        onChange={e => setParseAsApp(e.target.checked)}
                        className="mt-0.5 w-4 h-4 rounded border-indigo-300 accent-indigo-600 cursor-pointer flex-shrink-0"
                      />
                      <div>
                        <p className="text-xs font-semibold text-indigo-800">
                          ✦ Auto-extract &amp; fill lead data
                          <span className="ml-1.5 text-[10px] font-medium bg-indigo-600 text-white px-1.5 py-0.5 rounded-full">ON</span>
                        </p>
                        <p className="text-[11px] text-indigo-600 mt-0.5">
                          AI scans all uploaded files — applications fill contact/business fields, bank statements fill financial fields. Works on scanned PDFs too.
                        </p>
                      </div>
                    </label>
                  </div>
                )}

                <div className="px-6 py-5">
                  <button
                    onClick={handleUpload}
                    disabled={uploading || pendingFiles.length === 0}
                    className="w-full py-3.5 bg-[#22c55e] text-white rounded-xl text-sm font-semibold hover:bg-[#16a34a] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                  >
                    {uploading ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                        </svg>
                        Uploading…
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        {parseAsApp ? 'Upload & Extract Data' : 'Save & Upload Files'}
                      </>
                    )}
                  </button>
                </div>
              </>
            )}

            {/* ── Parsing step ─────────────────────────────────────────────── */}
            {parseStep === 'parsing' && (
              <div className="py-20 flex flex-col items-center gap-4 px-6">
                <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center">
                  <svg className="w-7 h-7 text-blue-600 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-[#1a1a1a]">Documents uploaded ✓ — now extracting data…</p>
                  <p className="text-xs text-[#9b9b9b] mt-1">AI is scanning for application fields &amp; financial data. Takes ~10–20 seconds.</p>
                </div>
              </div>
            )}

            {/* ── Review step ───────────────────────────────────────────────── */}
            {parseStep === 'review' && (
              <>
                <div className="flex items-center justify-between px-6 py-5 border-b border-[#f0f0f0]">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center">
                      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-[#1a1a1a]">Review Parsed Fields</h3>
                      <p className="text-xs text-[#9b9b9b]">{parsedCount} field{parsedCount !== 1 ? 's' : ''} found — uncheck any you don&apos;t want to apply</p>
                    </div>
                  </div>
                </div>

                <div className="px-6 py-4 max-h-[55vh] overflow-y-auto">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] text-[#9b9b9b]">Select which fields to apply to this lead</span>
                    <div className="flex gap-2">
                      <button onClick={() => setParsedSelected(new Set(Object.keys(parsedFields)))} className="text-[11px] text-blue-600 hover:text-blue-800 underline underline-offset-2">All</button>
                      <button onClick={() => setParsedSelected(new Set())} className="text-[11px] text-[#9b9b9b] hover:text-[#1a1a1a] underline underline-offset-2">None</button>
                    </div>
                  </div>

                  {PARSE_SECTIONS.map(section => {
                    const visible = section.keys.filter(k => parsedFields[k] != null);
                    if (!visible.length) return null;
                    return (
                      <div key={section.label} className="mb-4">
                        <p className="text-[10px] font-bold text-[#9b9b9b] uppercase tracking-widest mb-1.5">{section.label}</p>
                        <div className="bg-[#fafafa] border border-[#f0f0f0] rounded-xl overflow-hidden divide-y divide-[#f0f0f0]">
                          {visible.map(key => (
                            <label key={key} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-white transition-colors">
                              <input
                                type="checkbox"
                                checked={parsedSelected.has(key)}
                                onChange={() => setParsedSelected(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; })}
                                className="w-4 h-4 rounded border-[#d4d4d4] accent-[#1a1a1a] cursor-pointer flex-shrink-0"
                              />
                              <span className="text-xs text-[#6b6b6b] w-36 flex-shrink-0">{FIELD_LABELS[key] ?? key}</span>
                              <span className="text-xs font-medium text-[#1a1a1a] truncate">{parsedFields[key]}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="px-6 py-4 border-t border-[#f0f0f0] flex gap-2">
                  <button
                    onClick={closeUpload}
                    className="flex-1 py-2.5 border border-[#e5e5e5] rounded-xl text-sm text-[#6b6b6b] hover:bg-[#f5f5f5] transition-colors"
                  >
                    Skip
                  </button>
                  <button
                    onClick={handleApplyFields}
                    disabled={applying || parsedSelected.size === 0}
                    className="flex-1 py-2.5 bg-[#22c55e] text-white rounded-xl text-sm font-semibold hover:bg-[#16a34a] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                  >
                    {applying ? (
                      <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Applying…</>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Apply {parsedSelected.size} Field{parsedSelected.size !== 1 ? 's' : ''} to Lead
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
