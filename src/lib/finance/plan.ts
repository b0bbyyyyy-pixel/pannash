export const FINANCE_CADENCES = [
  { id: 'weekly', label: 'weekly', perMonth: 52 / 12 },
  { id: 'biweekly', label: 'every 2 weeks', perMonth: 26 / 12 },
  { id: 'monthly', label: 'monthly', perMonth: 1 },
  { id: 'yearly', label: 'yearly', perMonth: 1 / 12 },
] as const;

export type FinanceCadence = (typeof FINANCE_CADENCES)[number]['id'];

export type MoneyLine = {
  id: string;
  name: string;
  amount: number;
  cadence: FinanceCadence;
};

export type DebtLine = {
  id: string;
  name: string;
  balance: number;
  minPayment: number;
  apr: number;
  cadence: FinanceCadence;
};

export type CheckingAccount = {
  id: string;
  name: string;
  balance: number;
};

export type BusinessExpense = {
  id: string;
  name: string;
  amount: number;
  date: string;
  notes: string;
};

export type BusinessAccount = {
  id: string;
  name: string;
  balance: number;
  expenses: BusinessExpense[];
};

export type UpcomingCost = {
  id: string;
  name: string;
  amount: number;
  date: string;
  notes: string;
  done: boolean;
};

export type UpcomingGroup = {
  id: string;
  name: string;
  items: UpcomingCost[];
};

export type BudgetLine = {
  id: string;
  name: string;
  estimate: number;
  actual: number;
};

export type BudgetGroup = {
  id: string;
  name: string;
  items: BudgetLine[];
};

export const BUDGET_SECTIONS = [
  { id: 'networth', label: 'Net worth', left: 'Estimate', right: 'Actual', rows: 6, skipExpense: true },
  { id: 'income', label: 'Income', left: 'Planned', right: 'Received', rows: 6, income: true },
  { id: 'assets', label: 'Assets', left: 'Estimate', right: 'Actual', rows: 8, skipExpense: true },
  { id: 'cortland', label: 'The Cortland', left: 'Estimate', right: 'Actual', rows: 8, skipExpense: true },
  { id: 'expenses', label: 'Expenses', left: 'Estimate', right: 'Actual', rows: 12 },
  { id: 'debt', label: 'Debt', left: 'Estimate', right: 'Actual', rows: 8 },
] as const;

const LEGACY_EXPENSE_IDS = ['housing', 'transportation', 'food', 'health', 'personal', 'savings', 'giving', 'misc'];

export type BudgetSectionId = (typeof BUDGET_SECTIONS)[number]['id'];

export type MonthSheet = {
  notes: string;
  sections: Record<BudgetSectionId, BudgetLine[]>;
  expenseGroups: BudgetGroup[];
};

export type FinanceData = {
  incomes: MoneyLine[];
  bills: MoneyLine[];
  debts: DebtLine[];
  important: MoneyLine[];
  checking: CheckingAccount[];
  businesses: BusinessAccount[];
  upcoming: UpcomingGroup[];
  notes: string;
  sheets: Record<string, MonthSheet>;
};

export type FinanceAllocation = {
  name: string;
  perDay: number;
  perMonth: number;
  why: string;
};

export type FinancePlan = {
  monthlyIncome: number;
  monthlyBills: number;
  monthlyDebtMin: number;
  leftoverMonthly: number;
  dailyDiscretionary: number;
  allocations: FinanceAllocation[];
  advice: string;
};

export const DAYS_PER_MONTH = 30.44;

export function newFinanceId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function blankLine(): BudgetLine {
  return { id: newFinanceId(), name: '', estimate: 0, actual: 0 };
}

export function blankUpcoming(): UpcomingCost {
  return { id: newFinanceId(), name: '', amount: 0, date: '', notes: '', done: false };
}

export function padUpcoming(lines: UpcomingCost[], min = 0): UpcomingCost[] {
  const next = lines.length ? [...lines] : [];
  while (next.length < min) next.push(blankUpcoming());
  return next;
}

export function blankUpcomingGroup(name = ''): UpcomingGroup {
  return { id: newFinanceId(), name, items: [blankUpcoming()] };
}

export function padUpcomingGroups(groups: UpcomingGroup[]): UpcomingGroup[] {
  return groups.length ? groups : [blankUpcomingGroup()];
}

export function flattenUpcoming(groups: UpcomingGroup[]): UpcomingCost[] {
  return groups.flatMap(g => g.items);
}

export function blankBudgetGroup(name = ''): BudgetGroup {
  return { id: newFinanceId(), name, items: [blankLine()] };
}

export function flattenBudgetGroups(groups: BudgetGroup[]): BudgetLine[] {
  return groups.flatMap(g => g.items);
}

export function withExpenseGroups(sheet: MonthSheet, groups: BudgetGroup[]): MonthSheet {
  const expenseGroups = groups.length ? groups : [blankBudgetGroup()];
  return {
    ...sheet,
    expenseGroups,
    sections: { ...sheet.sections, expenses: flattenBudgetGroups(expenseGroups) },
  };
}

export function blankSheet(): MonthSheet {
  const sections = {} as MonthSheet['sections'];
  for (const s of BUDGET_SECTIONS) {
    sections[s.id] = Array.from({ length: s.id === 'expenses' ? 0 : s.rows }, blankLine);
  }
  const expenseGroups = [blankBudgetGroup()];
  sections.expenses = flattenBudgetGroups(expenseGroups);
  return { notes: '', sections, expenseGroups };
}

export function monthKey(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

export function padSection(lines: BudgetLine[], min: number): BudgetLine[] {
  const next = lines.length ? [...lines] : [];
  while (next.length < min) next.push(blankLine());
  const last = next[next.length - 1];
  if (last && (last.name.trim() || last.estimate || last.actual)) next.push(blankLine());
  while (next.length > min) {
    const a = next[next.length - 1];
    const b = next[next.length - 2];
    if (a && b && !a.name.trim() && !a.estimate && !a.actual && !b.name.trim() && !b.estimate && !b.actual) {
      next.pop();
      continue;
    }
    break;
  }
  return next;
}

export function sheetTotals(sheet: MonthSheet) {
  const sum = (id: BudgetSectionId, field: 'estimate' | 'actual') =>
    (sheet.sections[id] ?? []).reduce((s, r) => s + (r[field] || 0), 0);
  const incomeEst = sum('income', 'estimate');
  const incomeAct = sum('income', 'actual');
  let expEst = 0;
  let expAct = 0;
  for (const s of BUDGET_SECTIONS) {
    if (s.id === 'income' || 'skipExpense' in s) continue;
    expEst += sum(s.id, 'estimate');
    expAct += sum(s.id, 'actual');
  }
  return {
    incomeEst,
    incomeAct,
    expEst,
    expAct,
    balEst: incomeEst - expEst,
    balAct: incomeAct - expAct,
  };
}

export function blankFinance(): FinanceData {
  return {
    incomes: [],
    bills: [],
    debts: [],
    important: [],
    checking: [],
    businesses: [],
    upcoming: padUpcomingGroups([]),
    notes: '',
    sheets: {},
  };
}

export function parseMoney(raw: string) {
  const n = Number(String(raw).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export function money(n: number) {
  const v = Number.isFinite(n) ? n : 0;
  const abs = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v < 0 ? `-$${abs}` : `$${abs}`;
}

export function moneyShort(n: number) {
  const v = Number.isFinite(n) ? n : 0;
  const abs = Math.abs(Math.round(v)).toLocaleString('en-US');
  return v < 0 ? `-$${abs}` : `$${abs}`;
}

export function monthlyFrom(amount: number, cadence: string) {
  const found = FINANCE_CADENCES.find(c => c.id === cadence);
  return (Number(amount) || 0) * (found?.perMonth ?? 1);
}

export function daysUntil(iso: string) {
  if (!iso) return 0;
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return 0;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

export function monthsUntil(iso: string) {
  return Math.max(1, daysUntil(iso) / 30.44);
}

export function summarizeFinance(data: FinanceData) {
  const monthlyIncome = data.incomes.reduce((s, r) => s + monthlyFrom(r.amount, r.cadence), 0);
  const monthlyBills = data.bills.reduce((s, r) => s + monthlyFrom(r.amount, r.cadence), 0);
  const monthlyDebtMin = data.debts.reduce((s, r) => s + monthlyFrom(r.minPayment, r.cadence), 0);
  const leftoverMonthly = monthlyIncome - monthlyBills - monthlyDebtMin;
  const dailyDiscretionary = leftoverMonthly / DAYS_PER_MONTH;
  const cashChecking = data.checking.reduce((s, r) => s + (r.balance || 0), 0);
  const cashBusiness = data.businesses.reduce((s, r) => s + (r.balance || 0), 0);
  const cashTotal = cashChecking + cashBusiness;
  const debtTotal = data.debts.reduce((s, r) => s + (r.balance || 0), 0);
  const upcomingItems = flattenUpcoming(data.upcoming);
  const upcomingSoon = upcomingItems
    .filter(u => !u.done && daysUntil(u.date) >= 0 && daysUntil(u.date) <= 90)
    .reduce((s, r) => s + (r.amount || 0), 0);
  const upcomingYear = upcomingItems
    .filter(u => !u.done && daysUntil(u.date) >= 0 && daysUntil(u.date) <= 365)
    .reduce((s, r) => s + (r.amount || 0), 0);
  return {
    monthlyIncome,
    monthlyBills,
    monthlyDebtMin,
    leftoverMonthly,
    dailyDiscretionary,
    cashChecking,
    cashBusiness,
    cashTotal,
    debtTotal,
    netCash: cashTotal - debtTotal,
    upcomingSoon,
    upcomingYear,
  };
}

export function fallbackPlan(data: FinanceData): FinancePlan {
  const s = summarizeFinance(data);
  const daily = Math.max(0, s.dailyDiscretionary);
  const allocations: FinanceAllocation[] = [];
  let left = daily;

  const topDebt = [...data.debts]
    .filter(d => (d.balance || 0) > 0)
    .sort((a, b) => (b.apr || 0) - (a.apr || 0))[0];
  if (topDebt && left > 0) {
    const extra = round2(left * (topDebt.apr >= 10 ? 0.4 : 0.25));
    allocations.push({
      name: `Extra to ${topDebt.name || 'highest-interest debt'}`,
      perDay: extra,
      perMonth: round2(extra * DAYS_PER_MONTH),
      why: topDebt.apr ? `${topDebt.apr}% APR — keep this in front of you` : 'Largest balance to chip at',
    });
    left -= extra;
  }

  const nextUp = [...flattenUpcoming(data.upcoming)]
    .filter(u => !u.done && daysUntil(u.date) >= 0)
    .sort((a, b) => daysUntil(a.date) - daysUntil(b.date))[0];
  if (nextUp && left > 0) {
    const need = round2(Math.min(left * 0.25, nextUp.amount / monthsUntil(nextUp.date) / DAYS_PER_MONTH));
    if (need > 0) {
      allocations.push({
        name: `Set aside for ${nextUp.name || 'upcoming'}`,
        perDay: need,
        perMonth: round2(need * DAYS_PER_MONTH),
        why: `${moneyShort(nextUp.amount)} in ${Math.max(0, daysUntil(nextUp.date))} days`,
      });
      left -= need;
    }
  }

  const goal = data.important.find(g => (g.amount || 0) > 0);
  if (goal && left > 0) {
    const g = round2(left * 0.3);
    allocations.push({
      name: goal.name || 'Important goal',
      perDay: g,
      perMonth: round2(g * DAYS_PER_MONTH),
      why: 'You marked this as important',
    });
    left -= g;
  }

  const spend = round2(Math.max(0, left));
  allocations.push({
    name: 'Daily spend',
    perDay: spend,
    perMonth: round2(spend * DAYS_PER_MONTH),
    why: 'Food, gas, and everything that is not a bill',
  });

  const advice = s.leftoverMonthly < 0
    ? 'Bills and minimums are bigger than income. Cut or pause non-essentials first, then rerun this plan.'
    : s.debtTotal > 0
      ? `You have ${moneyShort(s.debtTotal)} in debt staring at you. Pay minimums, then send extras to the highest APR. Park holiday money before you spend it.`
      : 'Pay every bill first. Use the daily amounts below — anything extra goes to cash or the next event.';

  return { ...s, allocations, advice };
}

export function normalizeFinance(raw: unknown): FinanceData {
  const obj = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  return {
    incomes: asMoneyLines(obj.incomes),
    bills: asMoneyLines(obj.bills),
    debts: asDebtLines(obj.debts),
    important: asMoneyLines(obj.important),
    checking: asAccounts(obj.checking),
    businesses: asBusinesses(obj.businesses),
    upcoming: asUpcoming(obj.upcoming),
    notes: typeof obj.notes === 'string' ? obj.notes : '',
    sheets: asSheets(obj.sheets),
  };
}

function asSheets(raw: unknown): Record<string, MonthSheet> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, MonthSheet> = {};
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}$/.test(key) || !val || typeof val !== 'object') continue;
    const v = val as Record<string, unknown>;
    const sections = {} as MonthSheet['sections'];
    const rawSections = (v.sections && typeof v.sections === 'object' ? v.sections : v) as Record<string, unknown>;
    for (const s of BUDGET_SECTIONS) {
      if (s.id === 'expenses') continue;
      const rows = Array.isArray(rawSections[s.id]) ? rawSections[s.id] : [];
      sections[s.id] = asBudgetLines(rows, s.rows);
    }
    let expenseRaw: unknown = Array.isArray(rawSections.expenses) ? rawSections.expenses : [];
    const filledExpense = asBudgetLines(expenseRaw, 0).filter(r => r.name.trim() || r.estimate || r.actual);
    if (!filledExpense.length) {
      const merged: unknown[] = [];
      for (const id of LEGACY_EXPENSE_IDS) {
        if (Array.isArray(rawSections[id])) merged.push(...(rawSections[id] as unknown[]));
      }
      expenseRaw = merged;
    }
    const expenseGroups = asExpenseGroups(v.expenseGroups, asBudgetLines(expenseRaw, 0));
    sections.expenses = flattenBudgetGroups(expenseGroups);
    out[key] = {
      notes: typeof v.notes === 'string' ? v.notes : '',
      sections,
      expenseGroups,
    };
  }
  return out;
}

function asExpenseGroups(raw: unknown, fallback: BudgetLine[]): BudgetGroup[] {
  if (Array.isArray(raw) && raw.some(row => row && typeof row === 'object' && Array.isArray((row as Record<string, unknown>).items))) {
    const groups = raw.map((row) => {
      const r = row && typeof row === 'object' ? row as Record<string, unknown> : {};
      const items = asBudgetLines(r.items, 0).filter(line => line.name.trim() || line.estimate || line.actual);
      return {
        id: String(r.id || newFinanceId()),
        name: String(r.name ?? ''),
        items: items.length ? items : [blankLine()],
      };
    });
    return groups.length ? groups : [blankBudgetGroup()];
  }
  const filled = fallback.filter(r => r.name.trim() || r.estimate || r.actual);
  return [{
    id: newFinanceId(),
    name: '',
    items: filled.length ? filled : [blankLine()],
  }];
}

function asBudgetLines(raw: unknown, min: number): BudgetLine[] {
  const rows = Array.isArray(raw) ? raw.map((row) => {
    const r = row && typeof row === 'object' ? row as Record<string, unknown> : {};
    return {
      id: String(r.id || newFinanceId()),
      name: String(r.name ?? ''),
      estimate: Number(r.estimate ?? r.left ?? r.planned) || 0,
      actual: Number(r.actual ?? r.right ?? r.received) || 0,
    };
  }) : [];
  return padSection(rows, min);
}

function asMoneyLines(raw: unknown): MoneyLine[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const r = row && typeof row === 'object' ? row as Record<string, unknown> : {};
    return {
      id: String(r.id || newFinanceId()),
      name: String(r.name ?? ''),
      amount: Number(r.amount) || 0,
      cadence: cadenceOf(r.cadence),
    };
  });
}

function asDebtLines(raw: unknown): DebtLine[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const r = row && typeof row === 'object' ? row as Record<string, unknown> : {};
    return {
      id: String(r.id || newFinanceId()),
      name: String(r.name ?? ''),
      balance: Number(r.balance) || 0,
      minPayment: Number(r.minPayment) || 0,
      apr: Number(r.apr) || 0,
      cadence: cadenceOf(r.cadence),
    };
  });
}

function asAccounts(raw: unknown): CheckingAccount[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const r = row && typeof row === 'object' ? row as Record<string, unknown> : {};
    return {
      id: String(r.id || newFinanceId()),
      name: String(r.name ?? ''),
      balance: Number(r.balance) || 0,
    };
  });
}

function asBusinesses(raw: unknown): BusinessAccount[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const r = row && typeof row === 'object' ? row as Record<string, unknown> : {};
    const expenses = Array.isArray(r.expenses) ? r.expenses.map((ex) => {
      const e = ex && typeof ex === 'object' ? ex as Record<string, unknown> : {};
      return {
        id: String(e.id || newFinanceId()),
        name: String(e.name ?? ''),
        amount: Number(e.amount) || 0,
        date: String(e.date ?? '').slice(0, 10),
        notes: String(e.notes ?? ''),
      };
    }) : [];
    return {
      id: String(r.id || newFinanceId()),
      name: String(r.name ?? ''),
      balance: Number(r.balance) || 0,
      expenses,
    };
  });
}

function asUpcomingItems(raw: unknown): UpcomingCost[] {
  const rows = Array.isArray(raw) ? raw.map((row) => {
    const r = row && typeof row === 'object' ? row as Record<string, unknown> : {};
    return {
      id: String(r.id || newFinanceId()),
      name: String(r.name ?? ''),
      amount: Number(r.amount) || 0,
      date: String(r.date ?? '').slice(0, 10),
      notes: String(r.notes ?? ''),
      done: Boolean(r.done),
    };
  }) : [];
  return rows;
}

function asUpcoming(raw: unknown): UpcomingGroup[] {
  if (!Array.isArray(raw) || raw.length === 0) return padUpcomingGroups([]);
  const looksLikeGroups = raw.some(row => row && typeof row === 'object' && Array.isArray((row as Record<string, unknown>).items));
  if (looksLikeGroups) {
    return padUpcomingGroups(raw.map((row) => {
      const r = row && typeof row === 'object' ? row as Record<string, unknown> : {};
      return {
        id: String(r.id || newFinanceId()),
        name: String(r.name ?? ''),
        items: asUpcomingItems(r.items),
      };
    }));
  }
  return padUpcomingGroups([{
    id: newFinanceId(),
    name: '',
    items: asUpcomingItems(raw),
  }]);
}

function cadenceOf(v: unknown): FinanceCadence {
  const s = String(v || 'monthly');
  return FINANCE_CADENCES.some(c => c.id === s) ? s as FinanceCadence : 'monthly';
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
