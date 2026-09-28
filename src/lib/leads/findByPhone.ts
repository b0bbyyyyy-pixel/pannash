import { toE164 } from '@/lib/dialer/e164';

export type LeadByPhone = {
  id: string;
  name: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  phone_e164?: string | null;
};

export function last10(raw: string | null | undefined): string {
  return String(raw ?? '').replace(/\D/g, '').slice(-10);
}

export function phoneVariants(raw: string): string[] {
  const e164 = toE164(raw);
  const d = last10(raw);
  return [...new Set([raw, e164, d, d ? `+1${d}` : '', d ? `1${d}` : ''].filter(Boolean))] as string[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function findLeadByPhone(
  supabase: any,
  phone: string,
  userId: string,
): Promise<LeadByPhone | null> {
  const variants = phoneVariants(phone);
  const digits = last10(phone);
  if (!variants.length && digits.length !== 10) return null;

  if (variants.length) {
    const { data: byE164 } = await supabase
      .from('leads')
      .select('id, name, company, email, phone, phone_e164')
      .eq('user_id', userId)
      .in('phone_e164', variants)
      .limit(1);
    if (byE164?.[0]) return byE164[0] as LeadByPhone;

    const { data: byPhone } = await supabase
      .from('leads')
      .select('id, name, company, email, phone, phone_e164')
      .eq('user_id', userId)
      .in('phone', variants)
      .limit(1);
    if (byPhone?.[0]) return byPhone[0] as LeadByPhone;
  }

  if (digits.length === 10) {
    const { data: all } = await supabase
      .from('leads')
      .select('id, name, company, email, phone, phone_e164')
      .eq('user_id', userId)
      .or('phone.not.is.null,phone_e164.not.is.null');
    const match = (all ?? []).find((l: LeadByPhone) =>
      last10(l.phone) === digits || last10(l.phone_e164) === digits
    );
    if (match) return match as LeadByPhone;
  }

  return null;
}
