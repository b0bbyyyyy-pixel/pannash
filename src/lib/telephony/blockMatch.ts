import { toE164 } from '../dialer/e164';

function last10(raw: string | null | undefined) {
  return String(raw ?? '').replace(/\D/g, '').slice(-10);
}

export function phoneOnBlockList(phone: string | null | undefined, blockedE164s: string[]) {
  const digits = last10(phone);
  const e164 = toE164(phone);
  return blockedE164s.some(b => {
    if (e164 && b === e164) return true;
    return digits.length === 10 && last10(b) === digits;
  });
}
