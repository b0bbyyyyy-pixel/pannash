export type BankReportLead = {
  name?: string | null;
  company?: string | null;
  underwriting_data?: Record<string, unknown> | null;
};

export function printBankReport(lead: BankReportLead) {
  const d = (lead.underwriting_data || {}) as Record<string, unknown>;
  const html = `<!DOCTYPE html><html><head><title>Bank Report — ${lead.company || lead.name}</title>
                <style>body{font-family:sans-serif;padding:32px;max-width:680px;margin:auto;color:#1a1a1a}h1{font-size:18px;margin-bottom:4px}p.sub{font-size:12px;color:#6b6b6b;margin:0 0 24px}table{width:100%;border-collapse:collapse;font-size:13px}td{padding:8px 10px;border-bottom:1px solid #f0f0f0}td:first-child{color:#6b6b6b;width:55%}td:last-child{font-weight:600;text-align:right}.section{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9b9b9b;padding:14px 10px 4px;border-bottom:2px solid #f0f0f0}@media print{body{padding:16px}}</style>
                </head><body>
                <h1>${lead.company || lead.name}</h1>
                <p class="sub">Bank Statement Analysis · Generated ${new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}</p>
                <table>
                  <tr><td class="section" colspan="2">Revenue</td></tr>
                  <tr><td>Avg Monthly Revenue</td><td>${d.monthlyRevenue ? '$'+Number(d.monthlyRevenue).toLocaleString() : '—'}</td></tr>
                  <tr><td>Month 1 Deposits</td><td>${d.month1Revenue ? '$'+Number(d.month1Revenue).toLocaleString() : '—'}</td></tr>
                  <tr><td>Month 2 Deposits</td><td>${d.month2Revenue ? '$'+Number(d.month2Revenue).toLocaleString() : '—'}</td></tr>
                  <tr><td>Month 3 Deposits</td><td>${d.month3Revenue ? '$'+Number(d.month3Revenue).toLocaleString() : '—'}</td></tr>
                  <tr><td>Month 4 Deposits</td><td>${d.month4Revenue ? '$'+Number(d.month4Revenue).toLocaleString() : '—'}</td></tr>
                  <tr><td class="section" colspan="2">Balances</td></tr>
                  <tr><td>Avg Daily Balance</td><td>${d.avgDailyBalance ? '$'+Number(d.avgDailyBalance).toLocaleString() : '—'}</td></tr>
                  <tr><td>Ending Balance</td><td>${d.endingBalance ? '$'+Number(d.endingBalance).toLocaleString() : '—'}</td></tr>
                  <tr><td class="section" colspan="2">Activity</td></tr>
                  <tr><td>NSF / Neg Days</td><td>${d.nsfCount ?? '—'}</td></tr>
                  <tr><td>Avg Deposits / Mo</td><td>${d.depositsCount ?? '—'}</td></tr>
                  <tr><td>Largest Deposit</td><td>${d.largestDeposit ? '$'+Number(d.largestDeposit).toLocaleString() : '—'}</td></tr>
                  <tr><td class="section" colspan="2">Underwriting</td></tr>
                  <tr><td>Credit Score</td><td>${d.creditScore ?? '—'}</td></tr>
                  <tr><td>Time in Business</td><td>${d.timeInBusiness ? d.timeInBusiness+' mo' : '—'}</td></tr>
                  <tr><td>Industry</td><td>${d.industry ?? '—'}</td></tr>
                  <tr><td>Business State</td><td>${d.businessState ?? '—'}</td></tr>
                  <tr><td>Has Other MCA</td><td>${d.hasOtherMCALoans ? 'Yes' : 'No'}</td></tr>
                </table>
                </body></html>`;
  const w = window.open('', '_blank', 'width=720,height=900');
  if (w) { w.document.write(html); w.document.close(); w.focus(); w.print(); }
}

export function downloadBankCsv(lead: BankReportLead) {
  const d = (lead.underwriting_data || {}) as Record<string, unknown>;
  const rows = [
    ['Field','Value'],
    ['Lead',lead.company||lead.name||''],
    ['Generated',new Date().toLocaleDateString()],
    ['Avg Monthly Revenue',d.monthlyRevenue??''],
    ['Month 1',d.month1Revenue??''],['Month 2',d.month2Revenue??''],
    ['Month 3',d.month3Revenue??''],['Month 4',d.month4Revenue??''],
    ['Avg Daily Balance',d.avgDailyBalance??''],
    ['Ending Balance',d.endingBalance??''],
    ['NSF Count',d.nsfCount??''],
    ['Avg Deposits/Mo',d.depositsCount??''],
    ['Credit Score',d.creditScore??''],
    ['Time in Business (mo)',d.timeInBusiness??''],
    ['Industry',d.industry??''],
    ['Business State',d.businessState??''],
  ];
  const csv = rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv],{type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href=url; a.download=`bank-report-${(lead.company||lead.name||'lead').replace(/\s+/g,'-').toLowerCase()}.csv`;
  a.click(); URL.revokeObjectURL(url);
}
