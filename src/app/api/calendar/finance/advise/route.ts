import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getRequestUser } from '@/lib/auth/getRequestUser';
import { getAIClient, GROK_MINI_MODEL } from '@/lib/ai';
import {
  DAYS_PER_MONTH,
  fallbackPlan,
  normalizeFinance,
  summarizeFinance,
  type FinanceAllocation,
  type FinancePlan,
} from '@/lib/finance/plan';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function parsePlan(raw: string, base: FinancePlan): FinancePlan {
  const text = raw.trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return base;
  try {
    const obj = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    const rows = Array.isArray(obj.allocations) ? obj.allocations : [];
    const allocations: FinanceAllocation[] = rows
      .map((row) => {
        if (!row || typeof row !== 'object') return null;
        const r = row as Record<string, unknown>;
        const perDay = Number(r.perDay ?? r.per_day ?? r.daily);
        if (!Number.isFinite(perDay)) return null;
        const name = String(r.name ?? '').trim();
        if (!name) return null;
        return {
          name,
          perDay: Math.round(perDay * 100) / 100,
          perMonth: Math.round((Number.isFinite(Number(r.perMonth)) ? Number(r.perMonth) : perDay * DAYS_PER_MONTH) * 100) / 100,
          why: String(r.why ?? '').trim(),
        };
      })
      .filter(Boolean) as FinanceAllocation[];
    return {
      ...base,
      allocations: allocations.length ? allocations : base.allocations,
      advice: String(obj.advice ?? base.advice).trim() || base.advice,
    };
  } catch {
    return base;
  }
}

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } },
    );
    const user = await getRequestUser(supabase);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const finance = normalizeFinance(body.data);
    const base = fallbackPlan(finance);
    const totals = summarizeFinance(finance);
    let plan = base;

    try {
      const openai = getAIClient();
      const digest = [
        `Monthly income: $${totals.monthlyIncome.toFixed(2)}`,
        `Monthly bills: $${totals.monthlyBills.toFixed(2)}`,
        `Monthly debt minimums: $${totals.monthlyDebtMin.toFixed(2)}`,
        `Left after must-pays: $${totals.leftoverMonthly.toFixed(2)}`,
        `Daily leftover (÷ 30.44): $${totals.dailyDiscretionary.toFixed(2)}`,
        '',
        'Income:',
        ...finance.incomes.map(r => `- ${r.name || 'Income'}: $${r.amount} ${r.cadence}`),
        '',
        'Bills:',
        ...finance.bills.map(r => `- ${r.name || 'Bill'}: $${r.amount} ${r.cadence}`),
        '',
        'Debts:',
        ...finance.debts.map(r => `- ${r.name || 'Debt'}: balance $${r.balance}, min $${r.minPayment} ${r.cadence}, APR ${r.apr}%`),
        '',
        'Important:',
        ...finance.important.map(r => `- ${r.name || 'Goal'}: $${r.amount} ${r.cadence}`),
        finance.notes ? `\nNotes: ${finance.notes}` : '',
      ].join('\n');

      const completion = await openai.chat.completions.create({
        model: GROK_MINI_MODEL,
        temperature: 0.3,
        max_tokens: 700,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are a practical money coach for one person trying to get his life on track.
Must-pays (bills + debt minimums) are already subtracted. Daily leftover is ${totals.dailyDiscretionary.toFixed(2)}.
Split that leftover into a daily plan: extra debt (highest APR first), important goals, a small buffer if he has none, and true daily spend.
Do not spend more per day than the leftover. If leftover is negative, say what to cut and set daily spend to 0.
Be direct, specific, dollar amounts, no lectures.
Return JSON: {"advice":"2-4 sentences","allocations":[{"name":"...","perDay":0,"perMonth":0,"why":"short"}]}`,
          },
          { role: 'user', content: digest },
        ],
      });
      plan = parsePlan(completion.choices[0]?.message?.content || '', base);
    } catch {
      plan = base;
    }

    const { error } = await supabase
      .from('personal_finance')
      .upsert({
        user_id: user.id,
        data: finance,
        plan,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
    if (error && !/personal_finance/i.test(error.message || '')) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ plan, totals, setupRequired: Boolean(error) });
  } catch (err) {
    console.error('[calendar/finance/advise]', err);
    return NextResponse.json({ error: 'Could not build a plan' }, { status: 500 });
  }
}
