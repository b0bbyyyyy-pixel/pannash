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
};

export type FinanceData = {
  incomes: MoneyLine[];
  bills: MoneyLine[];
  debts: DebtLine[];
  important: MoneyLine[];
  checking: CheckingAccount[];
  businesses: BusinessAccount[];
  upcoming: UpcomingCost[];
  notes: string;
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

export function blankFinance(): FinanceData {
  return {
    incomes: [],
    bills: [],
    debts: [],
    important: [],
    checking: [],
    businesses: [],
    upcoming: [],
    notes: '',
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
  const upcomingSoon = data.upcoming
    .filter(u => daysUntil(u.date) >= 0 && daysUntil(u.date) <= 90)
    .reduce((s, r) => s + (r.amount || 0), 0);
  const upcomingYear = data.upcoming
    .filter(u => daysUntil(u.date) >= 0 && daysUntil(u.date) <= 365)
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

  const nextUp = [...data.upcoming]
    .filter(u => daysUntil(u.date) >= 0)
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
  };
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

function asUpcoming(raw: unknown): UpcomingCost[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const r = row && typeof row === 'object' ? row as Record<string, unknown> : {};
    return {
      id: String(r.id || newFinanceId()),
      name: String(r.name ?? ''),
      amount: Number(r.amount) || 0,
      date: String(r.date ?? '').slice(0, 10),
      notes: String(r.notes ?? ''),
    };
  });
}

function cadenceOf(v: unknown): FinanceCadence {
  const s = String(v || 'monthly');
  return FINANCE_CADENCES.some(c => c.id === s) ? s as FinanceCadence : 'monthly';
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
