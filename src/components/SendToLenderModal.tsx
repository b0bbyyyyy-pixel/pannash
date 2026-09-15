'use client';

import { useState, useEffect, useCallback, useRef, DragEvent } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Lender {
  id: string;
  name: string;
  email?: string | null;
  cc_email?: string | null;
  rep_name?: string | null;
  tier?: number | null;
  is_active?: boolean;
  // enriched from submissions
  latestStatus?: string | null;
  submissionCount?: number;
}

interface Document {
  id: string;
  file_name: string;
  file_path: string;
  file_type: string;
  file_size: number;
  created_at: string;
}

interface Submission {
  id: string;
  lender_id?: string | null;
  lender_name: string;
  lender_email?: string | null;
  status: string;
  ai_response?: string | null;
  documents_sent?: { id: string; name: string }[];
  sent_by_name?: string | null;
  note?: string | null;
  email_template_name?: string | null;
  created_at: string;
}

interface EmailTemplate {
  id: string;
  name: string;
  subject?: string;
  body?: string;
}

interface SendToLenderModalProps {
  leadId: string;
  leadName: string;
  leadCompany?: string | null;
  leadValue?: number | null;
  leadStatus?: string | null;
  userName?: string;
  onClose: () => void;
}

// ── Status helpers ─────────────────────────────────────────────────────────────
const STATUS_STYLES: Record<string, { bg: string; text: string; dot?: string }> = {
  'Sent':               { bg: 'bg-blue-100',   text: 'text-blue-700' },
  'Awaiting Response':  { bg: 'bg-amber-100',  text: 'text-amber-700' },
  'Needs Docs':         { bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-500' },
  'Declined':           { bg: 'bg-red-100',    text: 'text-red-700' },
  'Approved':           { bg: 'bg-green-100',  text: 'text-green-700' },
  'Failed':             { bg: 'bg-red-50',     text: 'text-red-500' },
  'Submitted':          { bg: 'bg-blue-100',   text: 'text-blue-700' },
};
function statusStyle(s: string) { return STATUS_STYLES[s] || { bg: 'bg-gray-100', text: 'text-gray-600' }; }

function StatusPill({ status }: { status: string }) {
  const { bg, text } = statusStyle(status);
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${bg} ${text}`}>
      {status === 'Declined' && <span className="text-red-500">✗</span>}
      {status === 'Approved' && <span>✓</span>}
      {status}
    </span>
  );
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDateShort(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function SendToLenderModal({
  leadId, leadName, leadCompany, leadValue, leadStatus, userName, onClose,
}: SendToLenderModalProps) {
  // ── State ──────────────────────────────────────────────────────────────────
  const [lenders, setLenders]               = useState<Lender[]>([]);
  const [documents, setDocuments]           = useState<Document[]>([]);
  const [submissions, setSubmissions]       = useState<Submission[]>([]);
  const [templates, setTemplates]           = useState<EmailTemplate[]>([]);

  const [selectedLenderIds, setSelectedLenderIds] = useState<Set<string>>(new Set());
  const [selectedDocIds, setSelectedDocIds]       = useState<Set<string>>(new Set());
  const [templateId, setTemplateId]               = useState('');
  const [note, setNote]                           = useState('');

  const [search, setSearch]           = useState('');
  const [lenderFilter, setLenderFilter] = useState<'All' | 'Recent'>('All');
  const [sending, setSending]         = useState(false);
  const [sendResult, setSendResult]   = useState<{ sent: number; failed: number } | null>(null);

  // Upload docs state
  const [showUpload, setShowUpload]     = useState(false);
  const [dragOver, setDragOver]         = useState(false);
  const [uploadFiles, setUploadFiles]   = useState<File[]>([]);
  const [uploading, setUploading]       = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Edit submission status
  const [editingSubId, setEditingSubId] = useState<string | null>(null);

  // ── Load data ──────────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    const [lRes, dRes, sRes, tRes] = await Promise.all([
      fetch('/api/lenders', { credentials: 'include' }),
      fetch(`/api/attachments?leadId=${leadId}`, { credentials: 'include' }),
      fetch(`/api/leads/submissions?leadId=${leadId}`, { credentials: 'include' }),
      fetch('/api/email-templates', { credentials: 'include' }),
    ]);

    const lJson = lRes.ok ? await lRes.json() : {};
    const dJson = dRes.ok ? await dRes.json() : {};
    const sJson = sRes.ok ? await sRes.json() : {};
    const tJson = tRes.ok ? await tRes.json() : {};

    const rawLenders: Lender[] = (lJson.lenders || []).filter((l: Lender) => l.is_active !== false);
    const rawSubs:    Submission[] = sJson.submissions || [];

    // Enrich lenders with latest submission status
    const statusMap: Record<string, { status: string; count: number }> = {};
    for (const s of rawSubs) {
      const lid = s.lender_id || s.lender_name;
      if (!statusMap[lid] || new Date(s.created_at) > new Date(statusMap[lid]?.status || '')) {
        statusMap[lid] = { status: s.status, count: (statusMap[lid]?.count || 0) + 1 };
      }
    }

    const enriched = rawLenders.map(l => ({
      ...l,
      latestStatus:    statusMap[l.id]?.status || null,
      submissionCount: statusMap[l.id]?.count  || 0,
    }));

    setLenders(enriched);
    setSubmissions(rawSubs);
    setTemplates(tJson.templates || tJson || []);

    const docs = dJson.attachments || [];
    setDocuments(docs);
    // Pre-select all documents
    setSelectedDocIds(new Set(docs.map((d: Document) => d.id)));
  }, [leadId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Lender filter + search ─────────────────────────────────────────────────
  const recentLenderNames = new Set(submissions.map(s => s.lender_name));
  const filteredLenders = lenders.filter(l => {
    if (search && !l.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (lenderFilter === 'Recent' && !recentLenderNames.has(l.name)) return false;
    return true;
  });

  // ── Selection helpers ──────────────────────────────────────────────────────
  const toggleLender = (id: string) =>
    setSelectedLenderIds(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const toggleDoc = (id: string) =>
    setSelectedDocIds(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const selectAllLenders = () =>
    setSelectedLenderIds(s => s.size === filteredLenders.length ? new Set() : new Set(filteredLenders.map(l => l.id)));

  // ── Send ───────────────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!selectedLenderIds.size) return;
    setSending(true);
    setSendResult(null);

    const selectedLenders = lenders.filter(l => selectedLenderIds.has(l.id)).map(l => ({
      id: l.id, name: l.name, email: l.email, ccEmail: l.cc_email,
    }));
    const selectedDocs = documents.filter(d => selectedDocIds.has(d.id)).map(d => ({
      id: d.id, name: d.file_name, file_path: d.file_path, file_type: d.file_type,
    }));
    const tpl = templates.find(t => t.id === templateId);

    try {
      const res = await fetch('/api/leads/send-to-lenders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          leadId,
          lenders:      selectedLenders,
          documents:    selectedDocs,
          templateId:   templateId || undefined,
          templateName: tpl?.name || undefined,
          note:         note || undefined,
          senderName:   userName || undefined,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setSendResult({ sent: json.sent, failed: json.failed });
        await loadAll(); // refresh submission history
        setSelectedLenderIds(new Set());
        setNote('');
        setTemplateId('');
      }
    } finally {
      setSending(false);
    }
  };

  // ── Update submission status ───────────────────────────────────────────────
  const updateStatus = async (id: string, status: string) => {
    await fetch('/api/leads/submissions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ id, status }),
    });
    setSubmissions(prev => prev.map(s => s.id === id ? { ...s, status } : s));
    setEditingSubId(null);
  };

  // ── Upload docs ────────────────────────────────────────────────────────────
  const onDragOver  = (e: DragEvent) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = () => setDragOver(false);
  const onDrop      = (e: DragEvent) => { e.preventDefault(); setDragOver(false); setUploadFiles(Array.from(e.dataTransfer.files)); };

  const handleUploadDocs = async () => {
    if (!uploadFiles.length) return;
    setUploading(true);
    for (const file of uploadFiles) {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('leadId', leadId);
      fd.append('columnField', 'documents');
      const res = await fetch('/api/attachments', { method: 'POST', body: fd, credentials: 'include' });
      if (res.ok) {
        const { attachment } = await res.json();
        setDocuments(prev => [attachment, ...prev]);
        setSelectedDocIds(prev => { const n = new Set(prev); n.add(attachment.id); return n; });
      }
    }
    setUploading(false);
    setUploadFiles([]);
    setShowUpload(false);
  };

  // ── Submission history grouped by lender ───────────────────────────────────
  const groupedSubs = submissions.reduce<Record<string, Submission[]>>((acc, s) => {
    const key = s.lender_name;
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});

  const totalLendersSubmitted = Object.keys(groupedSubs).length;
  const totalSent   = submissions.filter(s => s.status === 'Sent' || s.status === 'Awaiting Response' || s.status === 'Approved').length;
  const totalFailed = submissions.filter(s => s.status === 'Failed' || s.status === 'Declined').length;

  const valueStr = leadValue ? `$${Number(leadValue).toLocaleString()}` : null;

  const STATUSES = ['Sent', 'Awaiting Response', 'Needs Docs', 'Declined', 'Approved', 'Failed'];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50 flex items-stretch" onClick={onClose}>
        <div className="ml-auto w-full max-w-[1100px] bg-white flex flex-col h-full shadow-2xl" onClick={e => e.stopPropagation()}>

          {/* ── Top header bar ──────────────────────────────────────────── */}
          <div className="flex items-center gap-3 px-5 py-3 border-b border-[#ebebeb] flex-shrink-0 bg-white">
            {/* Icon */}
            <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-[#1a1a1a] leading-none">Send To Lender</p>
              <p className="text-[11px] text-[#9b9b9b] mt-0.5 truncate">
                {leadCompany?.toUpperCase() || leadName?.toUpperCase()}
                {leadName && leadCompany && <span className="mx-1.5 opacity-40">·</span>}
                {leadCompany && <span className="font-normal text-[#6b6b6b]">{leadName}</span>}
                <span className="ml-2 font-mono text-[10px] bg-[#f0f0f0] px-1.5 py-0.5 rounded">#{leadId.slice(0,5).toUpperCase()}</span>
              </p>
            </div>

            {/* Pills */}
            <div className="flex items-center gap-2 ml-auto flex-shrink-0">
              {valueStr && (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-200">
                  $ {valueStr}
                </span>
              )}
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-600 text-[11px] font-semibold border border-indigo-100">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Funding Request
              </span>
              {leadStatus && <StatusPill status={leadStatus} />}
              <button onClick={onClose} className="ml-2 flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#e5e5e5] text-xs text-[#1a1a1a] hover:bg-[#f5f5f5] transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Close
              </button>
            </div>
          </div>

          {/* ── Two-pane body ────────────────────────────────────────────── */}
          <div className="flex flex-1 overflow-hidden">

            {/* ── LEFT PANEL ─────────────────────────────────────────────── */}
            <div className="w-[400px] flex-shrink-0 border-r border-[#ebebeb] flex flex-col overflow-hidden bg-white">
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

                {/* Submit header */}
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#1a1a1a]">Submit Application</p>
                    <p className="text-[11px] text-[#9b9b9b]">Choose lenders, attach documents and send</p>
                  </div>
                </div>

                {/* SELECT LENDERS */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 text-[#6b6b6b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                      <span className="text-[11px] font-bold text-[#1a1a1a] uppercase tracking-wider">Select Lenders</span>
                    </div>
                    <button onClick={selectAllLenders} className="text-[11px] text-indigo-600 hover:text-indigo-800 font-medium">
                      {selectedLenderIds.size === filteredLenders.length && filteredLenders.length > 0 ? 'Deselect all' : 'Select all'}
                    </button>
                  </div>

                  {/* Search + filter tabs */}
                  <div className="flex gap-2 mb-2">
                    <div className="relative flex-1">
                      <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[#9b9b9b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      <input
                        type="text" placeholder="Search..." value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full pl-7 pr-3 py-1.5 text-xs border border-[#e5e5e5] rounded-lg bg-[#fafafa] focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:bg-white"
                      />
                    </div>
                    {(['All', 'Recent'] as const).map(f => (
                      <button key={f} onClick={() => setLenderFilter(f)}
                        className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${lenderFilter === f ? 'bg-indigo-600 text-white' : 'bg-[#f5f5f5] text-[#6b6b6b] hover:bg-[#ebebeb]'}`}>
                        {f}
                      </button>
                    ))}
                  </div>

                  {/* Lender list */}
                  <div className="space-y-1 max-h-52 overflow-y-auto pr-0.5">
                    {filteredLenders.length === 0 ? (
                      <p className="text-xs text-[#9b9b9b] py-3 text-center">No lenders found</p>
                    ) : filteredLenders.map(l => (
                      <label key={l.id} className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${selectedLenderIds.has(l.id) ? 'bg-indigo-50 border border-indigo-100' : 'hover:bg-[#fafafa] border border-transparent'}`}>
                        <input type="checkbox" checked={selectedLenderIds.has(l.id)} onChange={() => toggleLender(l.id)}
                          className="w-4 h-4 rounded border-[#d4d4d4] accent-indigo-600 cursor-pointer flex-shrink-0" />
                        <div className="w-6 h-6 rounded bg-[#f0f0f0] flex items-center justify-center flex-shrink-0">
                          <svg className="w-3 h-3 text-[#6b6b6b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <span className="flex-1 text-xs font-medium text-[#1a1a1a] truncate">{l.name}</span>
                        {l.latestStatus && <StatusPill status={l.latestStatus} />}
                      </label>
                    ))}
                  </div>
                </div>

                {/* EMAIL TEMPLATE */}
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <svg className="w-3.5 h-3.5 text-[#6b6b6b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <span className="text-[11px] font-bold text-[#1a1a1a] uppercase tracking-wider">Email Template</span>
                  </div>
                  <select
                    value={templateId}
                    onChange={e => setTemplateId(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm border border-[#e5e5e5] rounded-xl bg-white text-[#1a1a1a] focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  >
                    <option value="">— Select email template —</option>
                    {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>

                {/* DOCUMENTS */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 text-[#6b6b6b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span className="text-[11px] font-bold text-[#1a1a1a] uppercase tracking-wider">Documents</span>
                      <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">{documents.length}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {selectedDocIds.size > 0 && (
                        <button onClick={() => setSelectedDocIds(new Set())} className="text-[11px] text-[#9b9b9b] hover:text-[#1a1a1a]">Deselect all</button>
                      )}
                      <button
                        onClick={() => setShowUpload(true)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-semibold hover:bg-emerald-100 transition-colors"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        Upload
                      </button>
                    </div>
                  </div>

                  {documents.length === 0 ? (
                    <div className="py-6 text-center border-2 border-dashed border-[#e5e5e5] rounded-xl">
                      <p className="text-xs text-[#9b9b9b]">No documents uploaded yet</p>
                      <button onClick={() => setShowUpload(true)} className="mt-1.5 text-xs text-indigo-600 underline underline-offset-2">Upload documents</button>
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-44 overflow-y-auto">
                      {documents.map(doc => (
                        <label key={doc.id}
                          className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer transition-colors border ${selectedDocIds.has(doc.id) ? 'bg-indigo-50 border-indigo-200' : 'bg-[#fafafa] border-transparent hover:bg-white hover:border-[#e5e5e5]'}`}>
                          <input type="checkbox" checked={selectedDocIds.has(doc.id)} onChange={() => toggleDoc(doc.id)}
                            className="w-4 h-4 rounded border-[#d4d4d4] accent-indigo-600 cursor-pointer flex-shrink-0" />
                          <div className="w-7 h-7 rounded-lg bg-white border border-[#e5e5e5] flex items-center justify-center flex-shrink-0">
                            <svg className="w-3.5 h-3.5 text-[#9b9b9b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </div>
                          <span className="flex-1 text-xs font-medium text-[#1a1a1a] truncate">{doc.file_name}</span>
                          <span className="text-[10px] text-[#9b9b9b]">{fmtSize(doc.file_size)}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                {/* NOTE */}
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <svg className="w-3.5 h-3.5 text-[#6b6b6b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    <span className="text-[11px] font-bold text-[#1a1a1a] uppercase tracking-wider">Note</span>
                    <span className="text-[10px] text-[#9b9b9b]">(optional)</span>
                  </div>
                  <textarea
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    placeholder="Add a note to include in the email..."
                    rows={2}
                    className="w-full px-3 py-2 text-xs border border-[#e5e5e5] rounded-xl bg-[#fafafa] text-[#1a1a1a] placeholder:text-[#9b9b9b] resize-none focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:bg-white"
                  />
                </div>
              </div>

              {/* Send footer */}
              <div className="flex-shrink-0 px-5 py-4 border-t border-[#ebebeb] space-y-2">
                {sendResult && (
                  <div className={`px-3 py-2 rounded-lg text-xs font-medium ${sendResult.failed > 0 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                    ✓ Sent to {sendResult.sent} lender{sendResult.sent !== 1 ? 's' : ''}
                    {sendResult.failed > 0 && ` · ${sendResult.failed} failed`}
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={handleSend}
                    disabled={sending || selectedLenderIds.size === 0}
                    className="flex-1 py-3 bg-[#22c55e] text-white rounded-xl text-sm font-semibold hover:bg-[#16a34a] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                  >
                    {sending ? (
                      <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Sending…</>
                    ) : (
                      <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                      Send to {selectedLenderIds.size > 0 ? selectedLenderIds.size : '…'} Lender{selectedLenderIds.size !== 1 ? 's' : ''}</>
                    )}
                  </button>
                  <button
                    onClick={() => { setSelectedLenderIds(new Set()); setNote(''); setTemplateId(''); setSendResult(null); }}
                    className="px-4 py-3 border border-[#e5e5e5] rounded-xl text-sm text-[#6b6b6b] hover:bg-[#f5f5f5] transition-colors"
                  >
                    Reset
                  </button>
                </div>
              </div>
            </div>

            {/* ── RIGHT PANEL: Submission History ──────────────────────── */}
            <div className="flex-1 flex flex-col overflow-hidden bg-[#fafafa]">
              {/* History header */}
              <div className="flex-shrink-0 px-6 py-4 bg-white border-b border-[#ebebeb]">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-bold text-[#1a1a1a]">
                    Submission History
                    <span className="ml-2 text-[#9b9b9b] font-normal">({submissions.length})</span>
                  </p>
                </div>
                {submissions.length > 0 && (
                  <div className="flex items-center gap-4 text-xs text-[#6b6b6b]">
                    <span><strong className="text-[#1a1a1a]">{submissions.length}</strong> Total</span>
                    <span>·</span>
                    <span><strong className="text-[#1a1a1a]">{totalLendersSubmitted}</strong> Lenders</span>
                    <span>·</span>
                    <span className="text-emerald-600">
                      <svg className="w-3 h-3 inline mr-0.5" fill="currentColor" viewBox="0 0 20 20"><path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/><path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/></svg>
                      <strong>{totalSent}</strong> Sent
                    </span>
                    <span>·</span>
                    <span className="text-red-500">● <strong>{totalFailed}</strong> Failed</span>
                  </div>
                )}
              </div>

              {/* History list */}
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                {Object.keys(groupedSubs).length === 0 ? (
                  <div className="py-16 text-center">
                    <div className="w-12 h-12 rounded-full bg-[#f0f0f0] flex items-center justify-center mx-auto mb-3">
                      <svg className="w-6 h-6 text-[#d4d4d4]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                    </div>
                    <p className="text-sm font-medium text-[#6b6b6b]">No submissions yet</p>
                    <p className="text-xs text-[#9b9b9b] mt-1">Select lenders and click Send to get started</p>
                  </div>
                ) : Object.entries(groupedSubs).map(([lenderName, subs]) => (
                  <div key={lenderName} className="bg-white rounded-xl border border-[#ebebeb] overflow-hidden">
                    {/* Lender group header */}
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-[#fafafa] border-b border-[#f0f0f0]">
                      <div className="w-5 h-5 rounded bg-indigo-100 flex items-center justify-center flex-shrink-0">
                        <svg className="w-2.5 h-2.5 text-indigo-600" fill="currentColor" viewBox="0 0 20 20"><path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/><path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/></svg>
                      </div>
                      <span className="text-xs font-bold text-[#1a1a1a] uppercase tracking-wide">{lenderName}</span>
                      <span className="text-[10px] text-[#9b9b9b] ml-1">({subs.length})</span>
                    </div>

                    {/* Submission rows */}
                    {subs.map(sub => (
                      <div key={sub.id} className="px-4 py-3 border-b border-[#f5f5f5] last:border-b-0">
                        <div className="flex items-start gap-2 mb-1.5">
                          <div className="flex items-center gap-1.5 flex-1 flex-wrap gap-y-1">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#f0f0f0] text-[10px] font-semibold text-[#6b6b6b]">
                              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                              Email
                            </span>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-[10px] font-semibold text-indigo-600">
                              ✓ Sent
                            </span>
                            <span className="text-[10px] text-[#9b9b9b]">{fmtDateShort(sub.created_at)}</span>
                          </div>

                          {/* Status (editable) */}
                          {editingSubId === sub.id ? (
                            <select
                              autoFocus
                              value={sub.status}
                              onChange={e => updateStatus(sub.id, e.target.value)}
                              onBlur={() => setEditingSubId(null)}
                              className="text-xs border border-[#e5e5e5] rounded px-1.5 py-0.5 focus:outline-none"
                            >
                              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          ) : (
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <StatusPill status={sub.status} />
                              <button onClick={() => setEditingSubId(sub.id)} className="p-0.5 text-[#9b9b9b] hover:text-[#1a1a1a]">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                              </button>
                            </div>
                          )}
                        </div>

                        {/* AI response */}
                        {sub.ai_response && (
                          <p className="text-[11px] text-[#6b6b6b] bg-[#fafafa] border border-[#f0f0f0] rounded-lg px-2.5 py-2 mb-1.5 leading-relaxed">
                            <span className="text-[10px] font-semibold text-[#9b9b9b] uppercase tracking-wide mr-1">[AI]</span>
                            {sub.ai_response}
                          </p>
                        )}

                        {/* Send log */}
                        {sub.documents_sent && sub.documents_sent.length > 0 && (
                          <details className="mt-1">
                            <summary className="text-[10px] font-bold text-[#9b9b9b] uppercase tracking-wider cursor-pointer hover:text-[#6b6b6b] select-none">
                              Send Log ({sub.documents_sent.length} doc{sub.documents_sent.length !== 1 ? 's' : ''})
                            </summary>
                            <p className="text-[10px] text-[#9b9b9b] mt-1 pl-2 leading-relaxed">
                              {sub.sent_by_name || 'You'} sent:{' '}
                              {sub.documents_sent.map(d => d.name).join(', ')}{' '}
                              · {fmtDateShort(sub.created_at)}
                            </p>
                          </details>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Upload doc sub-modal ──────────────────────────────────────────── */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4" onClick={() => { setShowUpload(false); setUploadFiles([]); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#f0f0f0]">
              <p className="text-sm font-bold text-[#1a1a1a]">Upload Documents</p>
              <button onClick={() => { setShowUpload(false); setUploadFiles([]); }} className="text-[#9b9b9b] hover:text-[#1a1a1a]">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="px-5 py-5">
              <div onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-[#d4d4d4] hover:border-[#9b9b9b] bg-[#fafafa]'}`}>
                <svg className="w-8 h-8 mx-auto text-[#9b9b9b] mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                <p className="text-sm font-semibold text-[#1a1a1a]">Drag & drop or click to browse</p>
                <p className="text-xs text-[#9b9b9b] mt-1">PDF, DOC, DOCX, JPG, PNG · Max 20 MB</p>
              </div>
              <input ref={fileRef} type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" className="hidden"
                onChange={e => { if (e.target.files) setUploadFiles(Array.from(e.target.files)); }} />
              {uploadFiles.length > 0 && (
                <div className="mt-3 space-y-1">
                  {uploadFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-[#6b6b6b] bg-[#fafafa] rounded-lg px-3 py-2">
                      <svg className="w-3.5 h-3.5 text-[#9b9b9b]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                      <span className="flex-1 truncate font-medium">{f.name}</span>
                      <span className="text-[#9b9b9b]">{fmtSize(f.size)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="px-5 pb-5">
              <button onClick={handleUploadDocs} disabled={uploading || uploadFiles.length === 0}
                className="w-full py-3 bg-[#22c55e] text-white rounded-xl text-sm font-semibold hover:bg-[#16a34a] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
                {uploading ? <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Uploading…</> : 'Save & Upload Files'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
