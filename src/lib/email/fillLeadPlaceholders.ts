export function fillLeadPlaceholders(
  text: string,
  lead: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    company?: string | null;
    underwriting_data?: Record<string, unknown> | null;
  },
): string {
  const name = String(lead.name || '');
  const firstName = name.split(' ')[0] || name;
  const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;
  const ud = (lead.underwriting_data || {}) as Record<string, unknown>;
  const actualOffers = (ud.actualOffers as Array<Record<string, unknown>>) || [];
  const selectedOffer = actualOffers.find(o => o.id === ud.selectedOfferId) || null;

  let offer_amount = '';
  let offer_payment = '';
  let offer_term = '';
  let offer_total_repayment = '';
  let negotiated_amount = '';
  let negotiated_payment = '';
  let negotiated_term = '';
  let negotiated_total_repayment = '';

  if (selectedOffer) {
    const termLen = Number(selectedOffer.termLength) || 250;
    const freq = String(selectedOffer.paymentFrequency || 'Daily');
    const amount = Number(selectedOffer.amount) || 0;
    const factor = Number(selectedOffer.factorRate) || 1;
    const totalRepay = amount * factor;
    offer_amount = fmt(amount);
    offer_payment = `${fmt(totalRepay / termLen)}/${freq.toLowerCase()}`;
    offer_term = `${termLen} payments`;
    offer_total_repayment = fmt(totalRepay);
    const adjAmt = Number(ud.adjustedAmount ?? amount);
    const buyRate = Number(selectedOffer.buyRate ?? 1.2);
    const addedPts = Number(ud.negotiationAddedPoints ?? 0);
    const negFactor = buyRate + addedPts / 100;
    const negTotal = adjAmt * negFactor;
    negotiated_amount = fmt(adjAmt);
    negotiated_payment = `${fmt(negTotal / termLen)}/${freq.toLowerCase()}`;
    negotiated_term = `${termLen} payments`;
    negotiated_total_repayment = fmt(negTotal);
  }

  const replacements: Record<string, string> = {
    firstName,
    name,
    email: String(lead.email || ''),
    phone: String(lead.phone || ''),
    company: String(lead.company || ''),
    offer_amount,
    offer_payment,
    offer_term,
    offer_total_repayment,
    negotiated_amount,
    negotiated_payment,
    negotiated_term,
    negotiated_total_repayment,
  };

  let result = text;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }
  return result;
}
