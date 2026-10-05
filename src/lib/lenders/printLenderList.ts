import { TIER_LABELS, type LenderTier } from '@/data/lenders';

type PrintLender = {
  name: string;
  tier: number;
  is_active: boolean;
  min_monthly_revenue?: number | null;
  min_tib_months?: number | null;
  min_fico?: number | null;
  min_position?: number | null;
  max_position?: number | null;
  neg_days_max?: number | null;
  min_deposits?: number | null;
  no_credit_pull?: boolean | null;
  hard_pull_sole_props?: boolean | null;
  restricts_sole_props?: boolean | null;
  restricted_states?: string[] | null;
  restricted_industry_keywords?: string[] | null;
  notes?: string | null;
  products?: string | null;
  max_nsfs?: number | null;
  max_withhold?: number | null;
  min_amount?: number | null;
  max_amount?: number | null;
  accepts_mercury?: boolean | null;
  accepts_nonprofit?: boolean | null;
  accepts_defaults?: boolean | null;
  accepts_sole_prop?: boolean | null;
  does_buyout?: boolean | null;
  does_reverse_consolidation?: boolean | null;
  state_restrictions?: string | null;
  prohibited_industries?: string | null;
  preferred_industries?: string | null;
  industry_position_restrictions?: string | null;
  other_requirements?: string | null;
};

const TIER_ORDER: LenderTier[] = [1, 2, 3, 4, 5];
const TIER_SHORT: Record<number, string> = {
  1: 'A',
  2: 'B',
  3: 'C',
  4: 'D',
  5: 'E',
};

function esc(raw: unknown): string {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n)) || Number(n) <= 0) return '—';
  const v = Math.round(Number(n));
  if (v >= 1000) return '$' + (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1) + 'k';
  return '$' + v.toLocaleString();
}

function num(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n)) || Number(n) <= 0) return '—';
  return String(n);
}

function squeeze(raw: unknown, max = 140): string {
  const t = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

function flags(l: PrintLender): string {
  const bits: string[] = [];
  if (l.no_credit_pull) bits.push('NCP');
  if (l.does_buyout) bits.push('BO');
  if (l.does_reverse_consolidation) bits.push('RC');
  const sole = l.accepts_sole_prop ?? (l.restricts_sole_props ? false : null);
  if (sole === false) bits.push('No SP');
  if (l.hard_pull_sole_props) bits.push('HP-SP');
  if (l.accepts_defaults) bits.push('Def');
  if (l.accepts_nonprofit) bits.push('NP');
  if (l.accepts_mercury) bits.push('Merc');
  return bits.join(' ') || '—';
}

function requirements(l: PrintLender): string {
  const parts = [
    l.state_restrictions || (l.restricted_states ?? []).join(', '),
    l.prohibited_industries || (l.restricted_industry_keywords ?? []).join(', '),
    l.preferred_industries ? `Pref: ${l.preferred_industries}` : '',
    l.industry_position_restrictions,
    l.other_requirements,
    l.notes,
  ]
    .map(s => String(s ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return squeeze(parts.join(' · '), 160) || '—';
}

function row(l: PrintLender): string {
  const pos = (l.min_position || l.max_position)
    ? `${l.min_position ?? '—'}–${l.max_position ?? '—'}`
    : '—';
  const nsfNeg = [l.max_nsfs != null ? `NSF ${l.max_nsfs}` : '', l.neg_days_max != null ? `Neg ${l.neg_days_max}` : '']
    .filter(Boolean).join('/') || '—';
  const advance = (l.min_amount || l.max_amount)
    ? `${money(l.min_amount)}–${money(l.max_amount)}`
    : '—';
  return `<tr class="${l.is_active ? '' : 'off'}">
    <td class="name">${esc(l.name)}${l.is_active ? '' : ' <i>off</i>'}</td>
    <td class="c">${esc(TIER_SHORT[l.tier] || l.tier)}</td>
    <td class="c">${esc(money(l.min_monthly_revenue))}</td>
    <td class="c">${l.min_tib_months ? esc(l.min_tib_months) + 'm' : '—'}</td>
    <td class="c">${esc(num(l.min_fico))}</td>
    <td class="c">${esc(pos)}</td>
    <td class="c">${esc(nsfNeg)}</td>
    <td class="c">${esc(advance)}</td>
    <td>${esc(flags(l))}</td>
    <td class="req">${esc(requirements(l))}</td>
  </tr>`;
}

export function printLenderList(lenders: PrintLender[]) {
  const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const sorted = [...lenders].sort((a, b) => (a.tier - b.tier) || a.name.localeCompare(b.name));
  const sections = TIER_ORDER.map(tier => {
    const rows = sorted.filter(l => l.tier === tier);
    if (!rows.length) return '';
    return `<tbody>
      <tr class="tier"><td colspan="10">${esc(TIER_LABELS[tier])} · ${rows.length}</td></tr>
      ${rows.map(row).join('')}
    </tbody>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Lender List</title>
  <style>
    @page { size: landscape; margin: 0.28in; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      color: #111;
      font-size: 7.5pt;
      line-height: 1.2;
    }
    .mast { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }
    h1 { font-size: 11pt; margin: 0; }
    .sub { margin: 0; color: #555; font-size: 7pt; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { padding: 2px 4px; border-bottom: 0.4pt solid #ddd; vertical-align: top; overflow: hidden; }
    th {
      text-align: left;
      font-size: 6.5pt;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #555;
      border-bottom: 0.8pt solid #111;
    }
    .c { text-align: center; white-space: nowrap; }
    .name { font-weight: 650; width: 14%; }
    .req { width: 38%; color: #333; }
    .tier td {
      font-size: 7pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      background: #f0f0f0;
      border-bottom: 0.6pt solid #bbb;
      padding: 3px 4px;
    }
    tr.off td { color: #888; }
    i { font-style: normal; font-weight: 500; color: #999; }
    col.n { width: 14%; } col.t { width: 3.5%; } col.m { width: 6%; }
    col.p { width: 4.5%; } col.f { width: 4.5%; } col.pos { width: 5%; }
    col.ns { width: 8%; } col.adv { width: 8%; } col.fl { width: 8.5%; } col.r { width: 38%; }
  </style>
</head>
<body>
  <div class="mast">
    <h1>Lender List</h1>
    <p class="sub">${sorted.length} lenders · ${esc(date)} · NCP no credit pull · BO buyout · RC reverse consol · SP sole prop · HP-SP hard pull SP · Def defaults · NP nonprofit · Merc Mercury</p>
  </div>
  <table>
    <colgroup>
      <col class="n" /><col class="t" /><col class="m" /><col class="p" /><col class="f" />
      <col class="pos" /><col class="ns" /><col class="adv" /><col class="fl" /><col class="r" />
    </colgroup>
    <thead>
      <tr>
        <th>Lender</th>
        <th class="c">Tier</th>
        <th class="c">Min Rev</th>
        <th class="c">TIB</th>
        <th class="c">FICO</th>
        <th class="c">Pos</th>
        <th class="c">NSF/Neg</th>
        <th class="c">Advance</th>
        <th>Flags</th>
        <th>Requirements</th>
      </tr>
    </thead>
    ${sections || '<tbody><tr><td colspan="10">No lenders on file.</td></tr></tbody>'}
  </table>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=1200,height=800');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
}
