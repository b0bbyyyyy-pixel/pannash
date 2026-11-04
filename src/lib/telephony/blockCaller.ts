import { toE164 } from '@/lib/dialer/e164';
import { last10 } from '@/lib/leads/phone';
import { findLeadByPhone } from '@/lib/leads/findByPhone';
import { isDncLead, markPhoneDnc } from '@/lib/leads/dnc';
import { phoneOnBlockList } from './blockMatch';

export { phoneOnBlockList };

function missingTable(message: string) {
  return /dnc_numbers/i.test(message) && /does not exist|schema cache/i.test(message);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadBlockedE164s(supabase: any, userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('dnc_numbers')
    .select('e164')
    .eq('user_id', userId);
  if (error) {
    if (missingTable(error.message)) return [];
    console.error('[blockCaller] list', error);
    return [];
  }
  return (data ?? []).map((row: { e164?: string }) => String(row.e164 || '')).filter(Boolean);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function isCallerBlocked(
  supabase: any,
  userId: string,
  phone: string | null | undefined,
) {
  if (!phone) return false;
  const blocked = await loadBlockedE164s(supabase, userId);
  if (phoneOnBlockList(phone, blocked)) return true;
  const lead = await findLeadByPhone(supabase, phone, userId);
  return isDncLead(lead);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function blockCaller(
  supabase: any,
  args: { userId: string; phone?: string | null; leadId?: string | null; reason?: string },
) {
  const e164 = toE164(args.phone);
  if (e164) {
    const { error } = await supabase.from('dnc_numbers').upsert(
      {
        user_id: args.userId,
        e164,
        reason: args.reason || 'blocked_caller',
      },
      { onConflict: 'user_id,e164' },
    );
    if (error && !missingTable(error.message)) {
      console.error('[blockCaller] upsert', error);
    }
  }
  await markPhoneDnc(supabase, {
    userId: args.userId,
    phone: args.phone,
    leadId: args.leadId,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function unblockCaller(supabase: any, userId: string, phone: string) {
  const e164 = toE164(phone);
  const digits = last10(phone);
  if (e164) {
    await supabase.from('dnc_numbers').delete().eq('user_id', userId).eq('e164', e164);
  }
  if (digits.length === 10) {
    const list = await loadBlockedE164s(supabase, userId);
    const extras = list.filter(n => last10(n) === digits);
    if (extras.length) {
      await supabase.from('dnc_numbers').delete().eq('user_id', userId).in('e164', extras);
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listBlockedCallers(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from('dnc_numbers')
    .select('e164, reason, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) {
    if (missingTable(error.message)) return [];
    throw error;
  }
  return data ?? [];
}
