'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  blankFinance,
  FINANCE_CADENCES,
  fallbackPlan,
  money,
  newFinanceId,
  normalizeFinance,
  parseMoney,
  summarizeFinance,
  type DebtLine,
  type FinanceCadence,
  type FinanceData,
  type FinancePlan,
} from '@/lib/finance/plan';

function CadenceSelect({
  value,
  onChange,
}: {
  value: FinanceCadence;
  onChange: (v: FinanceCadence) => void;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value as FinanceCadence)}
      className="text-[11px] text-[#6b6b6b] bg-transparent border-0 border-b border-[#e5e5e5] py-1 pr-1 focus:outline-none"
    >
      {FINANCE_CADENCES.map(c => (
        <option key={c.id} value={c.id}>{c.label}</option>
      ))}
    </select>
  );
}

function MoneyField({
  value,
  onChange,
  placeholder = '0',
  className = 'w-24',
}: {
  value: number;
  onChange: (n: number) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <input
      inputMode="decimal"
      value={value ? String(value) : ''}
      placeholder={placeholder}
      onChange={e => onChange(parseMoney(e.target.value))}
      className={`${className} text-xs text-[#1a1a1a] bg-transparent border-0 border-b border-[#e5e5e5] py-1 focus:outline-none`}
    />
  );
}

export default function FinanceView() {
  const [data, setData] = useState<FinanceData>(blankFinance());
  const [plan, setPlan] = useState<FinancePlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState('');
  const [setupRequired, setSetupRequired] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;

  const totals = useMemo(() => summarizeFinance(data), [data]);
  const shownPlan = plan ?? fallbackPlan(data);

  const persist = useCallback((next: FinanceData, extraPlan?: FinancePlan | null) => {
    setSaving(true);
    fetch('/api/calendar/finance', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: next, plan: extraPlan === undefined ? undefined : extraPlan }),
    })
      .then(async (res) => {
        const d = await res.json().catch(() => ({}));
        if (d.setupRequired) setSetupRequired(true);
        if (!res.ok) setError(d.error || 'Could not save');
        else setError('');
      })
      .catch(() => setError('Could not save'))
      .finally(() => setSaving(false));
  }, []);

  const queueSave = useCallback((next: FinanceData) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => persist(next), 500);
  }, [persist]);

  const patch = useCallback((fn: (prev: FinanceData) => FinanceData) => {
    setData((prev) => {
      const next = fn(prev);
      queueSave(next);
      return next;
    });
  }, [queueSave]);

  useEffect(() => {
    fetch('/api/calendar/finance')
      .then(r => r.json())
      .then((d) => {
        if (d.setupRequired) setSetupRequired(true);
        if (d.data) setData(normalizeFinance(d.data));
        if (d.plan && Array.isArray(d.plan.allocations)) setPlan(d.plan);
      })
      .catch(() => setError('Could not load finance'))
      .finally(() => setLoading(false));
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, []);

  async function runPlan() {
    setPlanning(true);
    setError('');
    try {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      const res = await fetch('/api/calendar/finance/advise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: dataRef.current }),
      });
      const d = await res.json().catch(() => ({}));
      if (d.setupRequired) setSetupRequired(true);
      if (!res.ok) {
        setError(d.error || 'Could not build a plan');
        setPlan(fallbackPlan(dataRef.current));
        return;
      }
      if (d.plan) setPlan(d.plan);
    } catch {
      setError('Could not build a plan');
      setPlan(fallbackPlan(dataRef.current));
    } finally {
      setPlanning(false);
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#e5e5e5] border-t-[#1a1a1a] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] min-h-full">
        <div className="p-6 border-r border-[#e5e5e5]">
          {setupRequired && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 px-3 py-2 mb-4">
              Run <code className="font-mono">add-personal-finance.sql</code> in Supabase, then save again.
            </p>
          )}

          <Section
            title="Money in"
            hint="Paychecks, draws, side income"
            onAdd={() => patch(d => ({
              ...d,
              incomes: [...d.incomes, { id: newFinanceId(), name: '', amount: 0, cadence: 'monthly' }],
            }))}
          >
            {data.incomes.map(row => (
              <MoneyRow
                key={row.id}
                name={row.name}
                amount={row.amount}
                cadence={row.cadence}
                namePlaceholder="Paycheck"
                onName={name => patch(d => ({ ...d, incomes: d.incomes.map(x => x.id === row.id ? { ...x, name } : x) }))}
                onAmount={amount => patch(d => ({ ...d, incomes: d.incomes.map(x => x.id === row.id ? { ...x, amount } : x) }))}
                onCadence={cadence => patch(d => ({ ...d, incomes: d.incomes.map(x => x.id === row.id ? { ...x, cadence } : x) }))}
                onRemove={() => patch(d => ({ ...d, incomes: d.incomes.filter(x => x.id !== row.id) }))}
              />
            ))}
          </Section>

          <Section
            title="Monthly bills"
            hint="Rent, utilities, insurance, subscriptions"
            onAdd={() => patch(d => ({
              ...d,
              bills: [...d.bills, { id: newFinanceId(), name: '', amount: 0, cadence: 'monthly' }],
            }))}
          >
            {data.bills.map(row => (
              <MoneyRow
                key={row.id}
                name={row.name}
                amount={row.amount}
                cadence={row.cadence}
                namePlaceholder="Rent"
                onName={name => patch(d => ({ ...d, bills: d.bills.map(x => x.id === row.id ? { ...x, name } : x) }))}
                onAmount={amount => patch(d => ({ ...d, bills: d.bills.map(x => x.id === row.id ? { ...x, amount } : x) }))}
                onCadence={cadence => patch(d => ({ ...d, bills: d.bills.map(x => x.id === row.id ? { ...x, cadence } : x) }))}
                onRemove={() => patch(d => ({ ...d, bills: d.bills.filter(x => x.id !== row.id) }))}
              />
            ))}
          </Section>

          <Section
            title="Debt"
            hint="Credit cards, car, personal loans — balance, minimum, APR"
            onAdd={() => patch(d => ({
              ...d,
              debts: [...d.debts, { id: newFinanceId(), name: '', balance: 0, minPayment: 0, apr: 0, cadence: 'monthly' }],
            }))}
          >
            {data.debts.map(row => (
              <DebtRow
                key={row.id}
                row={row}
                onChange={next => patch(d => ({ ...d, debts: d.debts.map(x => x.id === row.id ? next : x) }))}
                onRemove={() => patch(d => ({ ...d, debts: d.debts.filter(x => x.id !== row.id) }))}
              />
            ))}
          </Section>

          <Section
            title="Important"
            hint="Emergency fund, kids, savings — what you want funded"
            onAdd={() => patch(d => ({
              ...d,
              important: [...d.important, { id: newFinanceId(), name: '', amount: 0, cadence: 'monthly' }],
            }))}
          >
            {data.important.map(row => (
              <MoneyRow
                key={row.id}
                name={row.name}
                amount={row.amount}
                cadence={row.cadence}
                namePlaceholder="Emergency fund"
                onName={name => patch(d => ({ ...d, important: d.important.map(x => x.id === row.id ? { ...x, name } : x) }))}
                onAmount={amount => patch(d => ({ ...d, important: d.important.map(x => x.id === row.id ? { ...x, amount } : x) }))}
                onCadence={cadence => patch(d => ({ ...d, important: d.important.map(x => x.id === row.id ? { ...x, cadence } : x) }))}
                onRemove={() => patch(d => ({ ...d, important: d.important.filter(x => x.id !== row.id) }))}
              />
            ))}
          </Section>

          <div className="mt-6">
            <p className="text-[10px] uppercase tracking-wider text-[#9b9b9b] mb-1">Notes</p>
            <textarea
              value={data.notes}
              onChange={e => patch(d => ({ ...d, notes: e.target.value }))}
              rows={3}
              placeholder="Anything else money-related that matters"
              className="w-full text-xs text-[#1a1a1a] resize-none focus:outline-none border-b border-[#e5e5e5] py-1 bg-transparent"
            />
          </div>
          <p className="text-[10px] text-[#c4c4c4] mt-3">{saving ? 'Saving…' : 'Saved as you type'}</p>
        </div>

        <div className="p-6 bg-[#fafafa]">
          <p className="text-[10px] uppercase tracking-wider text-[#9b9b9b] mb-3">Daily leftover</p>
          <p className="text-sm font-medium text-[#9b9b9b]">
            {money(totals.dailyDiscretionary)}
          </p>
          <p className="text-[11px] text-[#9b9b9b] mt-1">after bills and debt minimums · 30.44-day month</p>

          <dl className="mt-5 space-y-1.5 text-xs">
            <Row label="Money in / month" value={money(totals.monthlyIncome)} />
            <Row label="Bills / month" value={money(totals.monthlyBills)} />
            <Row label="Debt minimums / month" value={money(totals.monthlyDebtMin)} />
            <Row label="Left / month" value={money(totals.leftoverMonthly)} />
          </dl>

          <button
            type="button"
            onClick={runPlan}
            disabled={planning}
            className="mt-6 text-[11px] font-medium uppercase tracking-wide text-[#1a1a1a] disabled:opacity-40"
          >
            {planning ? 'Planning…' : 'Plan my days'}
          </button>
          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

          <div className="mt-6 space-y-3">
            <p className="text-[10px] uppercase tracking-wider text-[#9b9b9b]">Put this toward</p>
            {shownPlan.allocations.map((a, i) => (
              <div key={`${a.name}-${i}`} className="border-b border-[#e5e5e5] pb-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-xs font-medium text-[#1a1a1a]">{a.name}</p>
                  <p className="text-xs font-medium text-[#1a1a1a] shrink-0">{money(a.perDay)}/day</p>
                </div>
                <p className="text-[11px] text-[#6b6b6b] mt-0.5">{a.why}</p>
                <p className="text-[10px] text-[#9b9b9b] mt-0.5">{money(a.perMonth)} / month</p>
              </div>
            ))}
          </div>

          {shownPlan.advice && (
            <p className="mt-5 text-xs text-[#555] leading-relaxed">{shownPlan.advice}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  hint,
  onAdd,
  children,
}: {
  title: string;
  hint: string;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-8">
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <p className="text-[10px] uppercase tracking-wider text-[#9b9b9b]">{title}</p>
        <button type="button" onClick={onAdd} className="text-[11px] text-[#6b6b6b] hover:text-[#1a1a1a]">
          + Add
        </button>
      </div>
      <p className="text-[11px] text-[#c4c4c4] mb-3">{hint}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function MoneyRow({
  name,
  amount,
  cadence,
  namePlaceholder,
  onName,
  onAmount,
  onCadence,
  onRemove,
}: {
  name: string;
  amount: number;
  cadence: FinanceCadence;
  namePlaceholder: string;
  onName: (v: string) => void;
  onAmount: (n: number) => void;
  onCadence: (c: FinanceCadence) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        value={name}
        onChange={e => onName(e.target.value)}
        placeholder={namePlaceholder}
        className="flex-1 min-w-0 text-xs text-[#1a1a1a] bg-transparent border-0 border-b border-[#e5e5e5] py-1 focus:outline-none"
      />
      <span className="text-[11px] text-[#9b9b9b]">$</span>
      <MoneyField value={amount} onChange={onAmount} />
      <CadenceSelect value={cadence} onChange={onCadence} />
      <button type="button" onClick={onRemove} className="text-[#c4c4c4] hover:text-[#1a1a1a] text-sm">×</button>
    </div>
  );
}

function DebtRow({
  row,
  onChange,
  onRemove,
}: {
  row: DebtLine;
  onChange: (row: DebtLine) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        value={row.name}
        onChange={e => onChange({ ...row, name: e.target.value })}
        placeholder="Card / loan"
        className="flex-1 min-w-[140px] text-xs text-[#1a1a1a] bg-transparent border-0 border-b border-[#e5e5e5] py-1 focus:outline-none"
      />
      <label className="flex items-center gap-1 text-[11px] text-[#9b9b9b]">
        bal $
        <MoneyField value={row.balance} onChange={balance => onChange({ ...row, balance })} className="w-20" />
      </label>
      <label className="flex items-center gap-1 text-[11px] text-[#9b9b9b]">
        min $
        <MoneyField value={row.minPayment} onChange={minPayment => onChange({ ...row, minPayment })} className="w-16" />
      </label>
      <label className="flex items-center gap-1 text-[11px] text-[#9b9b9b]">
        apr
        <MoneyField value={row.apr} onChange={apr => onChange({ ...row, apr })} className="w-12" />
        %
      </label>
      <CadenceSelect value={row.cadence} onChange={cadence => onChange({ ...row, cadence })} />
      <button type="button" onClick={onRemove} className="text-[#c4c4c4] hover:text-[#1a1a1a] text-sm">×</button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-[#6b6b6b]">{label}</dt>
      <dd className="text-[#1a1a1a] font-medium">{value}</dd>
    </div>
  );
}

