'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────
interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
}

interface LeadForEmail {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  underwriting_data?: Record<string, unknown> | null;
}

interface ScheduleEmailModalProps {
  lead: LeadForEmail;
  onClose: () => void;
}

// ── Placeholder replacement ───────────────────────────────────────────────────
function replacePlaceholders(text: string, lead: LeadForEmail): string {
  const firstName = lead.name.split(' ')[0] || lead.name;
  const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;

  const ud = lead.underwriting_data as Record<string, unknown> | null | undefined;
  const actualOffers = (ud?.actualOffers as unknown[]) || [];
  const selectedOffer = (actualOffers as Array<Record<string, unknown>>).find(
    (o) => o.id === ud?.selectedOfferId
  ) || null;

  const paymentsToMonths = (payments: number, freq: string): string => {
    const f = (freq || 'Daily').toLowerCase();
    let months: number;
    if (f === 'monthly') months = payments;
    else if (f === 'weekly') months = payments / 4.33;
    else if (f === 'bi-weekly') months = payments / 2.17;
    else months = payments / 21;
    return `${payments} payments (~${Math.round(months)} mo)`;
  };

  let offer_amount = '', offer_payment = '', offer_term = '', offer_total_repayment = '';
  let negotiated_amount = '', negotiated_payment = '', negotiated_term = '', negotiated_total_repayment = '';

  if (selectedOffer) {
    const termLen = (selectedOffer.termLength as number) || 250;
    const freq    = (selectedOffer.paymentFrequency as string) || 'Daily';
    const amount  = selectedOffer.amount as number;
    const factor  = selectedOffer.factorRate as number;
    const totalRepay = amount * factor;

    offer_amount = fmt(amount);
    offer_payment = `${fmt(totalRepay / termLen)}/${freq.toLowerCase()}`;
    offer_term = paymentsToMonths(termLen, freq);
    offer_total_repayment = fmt(totalRepay);

    const adjAmt   = (ud?.adjustedAmount as number) ?? amount;
    const buyRate  = (selectedOffer.buyRate as number) ?? 1.2;
    const addedPts = (ud?.negotiationAddedPoints as number) ?? 0;
    const negFactor = buyRate + addedPts / 100;
    const negTotal  = adjAmt * negFactor;

    negotiated_amount = fmt(adjAmt);
    negotiated_payment = `${fmt(negTotal / termLen)}/${freq.toLowerCase()}`;
    negotiated_term = paymentsToMonths(termLen, freq);
    negotiated_total_repayment = fmt(negTotal);
  }

  const replacements: Record<string, string> = {
    firstName, name: lead.name,
    email: lead.email || '', phone: lead.phone || '', company: lead.company || '',
    offer_amount, offer_payment, offer_term, offer_total_repayment,
    negotiated_amount, negotiated_payment, negotiated_term, negotiated_total_repayment,
  };

  let result = text;
  Object.keys(replacements).forEach(key => {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), replacements[key]);
  });
  return result;
}

function replacePlaceholdersWithExamples(text: string): string {
  const hl = (v: string) => `<span class="bg-yellow-100 px-1 rounded">${v}</span>`;
  const examples: Record<string, string> = {
    firstName: hl('John'), name: hl('John Smith'),
    email: hl('john@example.com'), phone: hl('(555) 123-4567'), company: hl('Acme Corp'),
    offer_amount: hl('$50,000'), offer_payment: hl('$285/daily'),
    offer_term: hl('175 payments (~8 mo)'), offer_total_repayment: hl('$60,000'),
    negotiated_amount: hl('$45,000'), negotiated_payment: hl('$270/daily'),
    negotiated_term: hl('175 payments (~8 mo)'), negotiated_total_repayment: hl('$56,250'),
  };
  let result = text;
  Object.keys(examples).forEach(key => {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), examples[key]);
  });
  return result;
}

// ── Modal ─────────────────────────────────────────────────────────────────────
export default function ScheduleEmailModal({ lead, onClose }: ScheduleEmailModalProps) {
  // Template list
  const [templates, setTemplates]                   = useState<EmailTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates]     = useState(true);

  // Selected template + editing
  const [selectedId, setSelectedId]                 = useState('');
  const [editingTemplate, setEditingTemplate]       = useState<EmailTemplate | null>(null);
  const [editName, setEditName]                     = useState('');
  const [editSubject, setEditSubject]               = useState('');
  const [editBody, setEditBody]                     = useState('');
  const [savingTemplate, setSavingTemplate]         = useState(false);
  const [managing, setManaging]                     = useState(false);
  const [deletingId, setDeletingId]                 = useState<string | null>(null);
  const [signature, setSignature]                   = useState('');
  const [savingSignature, setSavingSignature]       = useState(false);
  const [signatureSaved, setSignatureSaved]         = useState(false);

  // Schedule state
  const [scheduledDate, setScheduledDate]           = useState('');
  const [scheduledTime, setScheduledTime]           = useState('09:00');
  const [frequency, setFrequency]                   = useState('once');

  const [sending, setSending]                       = useState(false);
  const [scheduling, setScheduling]                 = useState(false);
  const [successMsg, setSuccessMsg]                 = useState('');
  const [sendError, setSendError]                   = useState('');
  const [needsGmail, setNeedsGmail]                 = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  // ── Fetch templates on mount ───────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/email-templates', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setTemplates(d.templates || []))
      .catch(console.error)
      .finally(() => setLoadingTemplates(false));
    fetch('/api/settings/email-signature', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setSignature(d.signature || ''))
      .catch(console.error);
  }, []);

  // ── Helpers: insert into textarea ─────────────────────────────────────────
  const insertBold = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const selected = editBody.substring(s, e);
    const newText = selected
      ? editBody.substring(0, s) + `<strong>${selected}</strong>` + editBody.substring(e)
      : editBody.substring(0, s) + '<strong></strong>' + editBody.substring(s);
    setEditBody(newText);
  }, [editBody]);

  const insertImage = useCallback(() => {
    const url = prompt('Image URL:');
    if (!url) return;
    const el = textareaRef.current;
    if (!el) return;
    const { selectionStart: s } = el;
    setEditBody(editBody.substring(0, s) + `<img src="${url}" style="max-width:100%"/>` + editBody.substring(s));
  }, [editBody]);

  const insertPlaceholder = useCallback((ph: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const { selectionStart: s } = el;
    setEditBody(editBody.substring(0, s) + `{{${ph}}}` + editBody.substring(s));
  }, [editBody]);

  // ── Open inline editor ────────────────────────────────────────────────────
  const startEdit = (tpl: EmailTemplate) => {
    setEditingTemplate(tpl);
    setEditName(tpl.name);
    setEditSubject(tpl.subject);
    setEditBody(tpl.body);
  };

  const cancelEdit = () => {
    setEditingTemplate(null);
    setEditName(''); setEditSubject(''); setEditBody('');
  };

  // ── Save template ─────────────────────────────────────────────────────────
  const saveTemplate = async () => {
    if (!editName.trim() || !editSubject.trim() || !editBody.trim()) return;
    setSavingTemplate(true);
    const isEdit = !!(editingTemplate && editingTemplate.id);
    try {
      const res = await fetch('/api/email-templates', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(isEdit
          ? { id: editingTemplate!.id, name: editName, subject: editSubject, body: editBody }
          : { name: editName, subject: editSubject, body: editBody }),
      });
      if (res.ok) {
        const { template } = await res.json();
        if (isEdit) {
          setTemplates(prev => prev.map(t => t.id === template.id ? template : t));
        } else {
          setTemplates(prev => [...prev, template]);
          setSelectedId(template.id);
        }
        setManaging(false);
        cancelEdit();
      }
    } finally {
      setSavingTemplate(false);
    }
  };

  const deleteTemplate = async (id: string) => {
    if (!confirm('Delete this template?')) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/email-templates?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setSendError(d.error || 'Could not delete template');
        return;
      }
      setTemplates(prev => prev.filter(t => t.id !== id));
      if (selectedId === id) setSelectedId('');
      if (editingTemplate?.id === id) cancelEdit();
    } finally {
      setDeletingId(null);
    }
  };

  const saveSignature = async () => {
    setSavingSignature(true);
    setSignatureSaved(false);
    try {
      const res = await fetch('/api/settings/email-signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ signature }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setSendError(d.error || 'Could not save signature');
        return;
      }
      setSignatureSaved(true);
    } finally {
      setSavingSignature(false);
    }
  };

  // ── Send now ──────────────────────────────────────────────────────────────
  const sendNow = async () => {
    const tpl = templates.find(t => t.id === selectedId);
    if (!tpl) return;
    if (!lead.email) { setSendError('This lead has no email address.'); return; }
    setSending(true);
    setSendError('');
    setSuccessMsg('');
    setNeedsGmail(false);
    try {
      const res = await fetch('/api/leads/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          leadId: lead.id,
          subject: replacePlaceholders(tpl.subject, lead),
          html: replacePlaceholders(tpl.body, lead),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSendError(d.error || 'Send failed');
        setNeedsGmail(!!d.needsGmail);
        return;
      }
      setSuccessMsg(`Sent to ${d.to || lead.email}`);
      bodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setSendError('Network error — email was not sent.');
    } finally {
      setSending(false);
    }
  };

  // ── Schedule email ────────────────────────────────────────────────────────
  const scheduleEmail = async () => {
    if (!selectedId) return;
    if (!scheduledDate) { alert('Please select a date.'); return; }
    setScheduling(true);
    setSendError('');
    setSuccessMsg('');
    try {
      const scheduledTime_iso = new Date(`${scheduledDate}T${scheduledTime}`).toISOString();

      const res = await fetch('/api/leads/schedule-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: lead.id,
          templateId: selectedId,
          scheduledTime: scheduledTime_iso,
          frequency,
        }),
        credentials: 'include',
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setSendError(d.error || 'Could not schedule');
        return;
      }
      setSuccessMsg(`Email scheduled${frequency !== 'once' ? ` (${frequency})` : ''} for ${new Date(scheduledDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at ${scheduledTime}.`);
      bodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setScheduling(false);
    }
  };

  const selectedTemplate = templates.find(t => t.id === selectedId);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[80] p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5e5e5] flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-[#1a1a1a]">Schedule Email</h2>
            <p className="text-xs text-[#9b9b9b] mt-0.5">
              {lead.company || lead.name} · {lead.email || 'No email'}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-[#9b9b9b] hover:text-[#1a1a1a] hover:bg-[#f5f5f5] transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div ref={bodyRef} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Success banner */}
          {successMsg && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-start gap-2">
              <svg className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-sm text-green-800">{successMsg}</p>
            </div>
          )}
          {sendError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-2">
              <p className="text-sm text-red-700">{sendError}</p>
              {needsGmail && (
                <a
                  href="/api/auth/google?redirect=/settings/connections"
                  className="inline-flex items-center px-3 py-1.5 bg-[#1a1a1a] text-white rounded-md text-xs font-medium hover:bg-[#2a2a2a]"
                >
                  Connect Gmail
                </a>
              )}
            </div>
          )}

          {/* ── Template Select ── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-[#1a1a1a]">Email Template *</label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => { setManaging(m => !m); cancelEdit(); }}
                  className="text-xs text-[#6b6b6b] hover:text-[#1a1a1a] font-medium"
                >
                  {managing ? 'Done' : 'Manage'}
                </button>
                <button
                  type="button"
                  onClick={() => { setManaging(false); startEdit({ id: '', name: '', subject: '', body: '' }); }}
                  className="text-xs text-[#5a7fc7] hover:text-[#4a6fb7] font-medium"
                >
                  + New Template
                </button>
              </div>
            </div>
            {loadingTemplates ? (
              <div className="px-3 py-2.5 border border-[#e5e5e5] rounded-lg bg-[#fafafa] text-sm text-[#9b9b9b]">Loading templates…</div>
            ) : managing ? (
              <div className="border border-[#e5e5e5] rounded-lg overflow-hidden">
                {templates.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-[#9b9b9b]">No templates yet.</p>
                ) : (
                  <ul className="divide-y divide-[#f0f0f0]">
                    {templates.map(t => (
                      <li key={t.id} className="flex items-center gap-2 px-3 py-2">
                        <button
                          type="button"
                          onClick={() => { setSelectedId(t.id); setManaging(false); }}
                          className="flex-1 text-left text-sm text-[#1a1a1a] truncate hover:underline"
                        >
                          {t.name}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setManaging(false); startEdit(t); }}
                          className="p-1 text-[#9b9b9b] hover:text-[#1a1a1a] transition-colors"
                          title="Edit"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteTemplate(t.id)}
                          disabled={deletingId === t.id}
                          className="p-1 text-[#9b9b9b] hover:text-red-600 transition-colors disabled:opacity-40"
                          title="Delete"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="border-t border-[#e5e5e5] px-3 py-3 bg-[#fafafa]">
                  <label className="block text-xs font-semibold text-[#1a1a1a] mb-1.5">Email signature</label>
                  <p className="text-[11px] text-[#9b9b9b] mb-2">Added to the bottom of every email you send.</p>
                  <textarea
                    value={signature}
                    onChange={e => { setSignature(e.target.value); setSignatureSaved(false); }}
                    rows={4}
                    placeholder={"Best,\nYour name\nYour company"}
                    className="w-full px-3 py-2 border border-[#e5e5e5] rounded-md text-sm resize-y focus:outline-none focus:ring-1 focus:ring-[#1a1a1a] bg-white"
                  />
                  <button
                    type="button"
                    onClick={saveSignature}
                    disabled={savingSignature}
                    className="mt-2 px-3 py-1.5 bg-[#1a1a1a] text-white rounded-md text-xs font-medium hover:bg-[#333] disabled:opacity-40"
                  >
                    {savingSignature ? 'Saving…' : signatureSaved ? 'Saved' : 'Save signature'}
                  </button>
                </div>
              </div>
            ) : (
              <select
                value={selectedId}
                onChange={e => { setSelectedId(e.target.value); setEditingTemplate(null); }}
                className="w-full px-3 py-2.5 border border-[#e5e5e5] rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-[#1a1a1a]"
              >
                <option value="">Choose a template…</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* ── Inline editor (new or edit) ── */}
          {editingTemplate !== null && (
            <div className="border border-[#e5e5e5] rounded-lg bg-[#fafafa] p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-[#6b6b6b]">
                  {editingTemplate.id ? 'Edit Template' : 'New Template'}
                </span>
                <button onClick={cancelEdit} className="text-xs text-[#9b9b9b] hover:text-[#1a1a1a]">Discard</button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-[#6b6b6b] mb-1">Template Name</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    placeholder="e.g. Follow-Up Offer"
                    className="w-full px-3 py-2 border border-[#e5e5e5] rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#1a1a1a]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#6b6b6b] mb-1">Subject</label>
                  <input
                    type="text"
                    value={editSubject}
                    onChange={e => setEditSubject(e.target.value)}
                    placeholder="e.g. Your Funding Offer — {{company}}"
                    className="w-full px-3 py-2 border border-[#e5e5e5] rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#1a1a1a]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#6b6b6b] mb-1">Body</label>
                  {/* Toolbar */}
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    <button onClick={insertBold} className="px-2.5 py-1 bg-white border border-[#e5e5e5] rounded text-xs font-bold hover:bg-[#f5f5f5]" title="Bold">B</button>
                    <button onClick={insertImage} className="px-2.5 py-1 bg-white border border-[#e5e5e5] rounded text-xs hover:bg-[#f5f5f5]">🖼 Image</button>
                    {/* Placeholder dropdown */}
                    <div className="relative group">
                      <button className="px-2.5 py-1 bg-white border border-[#e5e5e5] rounded text-xs hover:bg-[#f5f5f5]">+ Field ▾</button>
                      <div className="absolute left-0 top-full mt-1 bg-white border border-[#e5e5e5] rounded-lg shadow-lg z-20 hidden group-hover:block min-w-[180px] max-h-64 overflow-y-auto">
                        <p className="px-3 pt-2 pb-1 text-[10px] font-semibold text-[#9b9b9b] uppercase">Lead</p>
                        {[['firstName','First Name'],['name','Full Name'],['company','Company'],['email','Email'],['phone','Phone']].map(([k,l]) => (
                          <button key={k} onClick={() => insertPlaceholder(k)} className="block w-full text-left px-3 py-1.5 text-xs hover:bg-[#f5f5f5]">{l}</button>
                        ))}
                        <p className="px-3 pt-2 pb-1 text-[10px] font-semibold text-[#9b9b9b] uppercase border-t border-[#f0f0f0] mt-1">Selected Offer</p>
                        {[['offer_amount','Amount'],['offer_payment','Payment'],['offer_term','Term'],['offer_total_repayment','Total Repayment']].map(([k,l]) => (
                          <button key={k} onClick={() => insertPlaceholder(k)} className="block w-full text-left px-3 py-1.5 text-xs hover:bg-[#f5f5f5]">{l}</button>
                        ))}
                        <p className="px-3 pt-2 pb-1 text-[10px] font-semibold text-[#9b9b9b] uppercase border-t border-[#f0f0f0] mt-1">Negotiated Offer</p>
                        {[['negotiated_amount','Amount'],['negotiated_payment','Payment'],['negotiated_term','Term'],['negotiated_total_repayment','Total Repayment']].map(([k,l]) => (
                          <button key={k} onClick={() => insertPlaceholder(k)} className="block w-full text-left px-3 py-1.5 text-xs hover:bg-[#f5f5f5]">{l}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <textarea
                    ref={textareaRef}
                    value={editBody}
                    onChange={e => setEditBody(e.target.value)}
                    rows={8}
                    placeholder="Hi {{firstName}}, I have a great offer for {{company}}..."
                    className="w-full px-3 py-2 border border-[#e5e5e5] rounded-md text-sm font-mono resize-y focus:outline-none focus:ring-1 focus:ring-[#1a1a1a]"
                  />
                  <p className="text-[11px] text-[#9b9b9b] mt-1">Supports HTML: &lt;strong&gt;bold&lt;/strong&gt;, &lt;img src="..."&gt;</p>
                </div>
                <button
                  onClick={saveTemplate}
                  disabled={savingTemplate || !editName.trim() || !editSubject.trim() || !editBody.trim()}
                  className="w-full py-2 bg-[#5a7fc7] text-white rounded-md text-sm font-medium hover:bg-[#4a6fb7] disabled:opacity-50 transition-colors"
                >
                  {savingTemplate ? 'Saving…' : editingTemplate.id ? 'Save Changes' : 'Create Template'}
                </button>
              </div>
            </div>
          )}

          {/* ── Email preview ── */}
          {selectedTemplate && !editingTemplate && !managing && (
            <div className="border border-[#e5e5e5] rounded-lg bg-[#fafafa] p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-[#6b6b6b]">
                  {lead.email ? 'Preview with lead data' : 'Template preview'}
                </span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => startEdit(selectedTemplate)}
                    className="text-xs text-[#5a7fc7] hover:text-[#4a6fb7] font-medium flex items-center gap-1"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteTemplate(selectedTemplate.id)}
                    disabled={deletingId === selectedTemplate.id}
                    className="text-xs text-[#9b9b9b] hover:text-red-600 font-medium disabled:opacity-40"
                  >
                    Delete
                  </button>
                </div>
              </div>
              <div className="bg-white rounded-lg p-3 space-y-3 text-sm">
                <div>
                  <span className="text-[11px] font-semibold text-[#9b9b9b] uppercase tracking-wider">Subject</span>
                  <p className="text-[#1a1a1a] mt-1">
                    {lead.email
                      ? replacePlaceholders(selectedTemplate.subject, lead)
                      : <span dangerouslySetInnerHTML={{ __html: replacePlaceholdersWithExamples(selectedTemplate.subject) }} />
                    }
                  </p>
                </div>
                <div className="border-t border-[#f0f0f0] pt-3">
                  <span className="text-[11px] font-semibold text-[#9b9b9b] uppercase tracking-wider">Body</span>
                  <div
                    className="text-[#1a1a1a] mt-1 leading-relaxed"
                    dangerouslySetInnerHTML={{
                      __html: lead.email
                        ? replacePlaceholders(selectedTemplate.body, lead).replace(/\n/g, '<br/>')
                        : replacePlaceholdersWithExamples(selectedTemplate.body).replace(/\n/g, '<br/>')
                    }}
                  />
                  {signature.trim() && (
                    <div
                      className="mt-4 pt-3 border-t border-[#f0f0f0] text-[#6b6b6b]"
                      dangerouslySetInnerHTML={{ __html: signature.replace(/\n/g, '<br/>') }}
                    />
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Sending options ── */}
          {!managing && !editingTemplate && (
          <div className="border-t border-[#e5e5e5] pt-4">
            <h3 className="text-sm font-semibold text-[#1a1a1a] mb-3">Sending Options</h3>

            {/* Send Now */}
            <button
              onClick={sendNow}
              disabled={!selectedId || sending || scheduling || !lead.email}
              className={`w-full py-3 text-white rounded-lg text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 mb-2 ${
                successMsg.startsWith('Sent') ? 'bg-[#15803d] hover:bg-[#166534]' : 'bg-[#22c55e] hover:bg-[#16a34a]'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {successMsg.startsWith('Sent') ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                )}
              </svg>
              {sending ? 'Sending…' : successMsg.startsWith('Sent') ? 'Sent' : 'Send Now'}
            </button>
            {sending && (
              <p className="text-xs text-[#6b6b6b] text-center mb-3">Sending email…</p>
            )}
            {!sending && successMsg && (
              <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-3 text-center">
                {successMsg}
              </p>
            )}
            {!sending && sendError && (
              <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3 text-center space-y-2">
                <p>{sendError}</p>
                {needsGmail && (
                  <a
                    href="/api/auth/google?redirect=/settings/connections"
                    className="inline-flex items-center px-3 py-1.5 bg-[#1a1a1a] text-white rounded-md text-xs font-medium hover:bg-[#2a2a2a]"
                  >
                    Connect Gmail
                  </a>
                )}
              </div>
            )}

            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px bg-[#e5e5e5]" />
              <span className="text-xs text-[#9b9b9b] font-medium">OR schedule for later</span>
              <div className="flex-1 h-px bg-[#e5e5e5]" />
            </div>

            {/* Date + Time */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs text-[#6b6b6b] mb-1">Date</label>
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={e => setScheduledDate(e.target.value)}
                  className="w-full px-3 py-2 border border-[#e5e5e5] rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#1a1a1a]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#6b6b6b] mb-1">Time</label>
                <input
                  type="time"
                  value={scheduledTime}
                  onChange={e => setScheduledTime(e.target.value)}
                  className="w-full px-3 py-2 border border-[#e5e5e5] rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#1a1a1a]"
                />
              </div>
            </div>

            {/* Frequency */}
            <div className="mb-1">
              <label className="block text-xs text-[#6b6b6b] mb-1">Frequency</label>
              <select
                value={frequency}
                onChange={e => setFrequency(e.target.value)}
                className="w-full px-3 py-2 border border-[#e5e5e5] rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#1a1a1a]"
              >
                <option value="once">Once</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
              <p className="text-[11px] text-[#9b9b9b] mt-1">
                {frequency === 'once'
                  ? 'Email will be sent once at the specified time.'
                  : `Email will repeat ${frequency} after the initial send.`}
              </p>
            </div>
          </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-[#e5e5e5] flex-shrink-0">
          {managing || editingTemplate ? (
            <button
              onClick={() => { setManaging(false); cancelEdit(); }}
              className="flex-1 py-2.5 border border-[#e5e5e5] text-[#1a1a1a] rounded-lg text-sm font-medium hover:bg-[#f5f5f5] transition-colors"
            >
              Done
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                className="flex-1 py-2.5 border border-[#e5e5e5] text-[#1a1a1a] rounded-lg text-sm font-medium hover:bg-[#f5f5f5] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => scheduleEmail()}
                disabled={!selectedId || !scheduledDate || sending || scheduling}
                className="flex-1 py-2.5 bg-[#5a7fc7] text-white rounded-lg text-sm font-semibold hover:bg-[#4a6fb7] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {scheduling ? 'Scheduling…' : 'Schedule Email'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
