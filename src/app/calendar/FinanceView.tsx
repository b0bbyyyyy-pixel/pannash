'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BUDGET_SECTIONS,
  blankBudgetGroup,
  blankFinance,
  blankLine,
  blankSheet,
  blankUpcoming,
  blankUpcomingGroup,
  groupTotal,
  monthKey,
  normalizeFinance,
  padSection,
  padUpcomingGroups,
  parseMoney,
  withExpenseGroups,
  type BudgetGroup,
  type BudgetLine,
  type BudgetSectionId,
  type FinanceData,
  type MonthSheet,
  type UpcomingCost,
  type UpcomingGroup,
} from '@/lib/finance/plan';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_SHORT = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

const COL1: BudgetSectionId[] = ['networth', 'income', 'assets', 'cortland', 'debt'];

function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function MoneyCell({ value, onChange, className = '' }: { value: number; onChange: (n: number) => void; className?: string }) {
  return (
    <input
      inputMode="decimal"
      value={value ? String(value) : ''}
      onChange={e => onChange(parseMoney(e.target.value))}
      placeholder="0"
      className={`w-full px-1 py-1 text-[12px] text-right tabular-nums text-[#1a1a1a] bg-transparent placeholder:text-[#d8d8d8] focus:outline-none ${className}`}
    />
  );
}

function EyeButton({ hidden, onClick }: { hidden: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="p-0.5 text-[#c8c8c8] hover:text-[#9b9b9b]"
      aria-label={hidden ? 'Show totals' : 'Hide totals'}
      aria-pressed={hidden}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="3" />
        {hidden && <path d="M4 4l16 16" />}
      </svg>
    </button>
  );
}

function BudgetTable({
  id,
  lines,
  onChange,
  hideTotal,
}: {
  id: BudgetSectionId;
  lines: BudgetLine[];
  onChange: (lines: BudgetLine[]) => void;
  hideTotal?: boolean;
}) {
  const spec = BUDGET_SECTIONS.find(s => s.id === id)!;
  const [open, setOpen] = useState(false);
  const total = lines.reduce((s, r) => s + (r.actual || r.estimate || 0), 0);

  function patch(i: number, next: Partial<BudgetLine>) {
    onChange(lines.map((row, n) => n === i ? { ...row, ...next } : row));
  }

  function setAmount(i: number, amount: number) {
    patch(i, { estimate: amount, actual: amount });
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center justify-between gap-3 bg-[#ececec] px-2.5 py-1.5 text-left"
      >
        <span className="text-[10px] font-semibold tracking-[0.14em] uppercase text-[#1a1a1a]">{spec.label}</span>
        <span className="text-[12px] tabular-nums text-[#1a1a1a]">{hideTotal || !total ? '' : fmt(total)}</span>
      </button>
      {open && lines.map((row, i) => (
        <div key={row.id} className="grid grid-cols-[1fr_88px] border-b border-dotted border-[#d0d0d0]">
          <input
            value={row.name}
            onChange={e => patch(i, { name: e.target.value })}
            placeholder="Item"
            className="px-2 py-1.5 text-[12px] text-[#1a1a1a] bg-transparent placeholder:text-[#d8d8d8] focus:outline-none"
          />
          <MoneyCell value={row.actual || row.estimate} onChange={amount => setAmount(i, amount)} />
        </div>
      ))}
    </div>
  );
}

function ExpenseList({
  groups,
  onChange,
  hideTotal,
}: {
  groups: BudgetGroup[];
  onChange: (groups: BudgetGroup[]) => void;
  hideTotal?: boolean;
}) {
  const total = groups.reduce((sum, g) => sum + groupTotal(g), 0);

  function patchGroup(i: number, next: Partial<BudgetGroup>) {
    onChange(groups.map((g, n) => n === i ? { ...g, subs: g.subs ?? [], ...next } : g));
  }

  function patchItem(gi: number, ii: number, next: Partial<BudgetLine>) {
    const group = groups[gi];
    patchGroup(gi, { items: group.items.map((row, n) => n === ii ? { ...row, ...next } : row) });
  }

  function patchSub(gi: number, si: number, next: Partial<BudgetGroup>) {
    const group = groups[gi];
    const subs = (group.subs ?? []).map((sub, n) => n === si ? { ...sub, ...next } : sub);
    patchGroup(gi, { subs });
  }

  function patchSubItem(gi: number, si: number, ii: number, next: Partial<BudgetLine>) {
    const sub = groups[gi].subs[si];
    patchSub(gi, si, { items: sub.items.map((row, n) => n === ii ? { ...row, ...next } : row) });
  }

  return (
    <div>
      <div className="flex w-full items-center justify-between gap-3 bg-[#ececec] px-2.5 py-1.5">
        <span className="text-[10px] font-semibold tracking-[0.14em] uppercase text-[#1a1a1a]">Expenses</span>
        <span className="text-[12px] tabular-nums text-[#1a1a1a]">{hideTotal || !total ? '' : fmt(total)}</span>
      </div>
      {groups.map((group, gi) => {
        const catTotal = groupTotal(group);
        return (
          <div key={group.id} className={gi === 0 ? '' : 'mt-4'}>
            <div className="grid grid-cols-[1fr_72px_18px] items-center">
              <input
                value={group.name}
                onChange={e => patchGroup(gi, { name: e.target.value })}
                placeholder="Category"
                className="w-full px-2 py-1.5 text-[10px] font-semibold tracking-[0.14em] uppercase text-[#1a1a1a] bg-transparent placeholder:text-[#c8c8c8] focus:outline-none"
              />
              <span className="px-1 text-[12px] text-right tabular-nums text-[#1a1a1a]">
                {hideTotal || !catTotal ? '' : fmt(catTotal)}
              </span>
              <button
                type="button"
                onClick={() => onChange(groups.filter((_, n) => n !== gi))}
                className="text-[14px] leading-none text-[#c8c8c8] hover:text-[#1a1a1a]"
                aria-label={group.name ? `Delete ${group.name}` : 'Delete category'}
              >
                ×
              </button>
            </div>
            {group.items.map((row, ii) => (
              <div key={row.id} className="grid grid-cols-[1fr_72px_18px] items-center border-b border-dotted border-[#d0d0d0]">
                <input
                  value={row.name}
                  onChange={e => patchItem(gi, ii, { name: e.target.value })}
                  placeholder="Item"
                  className="px-2 py-1.5 text-[12px] text-[#1a1a1a] bg-transparent placeholder:text-[#d8d8d8] focus:outline-none"
                />
                <MoneyCell
                  value={row.actual || row.estimate}
                  onChange={amount => patchItem(gi, ii, { estimate: amount, actual: amount })}
                />
                <button
                  type="button"
                  onClick={() => patchGroup(gi, { items: group.items.filter((_, n) => n !== ii) })}
                  className="text-[14px] leading-none text-[#c8c8c8] hover:text-[#1a1a1a]"
                  aria-label={row.name ? `Delete ${row.name}` : 'Delete item'}
                >
                  ×
                </button>
              </div>
            ))}
            {(group.subs ?? []).map((sub, si) => {
              const subTotal = groupTotal(sub);
              return (
                <div key={sub.id} className="mt-2 pl-3">
                  <div className="grid grid-cols-[1fr_72px_18px] items-center">
                    <input
                      value={sub.name}
                      onChange={e => patchSub(gi, si, { name: e.target.value })}
                      placeholder="Subcategory"
                      className="w-full px-2 py-1 text-[10px] font-semibold tracking-[0.12em] uppercase text-[#6b6b6b] bg-transparent placeholder:text-[#c8c8c8] focus:outline-none"
                    />
                    <span className="px-1 text-[12px] text-right tabular-nums text-[#1a1a1a]">
                      {hideTotal || !subTotal ? '' : fmt(subTotal)}
                    </span>
                    <button
                      type="button"
                      onClick={() => patchGroup(gi, { subs: (group.subs ?? []).filter((_, n) => n !== si) })}
                      className="text-[14px] leading-none text-[#c8c8c8] hover:text-[#1a1a1a]"
                      aria-label={sub.name ? `Delete ${sub.name}` : 'Delete subcategory'}
                    >
                      ×
                    </button>
                  </div>
                  {sub.items.map((row, ii) => (
                    <div key={row.id} className="grid grid-cols-[1fr_72px_18px] items-center border-b border-dotted border-[#d0d0d0]">
                      <input
                        value={row.name}
                        onChange={e => patchSubItem(gi, si, ii, { name: e.target.value })}
                        placeholder="Item"
                        className="px-2 py-1.5 text-[12px] text-[#1a1a1a] bg-transparent placeholder:text-[#d8d8d8] focus:outline-none"
                      />
                      <MoneyCell
                        value={row.actual || row.estimate}
                        onChange={amount => patchSubItem(gi, si, ii, { estimate: amount, actual: amount })}
                      />
                      <button
                        type="button"
                        onClick={() => patchSub(gi, si, { items: sub.items.filter((_, n) => n !== ii) })}
                        className="text-[14px] leading-none text-[#c8c8c8] hover:text-[#1a1a1a]"
                        aria-label={row.name ? `Delete ${row.name}` : 'Delete item'}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => patchSub(gi, si, { items: [...sub.items, blankLine()] })}
                    className="mt-0.5 px-2 py-1 text-[11px] text-[#9b9b9b] hover:text-[#1a1a1a]"
                  >
                    + Add item
                  </button>
                </div>
              );
            })}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => patchGroup(gi, { items: [...group.items, blankLine()] })}
                className="mt-0.5 px-2 py-1 text-[11px] text-[#9b9b9b] hover:text-[#1a1a1a]"
              >
                + Add item
              </button>
              <button
                type="button"
                onClick={() => patchGroup(gi, { subs: [...(group.subs ?? []), blankBudgetGroup()] })}
                className="mt-0.5 px-2 py-1 text-[11px] text-[#9b9b9b] hover:text-[#1a1a1a]"
              >
                + Add subcategory
              </button>
            </div>
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => onChange([...groups, blankBudgetGroup()])}
        className="mt-2 px-2 py-1 text-[11px] text-[#9b9b9b] hover:text-[#1a1a1a]"
      >
        + Add category
      </button>
    </div>
  );
}

function UpcomingList({
  groups,
  onChange,
}: {
  groups: UpcomingGroup[];
  onChange: (groups: UpcomingGroup[]) => void;
}) {
  function patchGroup(i: number, next: Partial<UpcomingGroup>) {
    onChange(groups.map((g, n) => n === i ? { ...g, ...next } : g));
  }

  function patchItem(gi: number, ii: number, next: Partial<UpcomingCost>) {
    const group = groups[gi];
    patchGroup(gi, { items: group.items.map((row, n) => n === ii ? { ...row, ...next } : row) });
  }

  function removeItem(gi: number, ii: number) {
    patchGroup(gi, { items: groups[gi].items.filter((_, n) => n !== ii) });
  }

  function removeGroup(gi: number) {
    onChange(groups.filter((_, n) => n !== gi));
  }

  return (
    <div>
      <div className="flex w-full items-center bg-[#ececec] px-2.5 py-1.5">
        <span className="text-[10px] font-semibold tracking-[0.14em] uppercase text-[#1a1a1a]">Upcoming</span>
      </div>
      {groups.map((group, gi) => (
        <div key={group.id} className={gi === 0 ? '' : 'mt-4'}>
          <div className="grid grid-cols-[1fr_18px] items-center">
            <input
              value={group.name}
              onChange={e => patchGroup(gi, { name: e.target.value })}
              placeholder="Category"
              className="w-full px-2 py-1.5 text-[10px] font-semibold tracking-[0.14em] uppercase text-[#1a1a1a] bg-transparent placeholder:text-[#c8c8c8] focus:outline-none"
            />
            <button
              type="button"
              onClick={() => removeGroup(gi)}
              className="text-[14px] leading-none text-[#c8c8c8] hover:text-[#1a1a1a]"
              aria-label={group.name ? `Delete ${group.name}` : 'Delete category'}
            >
              ×
            </button>
          </div>
          {group.items.map((row, ii) => (
            <div key={row.id} className="grid grid-cols-[18px_1fr_72px_108px_18px] items-center border-b border-dotted border-[#d0d0d0]">
              <input
                type="checkbox"
                checked={row.done}
                onChange={e => patchItem(gi, ii, { done: e.target.checked })}
                className="ml-1 h-3 w-3 accent-[#1a1a1a]"
                aria-label={row.name ? `Bought ${row.name}` : 'Mark bought'}
              />
              <input
                value={row.name}
                onChange={e => patchItem(gi, ii, { name: e.target.value })}
                placeholder="Item"
                className={`px-2 py-1.5 text-[12px] bg-transparent placeholder:text-[#d8d8d8] focus:outline-none ${row.done ? 'text-[#b0b0b0] line-through' : 'text-[#1a1a1a]'}`}
              />
              <MoneyCell
                value={row.amount}
                onChange={amount => patchItem(gi, ii, { amount })}
                className={row.done ? 'text-[#b0b0b0] line-through' : ''}
              />
              <input
                type="date"
                value={row.date}
                onChange={e => patchItem(gi, ii, { date: e.target.value })}
                className={`w-full px-1 py-1.5 text-[11px] text-right bg-transparent focus:outline-none ${row.done ? 'text-[#b0b0b0] line-through' : 'text-[#6b6b6b]'}`}
              />
              <button
                type="button"
                onClick={() => removeItem(gi, ii)}
                className="text-[14px] leading-none text-[#c8c8c8] hover:text-[#1a1a1a]"
                aria-label={row.name ? `Delete ${row.name}` : 'Delete item'}
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => patchGroup(gi, { items: [...group.items, blankUpcoming()] })}
            className="mt-0.5 px-2 py-1 text-[11px] text-[#9b9b9b] hover:text-[#1a1a1a]"
          >
            + Add item
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...groups, blankUpcomingGroup()])}
        className="mt-2 px-2 py-1 text-[11px] text-[#9b9b9b] hover:text-[#1a1a1a]"
      >
        + Add category
      </button>
    </div>
  );
}

export default function FinanceView({
  year,
  month,
  onMonth,
}: {
  year: number;
  month: number;
  onMonth: (month: number) => void;
}) {
  const [data, setData] = useState<FinanceData>(blankFinance());
  const [loading, setLoading] = useState(true);
  const [setupRequired, setSetupRequired] = useState(false);
  const [hideTotals, setHideTotals] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const key = monthKey(year, month);

  const persist = useCallback((next: FinanceData) => {
    fetch('/api/calendar/finance', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: next }),
    })
      .then(async (res) => {
        const d = await res.json().catch(() => ({}));
        if (d.setupRequired) setSetupRequired(true);
      })
      .catch(() => {});
  }, []);

  const queueSave = useCallback((next: FinanceData) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => persist(next), 400);
  }, [persist]);

  const patchSheet = useCallback((fn: (sheet: MonthSheet) => MonthSheet) => {
    setData((prev) => {
      const current = prev.sheets[key] ?? blankSheet();
      const nextSheet = fn(current);
      const next = { ...prev, sheets: { ...prev.sheets, [key]: nextSheet } };
      queueSave(next);
      return next;
    });
  }, [key, queueSave]);

  const patchData = useCallback((fn: (prev: FinanceData) => FinanceData) => {
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
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, []);

  const sheet = data.sheets[key] ?? blankSheet();

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#e5e5e5] border-t-[#1a1a1a] rounded-full animate-spin" />
      </div>
    );
  }

  function setSection(id: BudgetSectionId, lines: BudgetLine[]) {
    const spec = BUDGET_SECTIONS.find(s => s.id === id)!;
    patchSheet(s => ({
      ...s,
      sections: { ...s.sections, [id]: padSection(lines, spec.rows) },
    }));
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-white">
      <div className="px-8 py-4 min-w-[980px]">
        {setupRequired && (
          <p className="text-[10px] text-[#9b9b9b] mb-2">Run add-personal-finance.sql in Supabase</p>
        )}

        <h2 className="text-[22px] font-semibold tracking-tight text-[#1a1a1a] mb-3">
          {MONTHS[month]} {year} <span className="font-normal text-[#6b6b6b]">|</span> Finances
        </h2>

        <div className="grid grid-cols-3 gap-8 items-center mb-5">
          <div className="col-span-2 flex items-center gap-3 text-[11px] tracking-[0.18em] text-[#9b9b9b]">
            {MONTHS_SHORT.map((label, i) => (
              <button
                key={label}
                type="button"
                onClick={() => onMonth(i)}
                className={i === month ? 'text-[#1a1a1a] border-b border-[#1a1a1a] pb-0.5' : 'hover:text-[#1a1a1a]'}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex justify-end">
            <EyeButton hidden={hideTotals} onClick={() => setHideTotals(v => !v)} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-8 items-start">
          <div className="space-y-4">
            {COL1.map(id => (
              <BudgetTable
                key={id}
                id={id}
                lines={sheet.sections[id] ?? []}
                onChange={lines => setSection(id, lines)}
                hideTotal={hideTotals}
              />
            ))}
          </div>
          <ExpenseList
            groups={sheet.expenseGroups ?? []}
            onChange={groups => patchSheet(s => withExpenseGroups(s, groups))}
            hideTotal={hideTotals}
          />
          <UpcomingList
            groups={data.upcoming}
            onChange={groups => patchData(prev => ({ ...prev, upcoming: padUpcomingGroups(groups) }))}
          />
        </div>
      </div>
    </div>
  );
}
