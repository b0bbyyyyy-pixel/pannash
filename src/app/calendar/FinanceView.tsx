'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  blankFinance,
  DAYS_PER_MONTH,
  FINANCE_CADENCES,
  daysUntil,
  fallbackPlan,
  money,
  moneyShort,
  monthsUntil,
  newFinanceId,
  normalizeFinance,
  parseMoney,
  summarizeFinance,
  type BusinessAccount,
  type BusinessExpense,
  type FinanceCadence,
  type FinanceData,
  type FinancePlan,
  type MoneyLine,
} from '@/lib/finance/plan';

export default function FinanceView() {
  const [data, setData] = useState<FinanceData>(blankFinance());
  const [plan, setPlan] = useState<FinancePlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState('');
  const [setupRequired, setSetupRequired] = useState(false);
  const [openBizId, setOpenBizId] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;

  const totals = useMemo(() => summarizeFinance(data), [data]);
  const shownPlan = plan ?? fallbackPlan(data);
  const openBiz = data.businesses.find(b => b.id === openBizId) ?? null;

  const persist = useCallback((next: FinanceData) => {
    setSaving(true);
    fetch('/api/calendar/finance', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: next }),
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
      persist(dataRef.current);
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

  if (openBiz) {
    return (
      <BusinessDetail
        account={openBiz}
        saving={saving}
        onBack={() => setOpenBizId(null)}
        onChange={(next) => patch(d => ({
          ...d,
          businesses: d.businesses.map(b => b.id === next.id ? next : b),
        }))}
        onRemove={() => {
          setOpenBizId(null);
          patch(d => ({ ...d, businesses: d.businesses.filter(b => b.id !== openBiz.id) }));
        }}
      />
    );
  }

  const maxIncome = Math.max(1, ...data.incomes.map(r => monthlyFromSafe(r)));
  const maxDebt = Math.max(1, ...data.debts.map(r => r.balance || 0));
  const upcomingSorted = [...data.upcoming].sort((a, b) => (a.date || '9').localeCompare(b.date || '9'));

  return (
    <div className="flex-1 overflow-auto">
      <div className="px-6 py-5 max-w-[1280px]">
        {setupRequired && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 px-3 py-2 mb-4">
            Run <code className="font-mono">add-personal-finance.sql</code> in Supabase, then save again.
          </p>
        )}

        <div className="grid grid-cols-2 md:grid-cols-5 gap-x-8 gap-y-4 pb-5 border-b border-[#e5e5e5]">
          <Kpi label="Cash on hand" value={moneyShort(totals.cashTotal)} hint={`${moneyShort(totals.cashChecking)} personal · ${moneyShort(totals.cashBusiness)} business`} />
          <Kpi label="Revenue / month" value={moneyShort(totals.monthlyIncome)} hint={`${data.incomes.length || 0} source${data.incomes.length === 1 ? '' : 's'}`} />
          <Kpi label="Bills / month" value={moneyShort(totals.monthlyBills)} hint="must-pays" />
          <Kpi label="Coming up · 90d" value={moneyShort(totals.upcomingSoon)} hint={`${moneyShort(totals.upcomingYear)} this year`} />
          <Kpi label="Leftover / day" value={money(totals.dailyDiscretionary)} hint="after bills + debt mins" />
        </div>

        <div className="mt-6 pb-5 border-b border-[#e5e5e5]">
          <Head
            title="Debt"
            total={moneyShort(totals.debtTotal)}
            hint="Stays on this screen so you see it. Minimums are already in leftover."
            onAdd={() => patch(d => ({
              ...d,
              debts: [...d.debts, { id: newFinanceId(), name: '', balance: 0, minPayment: 0, apr: 0, cadence: 'monthly' }],
            }))}
          />
          {data.debts.length === 0 ? (
            <Empty>Add the balances you want staring at you — even if you are not paying them off yet.</Empty>
          ) : (
            <div className="space-y-3">
              {data.debts.map(row => (
                <div key={row.id}>
                  <div className="flex items-center gap-3">
                    <LineInput value={row.name} placeholder="Loan / card / IRS" className="flex-1 min-w-0" onChange={name => patch(d => ({ ...d, debts: d.debts.map(x => x.id === row.id ? { ...x, name } : x) }))} />
                    <span className="text-xs text-[#6b6b6b] shrink-0">$</span>
                    <MoneyField value={row.balance} className="w-28" onChange={balance => patch(d => ({ ...d, debts: d.debts.map(x => x.id === row.id ? { ...x, balance } : x) }))} />
                    <label className="hidden sm:flex items-center gap-1 text-[11px] text-[#9b9b9b] shrink-0">
                      min
                      <MoneyField value={row.minPayment} className="w-16" onChange={minPayment => patch(d => ({ ...d, debts: d.debts.map(x => x.id === row.id ? { ...x, minPayment } : x) }))} />
                    </label>
                    <label className="hidden sm:flex items-center gap-1 text-[11px] text-[#9b9b9b] shrink-0">
                      apr
                      <MoneyField value={row.apr} className="w-12" onChange={apr => patch(d => ({ ...d, debts: d.debts.map(x => x.id === row.id ? { ...x, apr } : x) }))} />
                      %
                    </label>
                    <CadenceSelect value={row.cadence} onChange={cadence => patch(d => ({ ...d, debts: d.debts.map(x => x.id === row.id ? { ...x, cadence } : x) }))} />
                    <Remove onClick={() => patch(d => ({ ...d, debts: d.debts.filter(x => x.id !== row.id) }))} />
                  </div>
                  <div className="mt-1.5 h-px bg-[#f0f0f0]">
                    <div className="h-px bg-[#c4c4c4]" style={{ width: `${Math.min(100, ((row.balance || 0) / maxDebt) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-8 mt-6 pb-6 border-b border-[#e5e5e5]">
          <div>
            <Head
              title="Revenue"
              total={moneyShort(totals.monthlyIncome)}
              hint="Where money comes in — personal draws, commissions, W-2, side work"
              onAdd={() => patch(d => ({
                ...d,
                incomes: [...d.incomes, { id: newFinanceId(), name: '', amount: 0, cadence: 'monthly' }],
              }))}
            />
            {data.incomes.length === 0 ? <Empty>Add each source separately so you can see the mix.</Empty> : data.incomes.map(row => (
              <div key={row.id} className="mb-3">
                <MoneyRow
                  row={row}
                  placeholder="Gostwrk / commission"
                  onChange={next => patch(d => ({ ...d, incomes: d.incomes.map(x => x.id === row.id ? next : x) }))}
                  onRemove={() => patch(d => ({ ...d, incomes: d.incomes.filter(x => x.id !== row.id) }))}
                />
                <div className="mt-1.5 h-px bg-[#f0f0f0]">
                  <div className="h-px bg-[#9b9b9b]" style={{ width: `${Math.min(100, (monthlyFromSafe(row) / maxIncome) * 100)}%` }} />
                </div>
                <p className="text-[10px] text-[#c4c4c4] mt-1">{money(monthlyFromSafe(row))} / month</p>
              </div>
            ))}
          </div>

          <div>
            <Head
              title="Checking"
              total={moneyShort(totals.cashChecking)}
              hint="Personal accounts — balances you can actually spend"
              onAdd={() => patch(d => ({
                ...d,
                checking: [...d.checking, { id: newFinanceId(), name: '', balance: 0 }],
              }))}
            />
            {data.checking.length === 0 ? <Empty>Add each checking / savings account you use.</Empty> : data.checking.map(row => (
              <div key={row.id} className="flex items-center gap-3 mb-2">
                <LineInput value={row.name} placeholder="Chase checking" className="flex-1" onChange={name => patch(d => ({ ...d, checking: d.checking.map(x => x.id === row.id ? { ...x, name } : x) }))} />
                <span className="text-xs text-[#6b6b6b]">$</span>
                <MoneyField value={row.balance} className="w-28" onChange={balance => patch(d => ({ ...d, checking: d.checking.map(x => x.id === row.id ? { ...x, balance } : x) }))} />
                <Remove onClick={() => patch(d => ({ ...d, checking: d.checking.filter(x => x.id !== row.id) }))} />
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 pb-6 border-b border-[#e5e5e5]">
          <Head
            title="Business"
            total={moneyShort(totals.cashBusiness)}
            hint="Balances on the dashboard. Click an account for expenses you type in."
            onAdd={() => patch(d => ({
              ...d,
              businesses: [...d.businesses, { id: newFinanceId(), name: '', balance: 0, expenses: [] }],
            }))}
          />
          {data.businesses.length === 0 ? (
            <Empty>Add operating, payroll, tax, or merchant accounts.</Empty>
          ) : (
            <div className="divide-y divide-[#f0f0f0]">
              {data.businesses.map(row => {
                const spent = row.expenses.reduce((s, e) => s + (e.amount || 0), 0);
                return (
                  <div key={row.id} className="flex items-center gap-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => setOpenBizId(row.id)}
                      className="flex-1 min-w-0 text-left bg-transparent border-0 p-0"
                    >
                      <p className="text-xs font-medium text-[#1a1a1a] truncate">{row.name || 'Untitled account'}</p>
                      <p className="text-[10px] text-[#9b9b9b] mt-0.5">
                        {row.expenses.length} expense{row.expenses.length === 1 ? '' : 's'}
                        {spent ? ` · ${moneyShort(spent)} logged` : ''}
                        {' · open'}
                      </p>
                    </button>
                    <span className="text-xs text-[#6b6b6b]">$</span>
                    <MoneyField
                      value={row.balance}
                      className="w-28"
                      onChange={balance => patch(d => ({
                        ...d,
                        businesses: d.businesses.map(x => x.id === row.id ? { ...x, balance } : x),
                      }))}
                    />
                    <Remove onClick={() => patch(d => ({ ...d, businesses: d.businesses.filter(x => x.id !== row.id) }))} />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-8 mt-6 pb-6 border-b border-[#e5e5e5]">
          <div>
            <Head
              title="Coming up"
              total={moneyShort(totals.upcomingYear)}
              hint="Christmas, holidays, trips — date and total cost"
              onAdd={() => patch(d => ({
                ...d,
                upcoming: [...d.upcoming, { id: newFinanceId(), name: '', amount: 0, date: '', notes: '' }],
              }))}
            />
            {upcomingSorted.length === 0 ? (
              <Empty>Add Christmas, birthdays, taxes, trips — anything with a date and a price.</Empty>
            ) : upcomingSorted.map(row => {
              const days = row.date ? daysUntil(row.date) : null;
              const monthly = row.date && row.amount ? row.amount / monthsUntil(row.date) : 0;
              return (
                <div key={row.id} className="mb-3">
                  <div className="flex items-center gap-3">
                    <LineInput value={row.name} placeholder="Christmas" className="flex-1 min-w-0" onChange={name => patch(d => ({ ...d, upcoming: d.upcoming.map(x => x.id === row.id ? { ...x, name } : x) }))} />
                    <input
                      type="date"
                      value={row.date}
                      onChange={e => patch(d => ({ ...d, upcoming: d.upcoming.map(x => x.id === row.id ? { ...x, date: e.target.value } : x) }))}
                      className="text-[11px] text-[#6b6b6b] bg-transparent border-0 border-b border-[#e5e5e5] py-1 focus:outline-none"
                    />
                    <span className="text-xs text-[#6b6b6b]">$</span>
                    <MoneyField value={row.amount} className="w-24" onChange={amount => patch(d => ({ ...d, upcoming: d.upcoming.map(x => x.id === row.id ? { ...x, amount } : x) }))} />
                    <Remove onClick={() => patch(d => ({ ...d, upcoming: d.upcoming.filter(x => x.id !== row.id) }))} />
                  </div>
                  <p className="text-[10px] text-[#c4c4c4] mt-1">
                    {days == null || !row.date
                      ? 'Set a date'
                      : days < 0
                        ? `${Math.abs(days)}d ago`
                        : days === 0
                          ? 'Today'
                          : `${days}d · ${money(monthly)} / month to have it`}
                  </p>
                </div>
              );
            })}
          </div>

          <div>
            <Head
              title="Monthly bills"
              total={moneyShort(totals.monthlyBills)}
              hint="Rent, utilities, insurance, subscriptions"
              onAdd={() => patch(d => ({
                ...d,
                bills: [...d.bills, { id: newFinanceId(), name: '', amount: 0, cadence: 'monthly' }],
              }))}
            />
            {data.bills.length === 0 ? <Empty>Add every bill you have to pay whether you like it or not.</Empty> : data.bills.map(row => (
              <div key={row.id} className="mb-2">
                <MoneyRow
                  row={row}
                  placeholder="Rent"
                  onChange={next => patch(d => ({ ...d, bills: d.bills.map(x => x.id === row.id ? next : x) }))}
                  onRemove={() => patch(d => ({ ...d, bills: d.bills.filter(x => x.id !== row.id) }))}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-x-12 gap-y-8 mt-6">
          <div>
            <Head
              title="Daily plan"
              hint="AI splits leftover after bills and debt minimums"
              action={(
                <button
                  type="button"
                  onClick={runPlan}
                  disabled={planning}
                  className="text-[11px] font-medium text-[#6b6b6b] hover:text-[#1a1a1a] disabled:opacity-40"
                >
                  {planning ? 'Planning…' : 'Plan my days'}
                </button>
              )}
            />
            {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
            <div className="space-y-3">
              {shownPlan.allocations.map((a, i) => (
                <div key={`${a.name}-${i}`} className="flex items-start justify-between gap-4 border-b border-[#f0f0f0] pb-2.5">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-[#1a1a1a]">{a.name}</p>
                    <p className="text-[11px] text-[#6b6b6b] mt-0.5">{a.why}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-[#9b9b9b]">{money(a.perDay)}/day</p>
                    <p className="text-[10px] text-[#c4c4c4]">{money(a.perMonth)} / mo</p>
                  </div>
                </div>
              ))}
            </div>
            {shownPlan.advice && (
              <p className="mt-4 text-xs text-[#6b6b6b] leading-relaxed">{shownPlan.advice}</p>
            )}
          </div>

          <div>
            <Head
              title="Important"
              hint="Emergency fund, kids, anything you want funded"
              onAdd={() => patch(d => ({
                ...d,
                important: [...d.important, { id: newFinanceId(), name: '', amount: 0, cadence: 'monthly' }],
              }))}
            />
            {data.important.map(row => (
              <div key={row.id} className="mb-2">
                <MoneyRow
                  row={row}
                  placeholder="Emergency fund"
                  onChange={next => patch(d => ({ ...d, important: d.important.map(x => x.id === row.id ? next : x) }))}
                  onRemove={() => patch(d => ({ ...d, important: d.important.filter(x => x.id !== row.id) }))}
                />
              </div>
            ))}
            <textarea
              value={data.notes}
              onChange={e => patch(d => ({ ...d, notes: e.target.value }))}
              rows={3}
              placeholder="Notes"
              className="mt-4 w-full text-xs text-[#1a1a1a] resize-none focus:outline-none border-b border-[#e5e5e5] py-1 bg-transparent"
            />
            <p className="text-[10px] text-[#c4c4c4] mt-3">{saving ? 'Saving…' : 'Saved as you type'}</p>
            <p className="text-[10px] text-[#c4c4c4] mt-1">
              Net cash {moneyShort(totals.netCash)} · {DAYS_PER_MONTH}-day month
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function BusinessDetail({
  account,
  saving,
  onBack,
  onChange,
  onRemove,
}: {
  account: BusinessAccount;
  saving: boolean;
  onBack: () => void;
  onChange: (a: BusinessAccount) => void;
  onRemove: () => void;
}) {
  const spent = account.expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const expenses = [...account.expenses].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const thisMonth = new Date().toISOString().slice(0, 7);
  const spentMonth = account.expenses
    .filter(e => (e.date || '').startsWith(thisMonth))
    .reduce((s, e) => s + (e.amount || 0), 0);

  function patchExp(id: string, next: Partial<BusinessExpense>) {
    onChange({
      ...account,
      expenses: account.expenses.map(e => e.id === id ? { ...e, ...next } : e),
    });
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="px-6 py-5 max-w-[860px]">
        <div className="flex items-center justify-between gap-3 mb-6">
          <button type="button" onClick={onBack} className="text-[11px] font-medium text-[#6b6b6b] hover:text-[#1a1a1a]">
            ← Finance
          </button>
          <button type="button" onClick={onRemove} className="text-[11px] text-[#c4c4c4] hover:text-[#1a1a1a]">
            Remove account
          </button>
        </div>

        <LineInput
          value={account.name}
          placeholder="Operating account"
          className="w-full text-sm font-medium"
          onChange={name => onChange({ ...account, name })}
        />

        <div className="grid grid-cols-3 gap-6 mt-5 pb-5 border-b border-[#e5e5e5]">
          <Kpi label="In this account" value={money(account.balance)} />
          <Kpi label="Logged expenses" value={money(spent)} hint="all time" />
          <Kpi label="This month" value={money(spentMonth)} />
        </div>

        <div className="mt-6 flex items-center gap-3">
          <span className="text-[11px] text-[#9b9b9b]">Balance $</span>
          <MoneyField value={account.balance} className="w-32" onChange={balance => onChange({ ...account, balance })} />
        </div>

        <div className="mt-8">
          <Head
            title="Expenses"
            hint="What you actually spent from this account — you type it in"
            onAdd={() => onChange({
              ...account,
              expenses: [{
                id: newFinanceId(),
                name: '',
                amount: 0,
                date: new Date().toISOString().slice(0, 10),
                notes: '',
              }, ...account.expenses],
            })}
          />
          {expenses.length === 0 ? (
            <Empty>No expenses yet. Add payroll, software, ads, owner draws.</Empty>
          ) : expenses.map(row => (
            <div key={row.id} className="flex flex-wrap items-center gap-3 mb-2.5">
              <input
                type="date"
                value={row.date}
                onChange={e => patchExp(row.id, { date: e.target.value })}
                className="text-[11px] text-[#6b6b6b] bg-transparent border-0 border-b border-[#e5e5e5] py-1 focus:outline-none"
              />
              <LineInput
                value={row.name}
                placeholder="Payroll"
                className="flex-1 min-w-[140px]"
                onChange={name => patchExp(row.id, { name })}
              />
              <span className="text-xs text-[#6b6b6b]">$</span>
              <MoneyField value={row.amount} className="w-24" onChange={amount => patchExp(row.id, { amount })} />
              <LineInput
                value={row.notes}
                placeholder="note"
                className="w-36"
                onChange={notes => patchExp(row.id, { notes })}
              />
              <Remove onClick={() => onChange({ ...account, expenses: account.expenses.filter(e => e.id !== row.id) })} />
            </div>
          ))}
        </div>
        <p className="text-[10px] text-[#c4c4c4] mt-4">{saving ? 'Saving…' : 'Saved as you type'}</p>
      </div>
    </div>
  );
}

function monthlyFromSafe(row: MoneyLine) {
  const found = FINANCE_CADENCES.find(c => c.id === row.cadence);
  return (row.amount || 0) * (found?.perMonth ?? 1);
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-[#9b9b9b]">{label}</p>
      <p className="text-sm font-medium text-[#9b9b9b] mt-1">{value}</p>
      {hint ? <p className="text-[10px] text-[#c4c4c4] mt-0.5">{hint}</p> : null}
    </div>
  );
}

function Head({
  title,
  total,
  hint,
  onAdd,
  action,
}: {
  title: string;
  total?: string;
  hint?: string;
  onAdd?: () => void;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2 min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-[#9b9b9b]">{title}</p>
          {total ? <p className="text-[11px] text-[#c4c4c4]">{total}</p> : null}
        </div>
        {onAdd ? (
          <button type="button" onClick={onAdd} className="text-[11px] text-[#6b6b6b] hover:text-[#1a1a1a]">+ Add</button>
        ) : action}
      </div>
      {hint ? <p className="text-[11px] text-[#c4c4c4] mt-0.5">{hint}</p> : null}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-[#c4c4c4]">{children}</p>;
}

function LineInput({
  value,
  onChange,
  placeholder,
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <input
      value={value}
      placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      className={`text-xs text-[#1a1a1a] bg-transparent border-0 border-b border-[#e5e5e5] py-1 focus:outline-none ${className}`}
    />
  );
}

function MoneyField({
  value,
  onChange,
  className = 'w-24',
}: {
  value: number;
  onChange: (n: number) => void;
  className?: string;
}) {
  return (
    <input
      inputMode="decimal"
      value={value ? String(value) : ''}
      placeholder="0"
      onChange={e => onChange(parseMoney(e.target.value))}
      className={`${className} text-xs text-[#1a1a1a] bg-transparent border-0 border-b border-[#e5e5e5] py-1 focus:outline-none`}
    />
  );
}

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

function MoneyRow({
  row,
  placeholder,
  onChange,
  onRemove,
}: {
  row: MoneyLine;
  placeholder: string;
  onChange: (row: MoneyLine) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <LineInput value={row.name} placeholder={placeholder} className="flex-1 min-w-0" onChange={name => onChange({ ...row, name })} />
      <span className="text-xs text-[#6b6b6b]">$</span>
      <MoneyField value={row.amount} onChange={amount => onChange({ ...row, amount })} />
      <CadenceSelect value={row.cadence} onChange={cadence => onChange({ ...row, cadence })} />
      <Remove onClick={onRemove} />
    </div>
  );
}

function Remove({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="text-[#c4c4c4] hover:text-[#1a1a1a] text-sm">×</button>
  );
}
