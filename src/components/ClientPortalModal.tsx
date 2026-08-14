'use client';

import { useState, useEffect, useCallback } from 'react';

interface Offer {
  id: string;
  lenderName: string;
  amount: number;
  factorRate: number;
  termLength?: number;
  paymentFrequency?: string;
}

interface ActivityLog {
  id: string;
  event_type: string;
  event_data: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

interface Props {
  offer: Offer;
  leadId: string;
  leadName: string;
  avgMonthlyRevenue?: number;
  onClose: () => void;
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

interface TermOption {
  id: string;
  label: string;      // e.g. "52 weeks"
  payments: number;
  factorRate: number; // may differ per term
}

const PORTAL_DEFAULTS_KEY = 'portal_modal_defaults';

function loadDefaults() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PORTAL_DEFAULTS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveDefaults(d: Record<string, unknown>) {
  try { localStorage.setItem(PORTAL_DEFAULTS_KEY, JSON.stringify(d)); } catch { /* noop */ }
}

export default function ClientPortalModal({ offer, leadId, leadName, avgMonthlyRevenue, onClose }: Props) {
  const [tab, setTab] = useState<'customize' | 'activity'>('customize');

  // Load saved defaults once on mount
  const saved = loadDefaults();

  // Customization fields — initialised from localStorage if available
  const defaultIntro = `You've been pre-approved for up to ${fmt(offer.amount)} in funding. Use the slider below to choose the amount that works best for your business.`;
  const [title, setTitle] = useState<string>(saved?.title ?? 'Your Funding Offer');
  const [introMessage, setIntroMessage] = useState<string>(saved?.introMessage ?? defaultIntro);
  const [minAmountPct, setMinAmountPct] = useState<number>(saved?.minAmountPct ?? 0);
  const [showFactor, setShowFactor] = useState<boolean>(saved?.showFactor ?? false);
  const [showTotalRepayment, setShowTotalRepayment] = useState<boolean>(saved?.showTotalRepayment ?? true);
  const [showPayment, setShowPayment] = useState<boolean>(saved?.showPayment ?? true);
  const [showRevenuePercent, setShowRevenuePercent] = useState<boolean>(saved?.showRevenuePercent ?? false);
  const [customCta, setCustomCta] = useState<string>(saved?.customCta ?? 'I Accept This Offer');
  const [thankYouMessage, setThankYouMessage] = useState<string>(saved?.thankYouMessage ?? 'Thank you! We will be in touch shortly to finalize your funding.');
  const [expiryDays, setExpiryDays] = useState<number | ''>(saved?.expiryDays ?? '');

  // Term options
  const baseTerms = offer.termLength ?? 52;
  const baseFreq = offer.paymentFrequency ?? 'Weekly';
  const [showTermOptions, setShowTermOptions] = useState(false);
  const [termOptions, setTermOptions] = useState<TermOption[]>([
    { id: '1', label: `${baseTerms} ${baseFreq.toLowerCase()} payments`, payments: baseTerms, factorRate: offer.factorRate },
  ]);
  const [previewTermId, setPreviewTermId] = useState('1');

  // Generated link state
  const [generating, setGenerating] = useState(false);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);

  // Activity log
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Preview slider amount
  const [previewAmount, setPreviewAmount] = useState(offer.amount);

  const minAmount = Math.round((minAmountPct / 100) * offer.amount);
  const frequency = offer.paymentFrequency ?? 'Weekly';

  // Active term for preview
  const activeTerm = showTermOptions
    ? (termOptions.find(t => t.id === previewTermId) ?? termOptions[0])
    : { payments: offer.termLength ?? 52, factorRate: offer.factorRate, label: '' };

  // Recalculate preview using active term's factor rate
  const ratio = offer.amount > 0 ? previewAmount / offer.amount : 1;
  const previewTotal = previewAmount * activeTerm.factorRate;
  const previewTotalScaled = previewTotal; // factor applies to selected amount directly
  const previewFee = previewTotalScaled - previewAmount;
  const previewPayment = activeTerm.payments > 0 ? previewTotalScaled / activeTerm.payments : 0;
  const pct = offer.amount > minAmount ? ((previewAmount - minAmount) / (offer.amount - minAmount)) * 100 : 100;
  void ratio; // suppress unused warning

  // Revenue % for preview (computed here to avoid IIFE in JSX)
  const previewFreqLower = frequency.toLowerCase();
  const previewMonthlyPayment = previewFreqLower === 'weekly'
    ? previewPayment * 4.33
    : previewFreqLower === 'daily'
    ? previewPayment * 22
    : previewPayment;
  const previewRevenuePct = showRevenuePercent && avgMonthlyRevenue && avgMonthlyRevenue > 0
    ? ((previewMonthlyPayment / avgMonthlyRevenue) * 100).toFixed(1)
    : null;

  // Auto-save customization defaults to localStorage whenever they change
  useEffect(() => {
    saveDefaults({
      title, introMessage, minAmountPct,
      showFactor, showTotalRepayment, showPayment, showRevenuePercent,
      customCta, thankYouMessage, expiryDays,
    });
  }, [title, introMessage, minAmountPct, showFactor, showTotalRepayment, showPayment, showRevenuePercent, customCta, thankYouMessage, expiryDays]);

  const fetchLogs = useCallback(async () => {
    if (!generatedToken) return;
    setLoadingLogs(true);
    try {
      const res = await fetch(`/api/portal/${generatedToken}/activity`);
      if (res.ok) {
        const d = await res.json();
        setLogs(d.logs || []);
      }
    } finally {
      setLoadingLogs(false);
    }
  }, [generatedToken]);

  useEffect(() => {
    if (tab === 'activity' && generatedToken) fetchLogs();
  }, [tab, generatedToken, fetchLogs]);

  async function generateLink() {
    setGenerating(true);
    try {
      const expiresAt = expiryDays
        ? new Date(Date.now() + Number(expiryDays) * 86400000).toISOString()
        : null;

      const res = await fetch('/api/portal/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId, leadName,
          offerAmount: offer.amount,
          factorRate: offer.factorRate,
          totalRepayment: offer.amount * offer.factorRate,
          termPayments: offer.termLength ?? 52,
          frequency,
          title,
          introMessage,
          minAmount,
          showFactor,
          showTotalRepayment,
          showPayment,
          showRevenuePercent: showRevenuePercent && !!avgMonthlyRevenue,
          avgMonthlyRevenue: avgMonthlyRevenue ?? null,
          customCta,
          thankYouMessage,
          expiresAt,
          showTermOptions,
          termOptions: showTermOptions ? termOptions : [],
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');
      setGeneratedToken(json.token);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      alert(`Failed to generate link: ${msg}`);
    } finally {
      setGenerating(false);
    }
  }

  function portalUrl(token: string) {
    return `${window.location.origin}/portal/${token}`;
  }

  const [copiedType, setCopiedType] = useState<'url' | 'hyperlink' | 'sms' | null>(null);

  function copyAs(type: 'url' | 'hyperlink' | 'sms') {
    if (!generatedToken) return;
    const url = portalUrl(generatedToken);
    const bizName = leadName || 'Client';
    let text = url;
    if (type === 'hyperlink') {
      text = `<a href="${url}">Approved Offer — ${bizName}</a>`;
    } else if (type === 'sms') {
      text = `Approved Offer for ${bizName}: ${url}`;
    }
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2000);
  }

  function copyLink() {
    copyAs('url');
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  }

  function eventLabel(type: string) {
    switch (type) {
      case 'open': return { label: 'Opened link', color: 'bg-blue-100 text-blue-700' };
      case 'slider_change': return { label: 'Adjusted amount', color: 'bg-purple-100 text-purple-700' };
      case 'submit': return { label: 'Accepted offer', color: 'bg-green-100 text-green-700' };
      default: return { label: type, color: 'bg-gray-100 text-gray-600' };
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Client Offer Portal</h2>
            <p className="text-sm text-gray-500">{leadName} · {offer.lenderName} · {fmt(offer.amount)} @ {offer.factorRate}x</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 px-6">
          {(['customize', 'activity'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors capitalize ${
                tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'activity' ? `Activity Log${logs.length ? ` (${logs.length})` : ''}` : 'Customize & Preview'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-hidden flex">

          {tab === 'customize' && (
            <>
              {/* LEFT: Settings */}
              <div className="w-96 flex-shrink-0 overflow-y-auto border-r border-gray-100 p-5 space-y-5">

                {/* Saved defaults indicator */}
                <div className="flex items-center justify-between bg-green-50 border border-green-100 rounded-lg px-3 py-2">
                  <p className="text-xs text-green-700 font-medium">Settings auto-saved as your defaults</p>
                  <button
                    type="button"
                    onClick={() => {
                      localStorage.removeItem(PORTAL_DEFAULTS_KEY);
                      setTitle('Your Funding Offer');
                      setIntroMessage(defaultIntro);
                      setMinAmountPct(0);
                      setShowFactor(false);
                      setShowTotalRepayment(true);
                      setShowPayment(true);
                      setShowRevenuePercent(false);
                      setCustomCta('I Accept This Offer');
                      setThankYouMessage('Thank you! We will be in touch shortly to finalize your funding.');
                      setExpiryDays('');
                    }}
                    className="text-xs text-green-600 hover:text-red-500 underline ml-3 whitespace-nowrap"
                  >
                    Reset
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Page Title</label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    placeholder="Your Funding Offer"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Intro Message</label>
                  <textarea
                    value={introMessage}
                    onChange={(e) => setIntroMessage(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                    Minimum Amount — {fmt(minAmount)} ({minAmountPct}% of max)
                  </label>
                  <input
                    type="range" min={0} max={80} step={5} value={minAmountPct}
                    onChange={(e) => setMinAmountPct(Number(e.target.value))}
                    className="w-full accent-blue-600"
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>$0</span><span>{fmt(offer.amount)}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-gray-500 uppercase">Show / Hide Fields</label>
                  {[
                    { label: 'Total Repayment', val: showTotalRepayment, set: setShowTotalRepayment },
                    { label: `${frequency} Payment`, val: showPayment, set: setShowPayment },
                    { label: 'Factor Rate', val: showFactor, set: setShowFactor },
                  ].map(({ label, val, set }) => (
                    <label key={label} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={val} onChange={(e) => set(e.target.checked)}
                        className="w-4 h-4 accent-blue-600" />
                      <span className="text-sm text-gray-700">{label}</span>
                    </label>
                  ))}
                  {/* Revenue % — only show if avg revenue is available */}
                  {avgMonthlyRevenue && avgMonthlyRevenue > 0 ? (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={showRevenuePercent} onChange={(e) => setShowRevenuePercent(e.target.checked)}
                        className="w-4 h-4 accent-blue-600" />
                      <span className="text-sm text-gray-700">
                        % of Avg Monthly Revenue
                        <span className="ml-1 text-xs text-gray-400">(avg ${Math.round(avgMonthlyRevenue).toLocaleString()}/mo)</span>
                      </span>
                    </label>
                  ) : (
                    <p className="text-xs text-gray-400 italic">% of Revenue: upload bank statements to enable</p>
                  )}
                </div>

                {/* Term Options */}
                <div className="border border-gray-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-gray-500 uppercase">Term Length Selection</span>
                      <p className="text-xs text-gray-400 mt-0.5">Show term &amp; payment to client</p>
                    </div>
                    {/* Toggle — fixed size, flex-shrink-0 so it never stretches */}
                    <div
                      role="switch"
                      aria-checked={showTermOptions}
                      onClick={() => setShowTermOptions(v => !v)}
                      className={`relative flex-shrink-0 w-11 h-6 rounded-full cursor-pointer transition-colors duration-200 ${showTermOptions ? 'bg-blue-600' : 'bg-gray-200'}`}
                    >
                      <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${showTermOptions ? 'translate-x-5' : 'translate-x-0'}`} />
                    </div>
                  </div>

                  {showTermOptions && (
                    <div className="space-y-2 pt-1">
                      {termOptions.map((opt, idx) => (
                        <div key={opt.id} className="bg-gray-50 rounded-lg p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-gray-600">Option {idx + 1}</span>
                            {termOptions.length > 1 ? (
                              <button
                                type="button"
                                onClick={() => setTermOptions(prev => prev.filter(t => t.id !== opt.id))}
                                className="text-red-400 hover:text-red-600 text-xs"
                              >Remove</button>
                            ) : (
                              <span className="text-xs text-gray-300 italic">min 1 option</span>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-xs text-gray-400 mb-1 block">Payments</label>
                              <input
                                type="number"
                                value={opt.payments}
                                onChange={(e) => setTermOptions(prev => prev.map(t =>
                                  t.id === opt.id ? { ...t, payments: Number(e.target.value), label: `${e.target.value} ${frequency.toLowerCase()} payments` } : t
                                ))}
                                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
                                min={1}
                              />
                            </div>
                            <div>
                              <label className="text-xs text-gray-400 mb-1 block">Factor Rate</label>
                              <input
                                type="number"
                                step="0.01"
                                value={opt.factorRate}
                                onChange={(e) => setTermOptions(prev => prev.map(t =>
                                  t.id === opt.id ? { ...t, factorRate: Number(e.target.value) } : t
                                ))}
                                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="text-xs text-gray-400 mb-1 block">Label shown to client</label>
                            <input
                              value={opt.label}
                              onChange={(e) => setTermOptions(prev => prev.map(t =>
                                t.id === opt.id ? { ...t, label: e.target.value } : t
                              ))}
                              className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
                              placeholder={`${opt.payments} ${frequency.toLowerCase()} payments`}
                            />
                          </div>
                          <div className="text-xs text-gray-400">
                            Payment: <strong className="text-gray-700">
                              {fmt(Math.round(previewAmount * opt.factorRate / opt.payments))}/{frequency.toLowerCase().replace('ly','')}
                            </strong>
                            &nbsp;· Total: <strong className="text-gray-700">{fmt(Math.round(previewAmount * opt.factorRate))}</strong>
                          </div>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => setTermOptions(prev => [
                          ...prev,
                          {
                            id: String(Date.now()),
                            label: '',
                            payments: Math.round((prev[0]?.payments ?? baseTerms) / 2),
                            factorRate: offer.factorRate,
                          }
                        ])}
                        className="w-full py-2 border border-dashed border-gray-300 text-gray-500 text-sm rounded-lg hover:border-blue-400 hover:text-blue-500 transition-colors"
                      >
                        + Add Term Option
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">CTA Button Text</label>
                  <input
                    value={customCta}
                    onChange={(e) => setCustomCta(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Thank You Message</label>
                  <textarea
                    value={thankYouMessage}
                    onChange={(e) => setThankYouMessage(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Link Expiry (days)</label>
                  <input
                    type="number"
                    value={expiryDays}
                    onChange={(e) => setExpiryDays(e.target.value ? Number(e.target.value) : '')}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    placeholder="Never (leave blank)"
                    min={1}
                  />
                </div>

                {/* Generate / Copy */}
                <div className="pt-2 space-y-3">
                  {!generatedToken ? (
                    <button
                      onClick={generateLink}
                      disabled={generating}
                      className="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                      {generating && (
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                        </svg>
                      )}
                      {generating ? 'Generating…' : 'Generate Secure Link'}
                    </button>
                  ) : (
                    <div className="space-y-2">
                      {/* URL preview */}
                      <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl border border-gray-200">
                        <span className="text-xs text-gray-500 flex-1 truncate font-mono">
                          {portalUrl(generatedToken)}
                        </span>
                      </div>

                      {/* Copy options */}
                      <div className="grid grid-cols-3 gap-1.5">
                        <button
                          onClick={() => copyAs('url')}
                          className={`py-2 text-xs font-semibold rounded-xl transition-colors ${
                            copiedType === 'url' ? 'bg-green-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'
                          }`}
                        >
                          {copiedType === 'url' ? '✓ Copied' : 'Copy URL'}
                        </button>
                        <button
                          onClick={() => copyAs('sms')}
                          title={`Copies: "Approved Offer for ${leadName}: [url]"`}
                          className={`py-2 text-xs font-semibold rounded-xl transition-colors ${
                            copiedType === 'sms' ? 'bg-green-600 text-white' : 'bg-gray-700 text-white hover:bg-gray-800'
                          }`}
                        >
                          {copiedType === 'sms' ? '✓ Copied' : 'Copy for SMS'}
                        </button>
                        <button
                          onClick={() => copyAs('hyperlink')}
                          title={`Copies HTML: <a href="...">Approved Offer — ${leadName}</a>`}
                          className={`py-2 text-xs font-semibold rounded-xl transition-colors ${
                            copiedType === 'hyperlink' ? 'bg-green-600 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700'
                          }`}
                        >
                          {copiedType === 'hyperlink' ? '✓ Copied' : 'Copy Hyperlink'}
                        </button>
                      </div>

                      {/* SMS preview */}
                      <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                        <p className="text-xs text-blue-500 font-medium mb-0.5">SMS text preview</p>
                        <p className="text-xs text-blue-800 break-all">
                          Approved Offer for {leadName}: {portalUrl(generatedToken)}
                        </p>
                      </div>

                      <button
                        onClick={generateLink}
                        disabled={generating}
                        className="w-full py-2 text-xs font-medium text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50"
                      >
                        Regenerate Link
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT: Live Preview (simulated phone) */}
              <div className="flex-1 overflow-y-auto bg-gray-100 flex items-start justify-center p-8">
                <div className="bg-white rounded-3xl shadow-2xl overflow-hidden border-4 border-gray-800"
                  style={{ width: 375, minHeight: 600 }}>
                  {/* Phone notch */}
                  <div className="bg-gray-800 h-7 flex items-center justify-center">
                    <div className="w-20 h-3 bg-gray-700 rounded-full" />
                  </div>

                  {/* Portal content preview */}
                  <div className="p-5 space-y-4 bg-white">
                    <div>
                      <h1 className="text-xl font-bold text-gray-900">{title || 'Your Funding Offer'}</h1>
                      {leadName && <p className="text-gray-500 text-xs mt-0.5">Hi {leadName.split(' ')[0]},</p>}
                      {introMessage && <p className="text-gray-600 text-xs mt-1 leading-relaxed">{introMessage}</p>}
                    </div>

                    <div className="text-center py-2">
                      <div className="text-4xl font-bold text-gray-900">{fmt(Math.round(previewAmount))}</div>
                      <p className="text-xs text-gray-400 mt-1">
                        {fmt(minAmount)} — {fmt(offer.amount)}
                      </p>
                    </div>

                    {/* Preview slider */}
                    <div className="relative h-8 flex items-center">
                      <div className="w-full h-1.5 bg-gray-200 rounded-full relative">
                        <div className="absolute left-0 top-0 h-1.5 bg-blue-600 rounded-full" style={{ width: `${pct}%` }} />
                        <div className="absolute top-1/2 -translate-y-1/2 w-5 h-5 bg-white border-2 border-blue-600 rounded-full shadow"
                          style={{ left: `calc(${pct}% - 10px)` }} />
                      </div>
                      <input
                        type="range" min={minAmount} max={offer.amount}
                        step={1000}
                        value={previewAmount}
                        onChange={(e) => setPreviewAmount(Number(e.target.value))}
                        className="absolute inset-0 w-full opacity-0 cursor-pointer"
                      />
                    </div>

                    {/* Term display in preview */}
                    {showTermOptions && termOptions.length === 1 && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">Term:</span>
                        <span className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium border border-blue-200">
                          {termOptions[0].label || `${termOptions[0].payments} ${frequency.toLowerCase()} payments`}
                        </span>
                      </div>
                    )}
                    {showTermOptions && termOptions.length > 1 && (
                      <div>
                        <p className="text-xs text-gray-400 mb-1.5">Choose your term</p>
                        <div className="flex gap-1.5 flex-wrap">
                          {termOptions.map(opt => (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => setPreviewTermId(opt.id)}
                              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                                previewTermId === opt.id
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-gray-100 text-gray-600'
                              }`}
                            >
                              {opt.label || `${opt.payments} payments`}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="bg-gray-50 rounded-xl p-4 space-y-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Loan amount</span>
                        <span className="font-bold">{fmt(Math.round(previewAmount))}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Loan fee</span>
                        <span className="font-bold">{fmt(Math.round(previewFee))}</span>
                      </div>
                      {showTotalRepayment && (
                        <div className="flex justify-between border-t border-gray-200 pt-3">
                          <span className="font-semibold text-gray-800">Total owed</span>
                          <span className="font-bold text-base">{fmt(Math.round(previewTotalScaled))}</span>
                        </div>
                      )}
                      {showPayment && activeTerm.payments > 0 && (
                        <div className="flex justify-between items-start">
                          <span className="text-gray-600">{frequency} payment</span>
                          <div className="text-right">
                            <span className="font-bold text-blue-600">{fmt(Math.round(previewPayment))}</span>
                            {previewRevenuePct && (
                              <p className="text-xs text-gray-400">{previewRevenuePct}% of revenue</p>
                            )}
                          </div>
                        </div>
                      )}
                      {showFactor && (
                        <div className="flex justify-between">
                          <span className="text-gray-500 text-xs">Factor rate</span>
                          <span className="text-gray-700 text-xs">{activeTerm.factorRate}x</span>
                        </div>
                      )}
                    </div>

                    <button className="w-full py-3.5 bg-blue-600 text-white text-sm font-bold rounded-xl">
                      {customCta || 'I Accept This Offer'} — {fmt(Math.round(previewAmount))}
                    </button>
                    <p className="text-center text-gray-400 leading-snug" style={{ fontSize: '9px' }}>
                      Final funding amounts are subject to a final underwriting review.
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}

          {tab === 'activity' && (
            <div className="flex-1 overflow-y-auto p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-800">Activity Log</h3>
                <button
                  onClick={fetchLogs}
                  disabled={loadingLogs || !generatedToken}
                  className="text-sm text-blue-600 hover:text-blue-700 disabled:text-gray-400"
                >
                  {loadingLogs ? 'Refreshing…' : '↻ Refresh'}
                </button>
              </div>

              {!generatedToken ? (
                <div className="text-center py-16 text-gray-400">
                  <p className="text-4xl mb-3">📊</p>
                  <p>Generate a link first to see activity</p>
                </div>
              ) : logs.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                  <p className="text-4xl mb-3">⏳</p>
                  <p>No activity yet</p>
                  <p className="text-sm mt-1">Share the link — events will appear here</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {logs.map((log) => {
                    const ev = eventLabel(log.event_type);
                    return (
                      <div key={log.id} className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${ev.color}`}>
                          {ev.label}
                        </span>
                        <div className="flex-1 min-w-0">
                          {log.event_data && (
                            <div className="text-xs text-gray-600 space-x-3">
                              {typeof log.event_data.amount === 'number' && (
                                <span>Amount: <strong>{fmt(log.event_data.amount as number)}</strong></span>
                              )}
                              {typeof log.event_data.selectedAmount === 'number' && (
                                <span>Selected: <strong>{fmt(log.event_data.selectedAmount as number)}</strong></span>
                              )}
                            </div>
                          )}
                          <div className="text-xs text-gray-400 mt-0.5">
                            {formatTime(log.created_at)}
                            {log.ip_address && ` · ${log.ip_address}`}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
