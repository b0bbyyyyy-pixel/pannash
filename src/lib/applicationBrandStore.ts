import { isMissingSchema, warnMissingSchema } from '@/lib/casper/schema';
import {
  DEFAULT_APPLICATION_BRAND,
  parseApplicationBrand,
  type ApplicationBrandId,
} from '@/lib/applicationBrands';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadApplicationBrand(supabase: any, userId: string): Promise<ApplicationBrandId> {
  try {
    const { data, error } = await supabase
      .from('user_settings')
      .select('application_brand')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      if (isMissingSchema(error)) warnMissingSchema('application_brand', error);
      return DEFAULT_APPLICATION_BRAND;
    }
    return parseApplicationBrand(data?.application_brand);
  } catch (err) {
    if (isMissingSchema(err)) warnMissingSchema('application_brand', err);
    return DEFAULT_APPLICATION_BRAND;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function saveApplicationBrand(
  supabase: any,
  userId: string,
  brand: ApplicationBrandId,
): Promise<{ ok: boolean; needsColumn?: boolean }> {
  const now = new Date().toISOString();
  const { data: existing } = await supabase
    .from('user_settings')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();

  const payload = { application_brand: brand, updated_at: now };
  const { error } = existing?.user_id
    ? await supabase.from('user_settings').update(payload).eq('user_id', userId)
    : await supabase.from('user_settings').insert({ user_id: userId, ...payload });

  if (error) {
    if (isMissingSchema(error)) {
      warnMissingSchema('application_brand', error);
      return { ok: false, needsColumn: true };
    }
    return { ok: false };
  }
  return { ok: true };
}
