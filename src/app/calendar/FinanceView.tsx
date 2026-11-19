'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  blankFinance,
  FINANCE_CADENCES,
  money,
  moneyShort,
  monthlyFrom,
  newFinanceId,
  normalizeFinance,
  parseMoney,
  summarizeFinance,
  type BusinessAccount,
  type BusinessExpense,
  type FinanceCadence,
  type FinanceData,
} from '@/lib/finance/plan';

const GRAYS = ['#1a1a1a', '#525252', '#737373', '#a3a3a3', '#d4d4d4'];
const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function FinanceView() {
  const [data, setData] = useState<FinanceData>(blankFinance());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [setupRequired, setSetupRequired] = useState(false);
  const [openBizId, setOpenBizId] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const totals = useMemo(() => summarizeFinance(data), [data]);
  const openBiz = data.businesses.find(b => b.id === openBizId) ?? null;
  const spend = useMemo(() => spendingSlices(data), [data]);
  const todayIdx = (new Date().getDay() + 6) % 7;
  const outflow = totals.monthlyBills + totals.monthlyDebtMin;
  const inShare = totals.monthlyIncome > 0 ? Math.min(100, (outflow / totals.monthlyIncome) * 100) : 0;
  const leftShare = Math.max(0, 100 - inShare);
  const upcomingSorted = [...data.upcoming].sort((a, b) => (a.date || '9').localeCompare(b.date || '9'));
  const expenses = useMemo(() => {
    const rows = data.businesses.flatMap(b =>
      b.expenses.map(e => ({ ...e, account: b.name || 'Business', accountId: b.id })),
    );
    return rows.sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 6);
  }, [data.businesses]);
  const netPts = useMemo(() => {
    const start = totals.netCash;
    const day = totals.dailyDiscretionary;
    return WEEK.map((_, i) => start + day * i);
  }, [totals.netCash, totals.dailyDiscretionary]);

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
      })
      .catch(() => setError('Could not load finance'))
      .finally(() => setLoading(false));
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, []);

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

  const accounts = [
    ...data.checking.map(a => ({ id: a.id, name: a.name, balance: a.balance, kind: 'checking' as const })),
    ...data.businesses.map(a => ({ id: a.id, name: a.name, balance: a.balance, kind: 'business' as const })),
  ];

  return (
    <div className="relative flex-1 min-h-0 overflow-hidden bg-[#f4f4f4] p-3">
      <div className="h-full grid grid-cols-3 grid-rows-[minmax(0,0.95fr)_minmax(0,1.15fr)_minmax(0,1fr)] gap-3">

        <Panel>
          <RowHead
            title="Cash"
            right={saving ? 'Saving' : error || ''}
            add={() => patch(d => ({ ...d, checking: [...d.checking, { id: newFinanceId(), name: '', balance: 0 }] }))}
          />
          <p className="text-[22px] font-semibold tracking-tight text-[#1a1a1a] mt-1 leading-none">{money(totals.cashTotal)}</p>
          <p className="text-[11px] text-[#9b9b9b] mt-1.5">{money(totals.dailyDiscretionary)} leftover / day</p>
          <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
            {accounts.length === 0 ? (
              <p className="text-[11px] text-[#b0b0b0]">Add checking or a business account</p>
            ) : accounts.map(a => (
              <div key={`${a.kind}-${a.id}`} className="flex items-center gap-2 py-1">
                {a.kind === 'business' ? (
                  <button type="button" onClick={() => setOpenBizId(a.id)} className="flex-1 min-w-0 text-left text-[11px] text-[#6b6b6b] truncate">
                    {a.name || 'Business'}
                  </button>
                ) : (
                  <LineInput
                    value={data.checking.find(x => x.id === a.id)?.name || ''}
                    placeholder="Checking"
                    className="flex-1"
                    onChange={name => patch(d => ({ ...d, checking: d.checking.map(x => x.id === a.id ? { ...x, name } : x) }))}
                  />
                )}
                {a.kind === 'checking' ? (
                  <MoneyField
                    value={a.balance}
                    className="w-[4.5rem] text-right"
                    onChange={balance => patch(d => ({ ...d, checking: d.checking.map(x => x.id === a.id ? { ...x, balance } : x) }))}
                  />
                ) : (
                  <MoneyField
                    value={a.balance}
                    className="w-[4.5rem] text-right"
                    onChange={balance => patch(d => ({
                      ...d,
                      businesses: d.businesses.map(x => x.id === a.id ? { ...x, balance } : x),
                    }))}
                  />
                )}
                <Remove onClick={() => patch(d => a.kind === 'checking'
                  ? { ...d, checking: d.checking.filter(x => x.id !== a.id) }
                  : { ...d, businesses: d.businesses.filter(x => x.id !== a.id) })} />
              </div>
            ))}
            <button
              type="button"
              onClick={() => patch(d => ({
                ...d,
                businesses: [...d.businesses, { id: newFinanceId(), name: '', balance: 0, expenses: [] }],
              }))}
              className="mt-1 text-[11px] text-[#9b9b9b] hover:text-[#1a1a1a]"
            >
              + Business
            </button>
          </div>
        </Panel>

        <Panel>
          <RowHead
            title="Revenue"
            add={() => patch(d => ({ ...d, incomes: [...d.incomes, { id: newFinanceId(), name: '', amount: 0, cadence: 'monthly' }] }))}
          />
          <p className="text-[22px] font-semibold tracking-tight text-[#1a1a1a] mt-1 leading-none">{money(totals.monthlyIncome)}</p>
          <p className="text-[11px] text-[#9b9b9b] mt-1.5">/ month</p>
          <div className="mt-2 min-h-0 flex-1 overflow-y-auto grid grid-cols-2 gap-x-4 content-start">
            {data.incomes.length === 0 ? (
              <p className="col-span-2 text-[11px] text-[#b0b0b0]">Add a source</p>
            ) : data.incomes.map(row => (
              <div key={row.id} className="py-1 min-w-0">
                <LineInput value={row.name} placeholder="Source" className="w-full" onChange={name => patch(d => ({ ...d, incomes: d.incomes.map(x => x.id === row.id ? { ...x, name } : x) }))} />
                <div className="flex items-center gap-1">
                  <MoneyField value={row.amount} className="flex-1" onChange={amount => patch(d => ({ ...d, incomes: d.incomes.map(x => x.id === row.id ? { ...x, amount } : x) }))} />
                  <CadenceSelect value={row.cadence} onChange={cadence => patch(d => ({ ...d, incomes: d.incomes.map(x => x.id === row.id ? { ...x, cadence } : x) }))} />
                  <Remove onClick={() => patch(d => ({ ...d, incomes: d.incomes.filter(x => x.id !== row.id) }))} />
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <RowHead title="Bills" extra={`${money(totals.dailyDiscretionary)} / day`} />
          <p className="text-[22px] font-semibold tracking-tight text-[#1a1a1a] mt-1 leading-none">{money(outflow)}</p>
          <p className="text-[11px] text-[#9b9b9b] mt-1.5">{moneyShort(totals.monthlyBills)} bills · {moneyShort(totals.monthlyDebtMin)} debt min</p>
          <div className="mt-auto pt-3">
            <div className="flex h-1.5 rounded-full overflow-hidden bg-[#ececec]">
              <div className="h-full bg-[#1a1a1a]" style={{ width: `${inShare}%` }} />
              <div className="h-full bg-[#b0b0b0]" style={{ width: `${leftShare}%` }} />
            </div>
            <div className="flex justify-between mt-1.5 text-[10px] text-[#9b9b9b]">
              <span>{Math.round(inShare)}% spoken for</span>
              <span>{Math.round(leftShare)}% leftover</span>
            </div>
          </div>
        </Panel>

        <Panel>
          <RowHead title="Spend" />
          <SpendDonut slices={spend.slices} total={spend.total} />
        </Panel>

        <Panel>
          <RowHead title="Leftover" extra={`${moneyShort(totals.dailyDiscretionary)} / day`} />
          <WeekBars value={Math.max(0, totals.dailyDiscretionary)} today={todayIdx} />
        </Panel>

        <Panel>
          <RowHead
            title="Debt"
            extra={moneyShort(totals.debtTotal)}
            add={() => patch(d => ({
              ...d,
              debts: [...d.debts, { id: newFinanceId(), name: '', balance: 0, minPayment: 0, apr: 0, cadence: 'monthly' }],
            }))}
          />
          <div className="mt-1 min-h-0 flex-1 overflow-y-auto">
            {data.debts.length === 0 ? (
              <p className="text-[11px] text-[#b0b0b0] pt-2">Add a balance</p>
            ) : data.debts.map(row => (
              <div key={row.id} className="py-1.5 border-b border-[#f0f0f0]">
                <div className="flex items-center gap-2">
                  <LineInput value={row.name} placeholder="Loan / card" className="flex-1 min-w-0" onChange={name => patch(d => ({ ...d, debts: d.debts.map(x => x.id === row.id ? { ...x, name } : x) }))} />
                  <MoneyField value={row.balance} className="w-[4.75rem] text-right" onChange={balance => patch(d => ({ ...d, debts: d.debts.map(x => x.id === row.id ? { ...x, balance } : x) }))} />
                  <Remove onClick={() => patch(d => ({ ...d, debts: d.debts.filter(x => x.id !== row.id) }))} />
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-[10px] text-[#9b9b9b]">
                  <span>min</span>
                  <MoneyField value={row.minPayment} className="w-14" onChange={minPayment => patch(d => ({ ...d, debts: d.debts.map(x => x.id === row.id ? { ...x, minPayment } : x) }))} />
                  <span>apr</span>
                  <MoneyField value={row.apr} className="w-10" onChange={apr => patch(d => ({ ...d, debts: d.debts.map(x => x.id === row.id ? { ...x, apr } : x) }))} />
                  <CadenceSelect value={row.cadence} onChange={cadence => patch(d => ({ ...d, debts: d.debts.map(x => x.id === row.id ? { ...x, cadence } : x) }))} />
                </div>
              </div>
            ))}
            {data.important.map(row => (
              <div key={row.id} className="flex items-center gap-2 py-1.5 border-b border-[#f0f0f0]">
                <LineInput value={row.name} placeholder="Goal" className="flex-1" onChange={name => patch(d => ({ ...d, important: d.important.map(x => x.id === row.id ? { ...x, name } : x) }))} />
                <MoneyField value={row.amount} className="w-16 text-right" onChange={amount => patch(d => ({ ...d, important: d.important.map(x => x.id === row.id ? { ...x, amount } : x) }))} />
                <Remove onClick={() => patch(d => ({ ...d, important: d.important.filter(x => x.id !== row.id) }))} />
              </div>
            ))}
            <button
              type="button"
              onClick={() => patch(d => ({ ...d, important: [...d.important, { id: newFinanceId(), name: '', amount: 0, cadence: 'monthly' }] }))}
              className="mt-1 text-[11px] text-[#9b9b9b] hover:text-[#1a1a1a]"
            >
              + Goal
            </button>
          </div>
        </Panel>

        <Panel dark={false} className="!bg-[#1a1a1a] !border-[#1a1a1a]">
          <div className="flex items-baseline justify-between">
            <p className="text-[11px] font-medium text-white">Bills</p>
            <button
              type="button"
              onClick={() => patch(d => ({ ...d, bills: [...d.bills, { id: newFinanceId(), name: '', amount: 0, cadence: 'monthly' }] }))}
              className="text-[11px] text-white/50 hover:text-white"
            >
              Add
            </button>
          </div>
          <p className="text-[11px] text-white/45 mt-1">{data.bills.length} monthly · {data.upcoming.length} upcoming</p>
          <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
            {data.bills.length === 0 && data.upcoming.length === 0 ? (
              <p className="text-[11px] text-white/35">Add rent, utilities, Christmas</p>
            ) : (
              <>
                {data.bills.map(row => (
                  <div key={row.id} className="flex items-center gap-2 py-1.5 border-b border-white/10">
                    <LineInput dark value={row.name} placeholder="Rent" className="flex-1" onChange={name => patch(d => ({ ...d, bills: d.bills.map(x => x.id === row.id ? { ...x, name } : x) }))} />
                    <MoneyField dark value={row.amount} className="w-14 text-right" onChange={amount => patch(d => ({ ...d, bills: d.bills.map(x => x.id === row.id ? { ...x, amount } : x) }))} />
                    <CadenceSelect dark value={row.cadence} onChange={cadence => patch(d => ({ ...d, bills: d.bills.map(x => x.id === row.id ? { ...x, cadence } : x) }))} />
                    <Remove dark onClick={() => patch(d => ({ ...d, bills: d.bills.filter(x => x.id !== row.id) }))} />
                  </div>
                ))}
                {upcomingSorted.map(row => (
                  <div key={row.id} className="flex items-center gap-2 py-1.5 border-b border-white/10">
                    <LineInput dark value={row.name} placeholder="Christmas" className="flex-1" onChange={name => patch(d => ({ ...d, upcoming: d.upcoming.map(x => x.id === row.id ? { ...x, name } : x) }))} />
                    <input
                      type="date"
                      value={row.date}
                      onChange={e => patch(d => ({ ...d, upcoming: d.upcoming.map(x => x.id === row.id ? { ...x, date: e.target.value } : x) }))}
                      className="w-[7.2rem] bg-transparent text-[10px] text-white/50 focus:outline-none"
                    />
                    <MoneyField dark value={row.amount} className="w-14 text-right" onChange={amount => patch(d => ({ ...d, upcoming: d.upcoming.map(x => x.id === row.id ? { ...x, amount } : x) }))} />
                    <Remove dark onClick={() => patch(d => ({ ...d, upcoming: d.upcoming.filter(x => x.id !== row.id) }))} />
                  </div>
                ))}
              </>
            )}
            <button
              type="button"
              onClick={() => patch(d => ({ ...d, upcoming: [...d.upcoming, { id: newFinanceId(), name: '', amount: 0, date: '', notes: '' }] }))}
              className="mt-1.5 text-[11px] text-white/50 hover:text-white"
            >
              + Upcoming
            </button>
          </div>
        </Panel>

        <Panel>
          <RowHead title="Net" extra={`in ${moneyShort(totals.monthlyIncome)} · out ${moneyShort(outflow)}`} />
          <p className="text-[13px] font-semibold text-[#1a1a1a] mt-1">{money(totals.netCash)}</p>
          <NetLine points={netPts} />
        </Panel>

        <Panel>
          <RowHead title="Expenses" extra="from business accounts" />
          <div className="mt-1 min-h-0 flex-1 overflow-y-auto">
            <div className="grid grid-cols-[1fr_auto] gap-x-3 text-[10px] text-[#b0b0b0] py-1">
              <span>Name</span><span>Amount</span>
            </div>
            {expenses.length === 0 ? (
              <p className="text-[11px] text-[#b0b0b0] pt-2">Open a business account to log spend</p>
            ) : expenses.map(e => (
              <button
                key={e.id}
                type="button"
                onClick={() => setOpenBizId(e.accountId)}
                className="w-full grid grid-cols-[1fr_auto] gap-x-3 items-center py-1.5 border-b border-[#f0f0f0] text-left"
              >
                <span className="min-w-0">
                  <span className="block text-[11px] text-[#1a1a1a] truncate">{e.name || e.account}</span>
                  <span className="block text-[10px] text-[#9b9b9b]">{e.date || e.account}</span>
                </span>
                <span className="text-[11px] text-[#1a1a1a] tabular-nums">{money(e.amount)}</span>
              </button>
            ))}
          </div>
        </Panel>
      </div>
      {setupRequired && (
        <p className="absolute bottom-2 left-4 text-[10px] text-[#9b9b9b]">
          Run add-personal-finance.sql in Supabase
        </p>
      )}
    </div>
  );
}

function spendingSlices(data: FinanceData) {
  const items = [
    ...data.bills.map(b => ({ name: b.name.trim() || 'Bill', value: monthlyFrom(b.amount, b.cadence) })),
    ...data.debts.filter(d => (d.minPayment || 0) > 0).map(d => ({
      name: `${d.name.trim() || 'Debt'} min`,
      value: monthlyFrom(d.minPayment, d.cadence),
    })),
  ].filter(x => x.value > 0).sort((a, b) => b.value - a.value);
  const total = items.reduce((s, x) => s + x.value, 0);
  const top = items.slice(0, 4);
  const rest = items.slice(4).reduce((s, x) => s + x.value, 0);
  if (rest > 0) top.push({ name: 'Other', value: rest });
  return { total, slices: top.map((x, i) => ({ ...x, color: GRAYS[i % GRAYS.length] })) };
}

function SpendDonut({ slices, total }: { slices: { name: string; value: number; color: string }[]; total: number }) {
  const r = 38;
  const stroke = 14;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const rings = slices.map((s) => {
    const len = total > 0 ? (s.value / total) * c : 0;
    const item = { ...s, dash: `${len} ${c - len}`, offset };
    offset -= len;
    return item;
  });
  return (
    <div className="mt-1 flex-1 min-h-0 flex items-center gap-3">
      <div className="relative w-[108px] h-[108px] shrink-0">
        <svg viewBox="0 0 108 108" className="w-full h-full -rotate-90">
          <circle cx="54" cy="54" r={r} fill="none" stroke="#ececec" strokeWidth={stroke} />
          {rings.map(s => (
            <circle
              key={s.name}
              cx="54" cy="54" r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={stroke}
              strokeDasharray={s.dash}
              strokeDashoffset={s.offset}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-3">
          <p className="text-[9px] text-[#9b9b9b] leading-none">Total</p>
          <p className="text-[12px] font-semibold text-[#1a1a1a] mt-0.5 leading-tight">{moneyShort(total)}</p>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1">
        {slices.length === 0 ? (
          <li className="text-[11px] text-[#b0b0b0]">Bills show here</li>
        ) : slices.map(s => (
          <li key={s.name} className="flex items-center gap-1.5 text-[11px]">
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: s.color }} />
            <span className="truncate text-[#6b6b6b] flex-1">{s.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function WeekBars({ value, today }: { value: number; today: number }) {
  const max = Math.max(1, value);
  return (
    <div className="flex-1 min-h-0 flex items-end gap-2 pt-2 px-1">
      {WEEK.map((d, i) => {
        const on = i === today;
        const h = value > 0 ? 55 + (on ? 28 : 0) : 8;
        return (
          <div key={d} className="flex-1 min-w-0 flex flex-col items-center justify-end h-full">
            {on && value > 0 && (
              <span className="text-[9px] text-[#1a1a1a] mb-1 tabular-nums">{moneyShort(value)}</span>
            )}
            <div
              className={`w-full max-w-[18px] rounded-t-[3px] ${on ? 'bg-[#1a1a1a]' : 'bg-[#d8d8d8]'}`}
              style={{ height: `${Math.min(100, h)}%` }}
            />
            <span className={`text-[9px] mt-1 ${on ? 'text-[#1a1a1a]' : 'text-[#b0b0b0]'}`}>{d}</span>
          </div>
        );
      })}
      <span className="sr-only">{money(max)} leftover each day</span>
    </div>
  );
}

function NetLine({ points }: { points: number[] }) {
  const w = 280;
  const h = 88;
  const min = Math.min(0, ...points);
  const max = Math.max(1, ...points);
  const span = max - min || 1;
  const xy = points.map((v, i) => {
    const x = (i / Math.max(1, points.length - 1)) * w;
    const y = h - ((v - min) / span) * (h - 8) - 4;
    return `${x},${y}`;
  }).join(' ');
  const last = points[points.length - 1] ?? 0;
  const lastX = w;
  const lastY = h - ((last - min) / span) * (h - 8) - 4;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full flex-1 min-h-0 mt-1" preserveAspectRatio="none">
      <polyline fill="none" stroke="#d4d4d4" strokeWidth="1.5" points={`0,${h} ${w},${h}`} />
      <polyline fill="none" stroke="#1a1a1a" strokeWidth="1.8" points={xy} />
      <circle cx={lastX} cy={lastY} r="2.5" fill="#1a1a1a" />
    </svg>
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
    onChange({ ...account, expenses: account.expenses.map(e => e.id === id ? { ...e, ...next } : e) });
  }

  return (
    <div className="flex-1 min-h-0 overflow-hidden bg-[#f4f4f4] p-3 flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={onBack} className="text-[11px] text-[#6b6b6b] hover:text-[#1a1a1a]">Back</button>
        <button type="button" onClick={onRemove} className="text-[11px] text-[#9b9b9b] hover:text-[#1a1a1a]">Remove</button>
      </div>
      <Panel className="flex-1 min-h-0">
        <LineInput value={account.name} placeholder="Operating account" className="w-full text-[13px] font-medium" onChange={name => onChange({ ...account, name })} />
        <div className="grid grid-cols-3 gap-3 mt-3 text-[11px]">
          <div><p className="text-[#9b9b9b]">Balance</p><p className="text-[15px] font-semibold">{money(account.balance)}</p></div>
          <div><p className="text-[#9b9b9b]">Logged</p><p className="text-[15px] font-semibold">{money(spent)}</p></div>
          <div><p className="text-[#9b9b9b]">This month</p><p className="text-[15px] font-semibold">{money(spentMonth)}</p></div>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span className="text-[11px] text-[#9b9b9b]">Balance</span>
          <MoneyField value={account.balance} className="w-28" onChange={balance => onChange({ ...account, balance })} />
          <button
            type="button"
            onClick={() => onChange({
              ...account,
              expenses: [{
                id: newFinanceId(),
                name: '',
                amount: 0,
                date: new Date().toISOString().slice(0, 10),
                notes: '',
              }, ...account.expenses],
            })}
            className="ml-auto text-[11px] text-[#6b6b6b] hover:text-[#1a1a1a]"
          >
            Add
          </button>
        </div>
        <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
          {expenses.length === 0 ? (
            <p className="text-[11px] text-[#b0b0b0]">No expenses</p>
          ) : expenses.map(row => (
            <div key={row.id} className="flex items-center gap-2 py-1 border-b border-[#f0f0f0]">
              <input type="date" value={row.date} onChange={e => patchExp(row.id, { date: e.target.value })} className="text-[11px] text-[#6b6b6b] bg-transparent focus:outline-none" />
              <LineInput value={row.name} placeholder="Payroll" className="flex-1" onChange={name => patchExp(row.id, { name })} />
              <MoneyField value={row.amount} className="w-20 text-right" onChange={amount => patchExp(row.id, { amount })} />
              <LineInput value={row.notes} placeholder="note" className="w-28" onChange={notes => patchExp(row.id, { notes })} />
              <Remove onClick={() => onChange({ ...account, expenses: account.expenses.filter(e => e.id !== row.id) })} />
            </div>
          ))}
        </div>
        <p className="text-[10px] text-[#c4c4c4] mt-2">{saving ? 'Saving…' : ''}</p>
      </Panel>
    </div>
  );
}

function Panel({ children, className = '' }: { children: React.ReactNode; className?: string; dark?: boolean }) {
  return (
    <div className={`min-h-0 h-full rounded-2xl border border-[#e8e8e8] bg-white px-4 py-3 flex flex-col overflow-hidden ${className}`}>
      {children}
    </div>
  );
}

function RowHead({
  title,
  extra,
  right,
  add,
}: {
  title: string;
  extra?: string;
  right?: string;
  add?: () => void;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 shrink-0">
      <div className="flex items-baseline gap-2 min-w-0">
        <p className="text-[11px] font-medium text-[#1a1a1a]">{title}</p>
        {extra ? <p className="text-[10px] text-[#9b9b9b] truncate">{extra}</p> : null}
      </div>
      {add ? (
        <button type="button" onClick={add} className="text-[11px] text-[#9b9b9b] hover:text-[#1a1a1a]">Add</button>
      ) : right ? (
        <p className="text-[10px] text-[#9b9b9b]">{right}</p>
      ) : null}
    </div>
  );
}

function LineInput({
  value, onChange, placeholder, className = '', dark,
}: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string; dark?: boolean;
}) {
  return (
    <input
      value={value}
      placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      className={`text-[11px] bg-transparent border-0 py-0.5 focus:outline-none ${dark ? 'text-white placeholder:text-white/30' : 'text-[#1a1a1a] placeholder:text-[#d0d0d0]'} ${className}`}
    />
  );
}

function MoneyField({
  value, onChange, className = 'w-20', dark,
}: {
  value: number; onChange: (n: number) => void; className?: string; dark?: boolean;
}) {
  return (
    <input
      inputMode="decimal"
      value={value ? String(value) : ''}
      placeholder="0"
      onChange={e => onChange(parseMoney(e.target.value))}
      className={`${className} text-[11px] bg-transparent border-0 py-0.5 focus:outline-none ${dark ? 'text-white placeholder:text-white/30' : 'text-[#1a1a1a] placeholder:text-[#d0d0d0]'}`}
    />
  );
}

function CadenceSelect({
  value, onChange, dark,
}: {
  value: FinanceCadence; onChange: (v: FinanceCadence) => void; dark?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value as FinanceCadence)}
      className={`text-[10px] bg-transparent border-0 py-0.5 pr-0 focus:outline-none ${dark ? 'text-white/60' : 'text-[#9b9b9b]'}`}
    >
      {FINANCE_CADENCES.map(c => (
        <option key={c.id} value={c.id}>{c.label}</option>
      ))}
    </select>
  );
}

function Remove({ onClick, dark }: { onClick: () => void; dark?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={`text-sm leading-none ${dark ? 'text-white/30 hover:text-white' : 'text-[#d0d0d0] hover:text-[#1a1a1a]'}`}>×</button>
  );
}
