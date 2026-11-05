import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { last10, phonesOverlap } from '@/lib/leads/phone';
import type { FundingApplicationData } from '@/lib/fundingApplication';
import { buildFundingApplicationPdf } from '@/lib/fundingApplicationPdf';
import { notifyLeadActivity } from '@/lib/casper/ping';

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

const MAX_FILE_BYTES = 4 * 1024 * 1024;

function field(form: FormData, name: string) {
  return String(form.get(name) ?? '').trim();
}

type ExistingLead = { id: string; notes: string | null; company: string | null };

async function leadRecord(supabase: SupabaseClient, userId: string, id: string): Promise<ExistingLead | null> {
  const { data } = await supabase
    .from('leads')
    .select('id, notes, company')
    .eq('user_id', userId)
    .eq('id', id)
    .maybeSingle();
  if (!data?.id) return null;
  return { id: data.id, notes: data.notes ?? null, company: data.company ?? null };
}

async function findLeadIdByPhone(supabase: SupabaseClient, userId: string, phone: string): Promise<string | null> {
  const digits = last10(phone);
  if (digits.length !== 10) return null;
  const pattern = `%${digits.slice(0, 3)}%${digits.slice(3, 6)}%${digits.slice(6)}%`;
  const { data } = await supabase
    .from('leads')
    .select('id, phone, phone_e164')
    .eq('user_id', userId)
    .or(`phone.ilike.${pattern},phone_e164.ilike.${pattern}`)
    .limit(10);
  const row = (data ?? []).find((lead) => phonesOverlap(lead.phone, phone) || phonesOverlap(lead.phone_e164, phone));
  return row?.id ?? null;
}

async function findLeadByEmail(supabase: SupabaseClient, userId: string, email: string): Promise<ExistingLead | null> {
  const cleaned = email.trim();
  if (!cleaned) return null;
  const { data } = await supabase
    .from('leads')
    .select('id, notes, company')
    .eq('user_id', userId)
    .ilike('email', cleaned.replace(/[%_\\]/g, '\\$&'))
    .order('last_contact', { ascending: false, nullsFirst: false })
    .limit(1);
  const row = Array.isArray(data) ? data[0] : null;
  return row?.id ? { id: row.id, notes: row.notes ?? null, company: row.company ?? null } : null;
}

function pdfMoney(raw: string) {
  const n = Number(raw.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return '';
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

function oneFundingPdfName(legalName: string) {
  const safe = (legalName || 'Application').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '') || 'Application';
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `One_Funding_Application_${safe}_${y}-${m}-${d}.pdf`;
}

function blank(value: unknown) {
  return value == null || String(value).trim() === '';
}

async function fillLeadFromApplication(
  supabase: SupabaseClient,
  userId: string,
  leadId: string,
  form: FormData,
  legalName: string,
  email: string,
  fullName: string,
) {
  const { data: current } = await supabase
    .from('leads')
    .select('underwriting_data, company, email, name, value')
    .eq('id', leadId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!current) return;

  const money = (name: string) => field(form, name).replace(/[$,\s]/g, '');
  const incoming: Record<string, string> = {
    ssn: field(form, 'ssn'),
    ein: field(form, 'ein'),
    dob: field(form, 'dob'),
    creditScore: field(form, 'creditScore'),
    homeAddress: field(form, 'homeAddress'),
    city: field(form, 'homeCity'),
    state: field(form, 'homeState'),
    zip: field(form, 'ownerZip'),
    businessAddress: field(form, 'businessAddress'),
    businessCity: field(form, 'businessCity'),
    businessState: field(form, 'businessState'),
    businessZip: field(form, 'businessZip'),
    dba: field(form, 'dba'),
    entityType: field(form, 'entityType'),
    industry: field(form, 'industry'),
    businessStartDate: field(form, 'startDate'),
    businessPhone: field(form, 'businessPhone'),
    purposeOfFunds: field(form, 'useOfFunds'),
    requestedAmount: money('amountRequested'),
    monthlyRevenue: money('revenue'),
    avgDailyBalance: money('averageBalance'),
    ownershipPercent: field(form, 'ownership'),
  };

  const ud = current.underwriting_data && typeof current.underwriting_data === 'object'
    ? { ...(current.underwriting_data as Record<string, unknown>) }
    : {};
  for (const [key, value] of Object.entries(incoming)) {
    if (!value || !blank(ud[key])) continue;
    ud[key] = value;
  }
  const startupAnswer = field(form, 'startup').toLowerCase();
  if (startupAnswer === 'yes' || startupAnswer === 'no') ud.startup = startupAnswer;
  const product = field(form, 'product');
  if (product) ud.product = product;

  const update: Record<string, unknown> = { underwriting_data: ud };
  if (blank(current.company) && legalName) update.company = legalName;
  if (blank(current.email) && email) update.email = email;
  if (blank(current.name) && fullName) update.name = fullName;
  const requestedNum = Number(incoming.requestedAmount);
  const currentValue = Number(current.value);
  if (Number.isFinite(requestedNum) && requestedNum > 0 && !(currentValue > 0)) {
    update.value = requestedNum;
  }

  const { error } = await supabase.from('leads').update(update).eq('id', leadId).eq('user_id', userId);
  if (error) console.error('Failed to copy application onto lead:', error.message);
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? '';
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ownerUserId = process.env.PANNASH_OWNER_USER_ID;
  if (!ownerUserId) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form' }, { status: 400 });
  }

  const firstName = field(form, 'firstName');
  const lastName = field(form, 'lastName');
  const email = field(form, 'email');
  const mobile = field(form, 'mobile');
  const legalName = field(form, 'legalName');
  if (!firstName || !lastName || !email || !mobile || !legalName) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const supabase = getAdminClient();
  const LIST_NAME = 'One Funding';

  const { data: existingList } = await supabase
    .from('lead_lists')
    .select('id')
    .eq('user_id', ownerUserId)
    .eq('name', LIST_NAME)
    .maybeSingle();

  let listId = existingList?.id as string | undefined;
  if (!listId) {
    const { data: newList, error: listError } = await supabase
      .from('lead_lists')
      .insert({ user_id: ownerUserId, name: LIST_NAME, description: 'Leads from onefundingsolution.com' })
      .select('id')
      .single();
    if (listError || !newList) {
      return NextResponse.json({ error: 'Failed to create lead list' }, { status: 500 });
    }
    listId = newList.id;
  }

  const notes = [
    'Full application — onefundingsolution.com/apply',
    `Product: ${field(form, 'product')}`,
    `Submitted: ${new Date().toISOString()}`,
    '',
    `Credit range: ${field(form, 'creditRange')}`,
    `Personal income: ${field(form, 'personalIncome')}`,
    `Time in business: ${field(form, 'timeInBusiness')}`,
    `Startup: ${field(form, 'startup')}`,
    '',
    'Owner',
    `Name: ${firstName} ${lastName}`,
    `Email: ${email}`,
    `Mobile: ${mobile}`,
    `DOB: ${field(form, 'dob')}`,
    `Home: ${[field(form, 'homeAddress'), field(form, 'homeCity'), field(form, 'homeState'), field(form, 'ownerZip')].filter(Boolean).join(', ')}`,
    `SSN: ${field(form, 'ssn')}`,
    `Credit score: ${field(form, 'creditScore')}`,
    `Ownership: ${field(form, 'ownership')}`,
    `Authorized owner: ${field(form, 'authorizedOwner')}`,
    field(form, 'secondOwner') === 'yes'
      ? `Second owner: ${field(form, 'secondFirstName')} ${field(form, 'secondLastName')} ${field(form, 'secondEmail')} ${field(form, 'secondMobile')} ${field(form, 'secondOwnership')}`
      : 'Second owner: No',
    '',
    'Business',
    `Legal name: ${legalName}`,
    `DBA: ${field(form, 'dba')}`,
    `Address: ${[field(form, 'businessAddress'), field(form, 'businessCity'), field(form, 'businessState'), field(form, 'businessZip')].filter(Boolean).join(', ')}`,
    `Industry: ${field(form, 'industry')}`,
    `Start date: ${field(form, 'startDate')}`,
    `EIN: ${field(form, 'ein')}`,
    `Entity: ${field(form, 'entityType')}`,
    `Business phone: ${field(form, 'businessPhone')}`,
    `Amount requested: ${field(form, 'amountRequested')}`,
    `Use of funds: ${field(form, 'useOfFunds')}`,
    `Revenue: ${field(form, 'revenue')}`,
    `Average balance: ${field(form, 'averageBalance')}`,
    `Previous business loans: ${field(form, 'previousLoans')}`,
    '',
    'Signed: yes',
  ].join('\n');

  const businessPhone = field(form, 'businessPhone');
  const phoneMatchId = await findLeadIdByPhone(supabase, ownerUserId, mobile)
    ?? (businessPhone ? await findLeadIdByPhone(supabase, ownerUserId, businessPhone) : null);
  const emailMatch = await findLeadByEmail(supabase, ownerUserId, email);
  const matchedId = phoneMatchId ?? emailMatch?.id ?? null;
  const existing = matchedId ? await leadRecord(supabase, ownerUserId, matchedId) : null;

  let leadId = existing?.id ?? '';
  if (existing) {
    const { error: updateError } = await supabase
      .from('leads')
      .update({
        notes: existing.notes ? `${existing.notes}\n\n${notes}` : notes,
        last_contact: new Date().toISOString(),
        ...(existing.company ? {} : { company: legalName }),
      })
      .eq('id', existing.id)
      .eq('user_id', ownerUserId);
    if (updateError) console.error('Failed to update matched lead:', updateError);
  } else {
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .insert({
        user_id: ownerUserId,
        name: `${firstName} ${lastName}`,
        email,
        phone: mobile,
        company: legalName,
        notes,
        list_id: listId,
        last_contact: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (leadError || !lead) {
      console.error('Failed to insert application lead:', leadError);
      return NextResponse.json({ error: 'Failed to create lead' }, { status: 500 });
    }
    leadId = lead.id;
  }

  await fillLeadFromApplication(supabase, ownerUserId, leadId, form, legalName, email, `${firstName} ${lastName}`);

  const uploads: { file: File; name: string }[] = [];
  const signature = form.get('signature');
  const signaturePng = signature instanceof File && signature.size > 0
    ? new Uint8Array(await signature.arrayBuffer())
    : undefined;
  const revenueNum = Number(field(form, 'revenue').replace(/[^0-9.]/g, ''));
  const requestedRaw = field(form, 'amountRequested');
  const pdfData: FundingApplicationData = {
    legalName,
    dba: field(form, 'dba'),
    businessAddress: field(form, 'businessAddress'),
    businessCity: field(form, 'businessCity'),
    businessState: field(form, 'businessState'),
    businessZip: field(form, 'businessZip'),
    businessPhone: field(form, 'businessPhone'),
    businessEmail: email,
    ein: field(form, 'ein'),
    dateStarted: field(form, 'startDate'),
    entityType: field(form, 'entityType'),
    industry: field(form, 'industry'),
    useOfProceeds: field(form, 'useOfFunds'),
    annualRevenue: Number.isFinite(revenueNum) && revenueNum > 0 ? pdfMoney(String(revenueNum * 12)) : '',
    requestedAmount: pdfMoney(requestedRaw) || requestedRaw,
    owner1Name: `${firstName} ${lastName}`.trim(),
    owner1Title: 'Owner',
    owner1HomeAddress: [field(form, 'homeAddress'), field(form, 'homeCity'), field(form, 'homeState'), field(form, 'ownerZip')].filter(Boolean).join(', '),
    owner1Email: email,
    owner1Ssn: field(form, 'ssn'),
    owner1Dob: field(form, 'dob'),
    owner1Ownership: field(form, 'ownership'),
    owner1Credit: field(form, 'creditScore') || 'N/A',
    owner2: field(form, 'secondOwner') === 'yes'
      ? {
          name: [field(form, 'secondFirstName'), field(form, 'secondLastName')].filter(Boolean).join(' '),
          title: 'Owner',
          homeAddress: '',
          email: field(form, 'secondEmail'),
          ssn: '',
          dob: '',
          ownershipPercent: field(form, 'secondOwnership'),
          creditScore: 'N/A',
        }
      : null,
  };
  try {
    const pdfBytes = await buildFundingApplicationPdf(pdfData, {
      signedAt: new Date(),
      brand: 'oneFunding',
      signaturePng,
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '',
    });
    const pdfName = oneFundingPdfName(legalName);
    const pdfBuffer = pdfBytes.buffer.slice(
      pdfBytes.byteOffset,
      pdfBytes.byteOffset + pdfBytes.byteLength,
    ) as ArrayBuffer;
    uploads.push({
      file: new File([pdfBuffer], pdfName, { type: 'application/pdf' }),
      name: pdfName,
    });
  } catch (err) {
    console.error('One Funding application PDF failed:', err);
  }
  for (const item of form.getAll('documents')) {
    if (item instanceof File && item.size > 0) uploads.push({ file: item, name: item.name });
  }

  const failed: string[] = [];
  let stored = 0;
  for (const item of uploads) {
    if (item.file.size > MAX_FILE_BYTES) {
      failed.push(item.name);
      continue;
    }
    const safeName = item.name.replace(/[^a-zA-Z0-9.-]/g, '_') || 'file';
    const columnField = /bank|statement/i.test(safeName) ? 'bank_statements' : 'documents';
    const filePath = `${ownerUserId}/${leadId}/${columnField}/${Date.now()}_${safeName}`;
    const buffer = Buffer.from(await item.file.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from('lead-attachments')
      .upload(filePath, buffer, {
        contentType: item.file.type || 'application/octet-stream',
        upsert: false,
      });
    if (uploadError) {
      console.error('Application file upload failed:', uploadError.message);
      failed.push(item.name);
      continue;
    }
    const { error: dbError } = await supabase.from('lead_attachments').insert({
      user_id: ownerUserId,
      lead_id: leadId,
      column_field: columnField,
      file_name: item.name,
      file_path: filePath,
      file_size: item.file.size,
      file_type: item.file.type || 'application/octet-stream',
    });
    if (dbError) {
      console.error('Application attachment row failed:', dbError.message);
      await supabase.storage.from('lead-attachments').remove([filePath]);
      failed.push(item.name);
      continue;
    }
    stored += 1;
  }

  console.log(`[one-funding application] Lead ${leadId} — ${firstName} ${lastName}${existing ? ' (matched)' : ''}`);

  const extraDocs = form.getAll('documents').filter((item) => item instanceof File && item.size > 0);
  try {
    const { notifyLeadUpload } = await import('@/lib/inbox/uploadUnread');
    const kinds: Array<'application' | 'documents'> = ['application'];
    if (extraDocs.length) kinds.push('documents');
    await notifyLeadUpload(supabase, { userId: ownerUserId, leadId, kinds });
  } catch (err) {
    console.warn('[one-funding application] inbox unread failed', err);
  }

  if (stored > 0) {
    try {
      const { maybeMarkDocsIn } = await import('@/lib/leads/markDocsIn');
      await maybeMarkDocsIn(supabase, {
        leadId,
        userId: ownerUserId,
        fromOutside: true,
      });
    } catch (err) {
      console.warn('[one-funding application] Docs In update failed', err);
    }
  }

  const who = `${firstName} ${lastName}`.trim() || legalName;
  try {
    await notifyLeadActivity(supabase, {
      userId: ownerUserId,
      body: `Casper: ${who} submitted a One Funding application${legalName ? ` for ${legalName}` : ''}.`,
    });
  } catch (err) {
    console.warn('[one-funding application] activity ping failed', err);
  }
  try {
    const { onCasperDocsReceived } = await import('@/lib/casper/docs');
    await onCasperDocsReceived(supabase, {
      userId: ownerUserId,
      leadId,
      fileName: 'One Funding application',
      columnField: 'documents',
      skipPing: true,
    });
  } catch (err) {
    console.warn('[one-funding application] casper docs hook failed', err);
  }

  return NextResponse.json({ ok: true, leadId, matched: Boolean(existing), failed });
}
