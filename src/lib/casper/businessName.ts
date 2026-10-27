import { isMissingSchema, warnMissingSchema } from '@/lib/casper/schema';

export function normalizeBusinessName(raw: unknown): string {
  return String(raw ?? '').replace(/\s+/g, ' ').trim();
}

export type BusinessNameLookup = { name: string; columnPresent: boolean };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getBusinessName(supabase: any, userId: string): Promise<BusinessNameLookup> {
  try {
    const { data, error } = await supabase
      .from('user_settings')
      .select('business_name')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      if (isMissingSchema(error)) warnMissingSchema('business_name', error);
      return { name: '', columnPresent: false };
    }
    return { name: normalizeBusinessName(data?.business_name), columnPresent: true };
  } catch (err) {
    if (isMissingSchema(err)) warnMissingSchema('business_name', err);
    return { name: '', columnPresent: false };
  }
}

export function applyBusinessName(template: string, businessName: string) {
  return template.replace(/\{business_name\}/g, businessName);
}
