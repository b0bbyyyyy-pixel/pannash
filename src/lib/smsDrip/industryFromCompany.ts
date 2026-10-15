/** Guess a business industry from a company name (and optional underwriting industry). */

const RULES: { name: string; re: RegExp }[] = [
  { name: 'Restaurants', re: /\b(restaurant|restaurante|diner|cafe|caf[eé]|coffee|espresso|pizza|pizzeria|grill|bakery|bistro|catering|taco|sushi|bbq|barbeque|steakhouse|eatery|kitchen|burger|deli|wings|seafood|bar\s*&?\s*grill|food\s*truck|cantina|taqueria)\b/i },
  { name: 'Trucking', re: /\b(truck(?:ing)?|freight|logistics|transport(?:ation)?|hauling|carrier|expedit)\b/i },
  { name: 'HVAC', re: /\b(hvac|heating|air\s*condition|cooling|furnace)\b/i },
  { name: 'Plumbing', re: /\b(plumb(?:ing|er)?)\b/i },
  { name: 'Electrical', re: /\b(electric(?:al|ian)?)\b/i },
  { name: 'Roofing', re: /\b(roof(?:ing|er)?)\b/i },
  { name: 'Construction', re: /\b(construction|contractor|builders?|masonry|concrete|excavat|framing|general\s*contract|remodel|renovat|drywall|paving|asphalt|homes|home\s*build)\b/i },
  { name: 'Auto', re: /\b(auto(?:motive)?|motors?|car\s*wash|collision|body\s*shop|tires?|mechanic|transmission|detailing|diesel|towing)\b/i },
  { name: 'Dental', re: /\b(dent(?:al|ist|istry)|orthodont|oral\s*surg)\b/i },
  { name: 'Medical', re: /\b(medical|clinic|chiropract|pharmacy|pharmac|health(?:care)?|hospital|therap|physio|wellness|urgent\s*care|optom|vision)\b/i },
  { name: 'Salon / Beauty', re: /\b(salon|spa|barber|beauty|nails?|hair|lash|aesthetics?|med\s*spa)\b/i },
  { name: 'Fitness', re: /\b(gym|fitness|yoga|crossfit|pilates|martial\s*arts)\b/i },
  { name: 'Retail', re: /\b(store|boutique|mart|market|shop(?:pe)?|retail|convenience|c-store|liquor)\b/i },
  { name: 'Gas / C-store', re: /\b(gas\s*station|fuel|petroleum|exxon|shell|chevron|bp\b|citgo|marathon)\b/i },
  { name: 'Real Estate', re: /\b(real\s*estate|realty|propert(?:y|ies)|brokerage)\b/i },
  { name: 'Legal', re: /\b(law\s*(firm|office|group)|attorney|legal|esquire)\b/i },
  { name: 'Cleaning', re: /\b(clean(?:ing|ers)?|janitorial|maid|custodial)\b/i },
  { name: 'Landscaping', re: /\b(landscap(?:e|ing)|lawn|irrigation|tree\s*service)\b/i },
  { name: 'Manufacturing', re: /\b(manufactur|fabricat|industrial|machine\s*shop|welding)\b/i },
  { name: 'Hospitality', re: /\b(hotel|motel|inn|lodging|hospitality|resort)\b/i },
  { name: 'Staffing', re: /\b(staffing|recruit(?:ing|er)?|temp\s*agenc)\b/i },
  { name: 'Insurance', re: /\b(insurance|insur(?:e|er))\b/i },
  { name: 'Childcare', re: /\b(daycare|day\s*care|childcare|child\s*care|preschool|learning\s*center)\b/i },
  { name: 'Veterinary', re: /\b(vet(?:erinar(?:y|ian))?|animal\s*hospital|pet\s*(care|clinic))\b/i },
  { name: 'Agriculture', re: /\b(farm(?:ing)?|ranch|agricultur|dairy|nursery|greenhouse)\b/i },
  { name: 'Security', re: /\b(security|alarm|protective)\b/i },
  { name: 'Waste', re: /\b(waste|dumpster|junk|sanitation|recycling)\b/i },
  { name: 'Wholesale', re: /\b(wholesale|distributor|distribution|supply)\b/i },
  { name: 'IT / Software', re: /\b(software|technology|digital|it\s*service|cyber|computer)\b/i },
  { name: 'Home Services', re: /\b(handyman|home\s*service|pest\s*control|garage\s*door|window|siding|painting|painter)\b/i },
];

function uwIndustry(underwriting: unknown): string {
  if (!underwriting || typeof underwriting !== 'object') return '';
  const v = (underwriting as Record<string, unknown>).industry;
  return typeof v === 'string' ? v.trim() : '';
}

function classify(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  for (const rule of RULES) {
    if (rule.re.test(t)) return rule.name;
  }
  return null;
}

export function industryFromCompany(company?: string | null, underwriting?: unknown): string | null {
  const uw = uwIndustry(underwriting);
  const fromUw = classify(uw);
  if (fromUw) return fromUw;
  const fromName = classify(String(company ?? ''));
  if (fromName) return fromName;
  if (uw) {
    const cleaned = uw.replace(/\s+/g, ' ').trim();
    return cleaned.length > 36 ? `${cleaned.slice(0, 34)}…` : cleaned;
  }
  return null;
}
