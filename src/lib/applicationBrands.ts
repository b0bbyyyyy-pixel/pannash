import { APPLICATION_BROKER } from '@/lib/fundingApplication';

export const APPLICATION_BRANDS = {
  oneFunding: {
    id: 'oneFunding',
    label: 'One Funding Solution',
    header: 'ONE FUNDING SOLUTION',
    legalName: 'One Funding Solution',
    email: 'hello@onefundingsolution.com',
    broker: 'One Funding Solution  |  hello@onefundingsolution.com',
    generated: 'Generated via One Funding Solution',
  },
  abf: {
    id: 'abf',
    label: 'American Business Funding',
    header: 'AMERICAN BUSINESS FUND',
    legalName: 'American Business Funding LLC',
    email: 'info@Americanbusinessfunding.com',
    broker: `Broker: ${APPLICATION_BROKER.name}  |  Email: ${APPLICATION_BROKER.email}`,
    generated: 'Generated via American Business Funding LLC',
  },
} as const;

export type ApplicationBrandId = keyof typeof APPLICATION_BRANDS;
export const DEFAULT_APPLICATION_BRAND: ApplicationBrandId = 'oneFunding';
export const APPLICATION_BRAND_LIST = [
  APPLICATION_BRANDS.oneFunding,
  APPLICATION_BRANDS.abf,
] as const;

export function parseApplicationBrand(value: unknown): ApplicationBrandId {
  if (value === 'oneFunding' || value === 'abf') return value;
  return DEFAULT_APPLICATION_BRAND;
}
