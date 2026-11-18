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

export type FinanceData = {
  incomes: MoneyLine[];
  bills: MoneyLine[];
  debts: DebtLine[];
  important: MoneyLine[];
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
  return { incomes: [], bills: [], debts: [], important: [], notes: '' };
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

export function monthlyFrom(amount: number, cadence: string) {
  const found = FINANCE_CADENCES.find(c => c.id === cadence);
  return (Number(amount) || 0) * (found?.perMonth ?? 1);
}

export function summarizeFinance(data: FinanceData) {
  const monthlyIncome = data.incomes.reduce((s, r) => s + monthlyFrom(r.amount, r.cadence), 0);
  const monthlyBills = data.bills.reduce((s, r) => s + monthlyFrom(r.amount, r.cadence), 0);
  const monthlyDebtMin = data.debts.reduce((s, r) => s + monthlyFrom(r.minPayment, r.cadence), 0);
  const leftoverMonthly = monthlyIncome - monthlyBills - monthlyDebtMin;
  const dailyDiscretionary = leftoverMonthly / DAYS_PER_MONTH;
  return { monthlyIncome, monthlyBills, monthlyDebtMin, leftoverMonthly, dailyDiscretionary };
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
    const extra = round2(left * (topDebt.apr >= 10 ? 0.45 : 0.3));
    allocations.push({
      name: `Extra to ${topDebt.name || 'highest-interest debt'}`,
      perDay: extra,
      perMonth: round2(extra * DAYS_PER_MONTH),
      why: topDebt.apr ? `${topDebt.apr}% APR — knock this down first` : 'Highest-priority balance',
    });
    left -= extra;
  }

  const goal = data.important.find(g => (g.amount || 0) > 0);
  if (goal && left > 0) {
    const g = round2(left * 0.35);
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
    : 'Pay every bill and debt minimum first. Use the daily amounts below — anything extra goes to the top debt.';

  return { ...s, allocations, advice };
}

export function normalizeFinance(raw: unknown): FinanceData {
  const obj = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  return {
    incomes: asMoneyLines(obj.incomes),
    bills: asMoneyLines(obj.bills),
    debts: asDebtLines(obj.debts),
    important: asMoneyLines(obj.important),
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

function cadenceOf(v: unknown): FinanceCadence {
  const s = String(v || 'monthly');
  return FINANCE_CADENCES.some(c => c.id === s) ? s as FinanceCadence : 'monthly';
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
