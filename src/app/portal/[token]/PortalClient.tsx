'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface TermOption {
  id: string;
  label: string;
  payments: number;
  factorRate: number;
}

interface Portal {
  id: string;
  lead_name: string | null;
  offer_amount: number;
  factor_rate: number;
  total_repayment: number | null;
  term_payments: number | null;
  frequency: string;
  title: string;
  intro_message: string | null;
  min_amount: number;
  show_factor: boolean;
  show_total_repayment: boolean;
  show_payment: boolean;
  custom_cta: string;
  thank_you_message: string;
  show_term_options: boolean;
  term_options: TermOption[] | null;
  avg_monthly_revenue: number | null;
  show_revenue_percent: boolean;
  fee_disclaimer: string | null;
}

interface Props {
  portal: Portal;
  token: string;
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

export default function PortalClient({ portal, token }: Props) {
  const maxAmount = portal.offer_amount;
  const minAmount = portal.min_amount ?? 0;
  const [amount, setAmount] = useState(maxAmount);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const sliderDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasLoggedOpen = useRef(false);

  // Term selection
  const terms: TermOption[] = portal.show_term_options && portal.term_options?.length
    ? portal.term_options
    : [];
  const [selectedTermId, setSelectedTermId] = useState<string>(terms[0]?.id ?? '');
  const activeTerm = terms.find(t => t.id === selectedTermId) ?? terms[0] ?? null;

  const log = useCallback((eventType: string, eventData?: object) => {
    fetch(`/api/portal/${token}/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventType, eventData }),
    }).catch(() => {});
  }, [token]);

  // Log open once
  useEffect(() => {
    if (!hasLoggedOpen.current) {
      hasLoggedOpen.current = true;
      log('open', { amount: maxAmount });
    }
  }, [log, maxAmount]);

  // Recalculate based on selected amount + active term
  const effectiveFactor = activeTerm?.factorRate ?? portal.factor_rate;
  const effectivePayments = activeTerm?.payments ?? portal.term_payments ?? 52;
  const totalRepayment = amount * effectiveFactor;
  const loanFee = totalRepayment - amount;
  const payment = effectivePayments > 0 ? totalRepayment / effectivePayments : 0;

  // Revenue % (computed outside JSX to avoid IIFE)
  const revFreqLower = portal.frequency.toLowerCase();
  const revMonthlyPayment = revFreqLower === 'weekly'
    ? payment * 4.33
    : revFreqLower === 'daily'
    ? payment * 22
    : payment;
  const revenuePct = portal.show_revenue_percent && portal.avg_monthly_revenue && portal.avg_monthly_revenue > 0
    ? ((revMonthlyPayment / portal.avg_monthly_revenue) * 100).toFixed(1)
    : null;

  function handleSliderChange(val: number) {
    setAmount(val);
    if (sliderDebounceRef.current) clearTimeout(sliderDebounceRef.current);
    sliderDebounceRef.current = setTimeout(() => {
      log('slider_change', { amount: val, totalRepayment: Math.round(totalRepayment), payment: Math.round(payment) });
    }, 600);
  }

  async function handleSubmit() {
    setSubmitting(true);
    log('submit', {
      selectedAmount: amount,
      totalRepayment: Math.round(totalRepayment),
      term: activeTerm ? { label: activeTerm.label, payments: activeTerm.payments } : null,
    });
    await new Promise(r => setTimeout(r, 800));
    setSubmitted(true);
    setSubmitting(false);
  }

  const pct = maxAmount > minAmount ? ((amount - minAmount) / (maxAmount - minAmount)) * 100 : 100;

  if (submitted) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-6">
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">You&apos;re all set!</h1>
        <p className="text-gray-600 leading-relaxed max-w-xs">{portal.thank_you_message}</p>
        <div className="mt-8 bg-gray-50 rounded-2xl p-5 w-full max-w-xs text-left">
          <p className="text-xs text-gray-500 mb-1">Selected Amount</p>
          <p className="text-2xl font-bold text-gray-900">{fmt(amount)}</p>
          {portal.show_total_repayment && (
            <>
              <p className="text-xs text-gray-500 mt-3 mb-1">Total Repayment</p>
              <p className="text-lg font-semibold text-gray-700">{fmt(Math.round(totalRepayment))}</p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col max-w-md mx-auto">
      {/* Header */}
      <div className="px-6 pt-10 pb-4">
        <h1 className="text-2xl font-bold text-gray-900">{portal.title}</h1>
        {portal.lead_name && (
          <p className="text-gray-500 mt-1 text-sm">Hi {portal.lead_name.split(' ')[0]},</p>
        )}
        {portal.intro_message && (
          <p className="text-gray-600 mt-2 text-sm leading-relaxed">{portal.intro_message}</p>
        )}
      </div>

      <div className="flex-1 px-6 pb-8 space-y-6">
        {/* Big amount */}
        <div className="text-center pt-2">
          <div className="text-5xl font-bold text-gray-900 tracking-tight">
            {fmt(amount)}
          </div>
          <p className="text-sm text-gray-400 mt-2">
            Choose an amount from {fmt(minAmount)} to {fmt(maxAmount)}
          </p>
        </div>

        {/* Slider */}
        <div className="relative">
          <div className="relative h-2 bg-gray-200 rounded-full">
            <div
              className="absolute left-0 top-0 h-2 rounded-full bg-blue-600 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <input
            type="range"
            min={minAmount}
            max={maxAmount}
            step={1000}
            value={amount}
            onChange={(e) => handleSliderChange(Number(e.target.value))}
            className="absolute inset-0 w-full opacity-0 cursor-pointer h-2"
            style={{ WebkitAppearance: 'none' }}
          />
          {/* Thumb */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-6 h-6 bg-white border-2 border-blue-600 rounded-full shadow-md pointer-events-none transition-all"
            style={{ left: `calc(${pct}% - 12px)` }}
          />
        </div>

        {/* Term display — badge for 1 option, selectable pills for 2+ */}
        {terms.length === 1 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Term:</span>
            <span className="px-4 py-1.5 bg-blue-50 border border-blue-200 text-blue-700 rounded-full text-sm font-medium">
              {terms[0].label || `${terms[0].payments} ${portal.frequency.toLowerCase()} payments`}
            </span>
          </div>
        )}
        {terms.length > 1 && (
          <div>
            <p className="text-xs text-gray-500 mb-2 font-medium">Choose your term</p>
            <div className="flex gap-2 flex-wrap">
              {terms.map(term => (
                <button
                  key={term.id}
                  type="button"
                  onClick={() => {
                    setSelectedTermId(term.id);
                    log('term_change', { termId: term.id, label: term.label, payments: term.payments });
                  }}
                  className={`flex-1 py-3 px-3 rounded-xl border-2 text-sm font-medium transition-all ${
                    selectedTermId === term.id
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <div className="font-semibold">{term.label || `${term.payments} payments`}</div>
                  <div className="text-xs mt-0.5 opacity-75">
                    {fmt(Math.round(amount * term.factorRate / term.payments))}/{portal.frequency.toLowerCase().replace('ly','')}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Details card */}
        <div className="bg-gray-50 rounded-2xl p-5 space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-gray-700 font-medium">Loan amount</span>
            <span className="font-bold text-gray-900">{fmt(amount)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-700 font-medium">Loan fee</span>
            <div className="text-right">
              <span className="font-bold text-gray-900">{fmt(Math.round(loanFee))}</span>
            </div>
          </div>
          {portal.show_total_repayment && (
            <div className="flex justify-between items-center border-t border-gray-200 pt-4">
              <span className="text-gray-900 font-semibold">Total owed</span>
              <span className="font-bold text-gray-900 text-lg">{fmt(Math.round(totalRepayment))}</span>
            </div>
          )}
          {portal.show_payment && effectivePayments > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-gray-700 font-medium">{portal.frequency} payment</span>
              <div className="text-right">
                <span className="font-bold text-blue-600">{fmt(Math.round(payment))}</span>
                {revenuePct && (
                  <p className="text-xs text-gray-400 mt-0.5">{revenuePct}% of avg monthly revenue</p>
                )}
              </div>
            </div>
          )}
          {portal.show_factor && (
            <div className="flex justify-between items-center">
              <span className="text-gray-500 text-sm">Factor rate</span>
              <span className="text-gray-700 text-sm font-medium">{effectiveFactor}x</span>
            </div>
          )}
        </div>

        {portal.fee_disclaimer && (
          <p className="text-xs text-gray-400 text-center leading-relaxed">
            {portal.fee_disclaimer}
          </p>
        )}

        {/* CTA */}
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full py-4 bg-blue-600 text-white text-lg font-semibold rounded-2xl shadow-lg hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-70 flex items-center justify-center gap-2"
        >
          {submitting ? (
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
          ) : null}
          {submitting ? 'Submitting…' : `${portal.custom_cta} — ${fmt(amount)}`}
        </button>

        <p className="text-xs text-gray-400 text-center leading-relaxed px-2">
          Final funding amounts are subject to a final underwriting review and may be adjusted prior to disbursement.
        </p>
      </div>
    </div>
  );
}
