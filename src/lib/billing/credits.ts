import twilio from 'twilio';
import { getTwilioCreds } from '@/lib/telephony/twilio';

export type CreditStatus = 'ok' | 'not_connected' | 'not_configured' | 'error';

export type ProviderCredits = {
  status: CreditStatus;
  remaining: number | null;
  used?: number | null;
  currency: string;
  label?: string;
  error?: string;
};

export type BillingCredits = {
  fetchedAt: string;
  twilio: ProviderCredits;
  xai: ProviderCredits;
};

const XAI_MGMT_BASE = 'https://management-api.x.ai';

function centsToUsd(cents: number): number {
  return Math.round(cents) / 100;
}

function readCents(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === 'object' && raw && 'val' in raw) {
    return readCents((raw as { val: unknown }).val);
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function pickTeamId(body: Record<string, unknown>): string | null {
  const scope = String(body.scope ?? '').toUpperCase();
  if (scope.includes('ORGANIZATION')) return null;

  const candidates = [
    body.teamId,
    body.team_id,
    (body.team as { id?: unknown } | undefined)?.id,
    (body.key as { teamId?: unknown } | undefined)?.teamId,
  ];
  if (scope.includes('TEAM') || !scope) {
    candidates.push(body.scopeId, body.scope_id);
  }
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return null;
}

async function xaiGet(path: string, key: string): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${XAI_MGMT_BASE}${path}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
    cache: 'no-store',
  });
  let json: Record<string, unknown> = {};
  try {
    const raw = await res.json();
    if (raw && typeof raw === 'object') json = raw as Record<string, unknown>;
  } catch {
    json = {};
  }
  return { ok: res.ok, status: res.status, json };
}

async function resolveXaiTeamId(key: string): Promise<string | null> {
  const configured = process.env.XAI_TEAM_ID?.trim();
  if (configured) return configured;

  const paths = [
    '/auth/management-keys/validation',
    '/v1/auth/management-keys/validation',
  ];
  for (const path of paths) {
    const { ok, json } = await xaiGet(path, key);
    if (!ok) continue;
    const team = pickTeamId(json);
    if (team) return team;
  }
  return null;
}

export async function fetchTwilioCredits(supabase: unknown, userId: string): Promise<ProviderCredits> {
  const creds = await getTwilioCreds(supabase, userId);
  if (!creds) {
    return {
      status: 'not_connected',
      remaining: null,
      currency: 'USD',
      error: 'Connect Twilio in Email & Phone Connectors to see remaining credits.',
    };
  }

  try {
    const client = twilio(creds.accountSid, creds.authToken);
    const accountCtx = client.api.accounts(creds.accountSid);
    const [balance, account] = await Promise.all([
      accountCtx.balance.fetch(),
      accountCtx.fetch().catch(() => null),
    ]);
    const remaining = Number(balance.balance);
    if (!Number.isFinite(remaining)) {
      return { status: 'error', remaining: null, currency: balance.currency || 'USD', error: 'Twilio returned an unreadable balance.' };
    }
    return {
      status: 'ok',
      remaining,
      currency: balance.currency || 'USD',
      label: account?.friendlyName || `····${creds.accountSid.slice(-4)}`,
    };
  } catch (e) {
    return {
      status: 'error',
      remaining: null,
      currency: 'USD',
      error: e instanceof Error ? e.message : 'Could not load Twilio balance.',
    };
  }
}

export async function fetchXaiCredits(): Promise<ProviderCredits> {
  const key = (process.env.XAI_MANAGEMENT_API_KEY || process.env.XAI_MANAGEMENT_KEY || '').trim();
  if (!key) {
    return {
      status: 'not_configured',
      remaining: null,
      currency: 'USD',
      error: 'Add XAI_MANAGEMENT_API_KEY from console.x.ai → Settings → Management Keys.',
    };
  }

  try {
    const teamId = await resolveXaiTeamId(key);
    if (!teamId) {
      return {
        status: 'error',
        remaining: null,
        currency: 'USD',
        error: 'Could not resolve the xAI team. Set XAI_TEAM_ID or check the management key.',
      };
    }

    const teamPath = `/v1/billing/teams/${encodeURIComponent(teamId)}`;
    const [balanceRes, invoiceRes] = await Promise.all([
      xaiGet(`${teamPath}/prepaid/balance`, key),
      xaiGet(`${teamPath}/postpaid/invoice/preview`, key),
    ]);

    if (!balanceRes.ok && !invoiceRes.ok) {
      const status = balanceRes.status;
      return {
        status: 'error',
        remaining: null,
        currency: 'USD',
        error: status === 401 || status === 403
          ? 'This management key is missing Billing Read. Edit it in console.x.ai → Settings → Management Keys and enable Billing.'
          : `xAI billing request failed (${status}).`,
      };
    }

    const invoice = (invoiceRes.json.coreInvoice ?? {}) as Record<string, unknown>;
    // Ledger is inverted (purchases negative). `total` / prepaidCredits is the
    // purchased pot; spend is prepaidCreditsUsed on the current invoice.
    const purchasedCents = readCents(invoice.prepaidCredits) ?? readCents(balanceRes.json.total);
    const usedCents = readCents(invoice.prepaidCreditsUsed);
    if (purchasedCents == null) {
      return { status: 'error', remaining: null, currency: 'USD', error: 'xAI returned an unreadable prepaid balance.' };
    }

    const purchased = centsToUsd(Math.abs(purchasedCents));
    const used = usedCents == null ? 0 : centsToUsd(Math.abs(usedCents));
    return {
      status: 'ok',
      remaining: Math.max(0, Math.round((purchased - used) * 100) / 100),
      used,
      currency: 'USD',
      label: 'console.x.ai prepaid',
    };
  } catch (e) {
    return {
      status: 'error',
      remaining: null,
      currency: 'USD',
      error: e instanceof Error ? e.message : 'Could not load xAI credits.',
    };
  }
}

export async function fetchBillingCredits(supabase: unknown, userId: string): Promise<BillingCredits> {
  const [twilioCredits, xai] = await Promise.all([
    fetchTwilioCredits(supabase, userId),
    fetchXaiCredits(),
  ]);
  return {
    fetchedAt: new Date().toISOString(),
    twilio: twilioCredits,
    xai,
  };
}
