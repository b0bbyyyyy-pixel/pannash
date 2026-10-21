import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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
    `Submitted: ${new Date().toISOString()}`,
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

  const uploads: File[] = [];
  const signature = form.get('signature');
  if (signature instanceof File && signature.size > 0) uploads.push(signature);
  for (const item of form.getAll('documents')) {
    if (item instanceof File && item.size > 0) uploads.push(item);
  }

  const failed: string[] = [];
  for (const file of uploads) {
    if (file.size > MAX_FILE_BYTES) {
      failed.push(file.name);
      continue;
    }
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_') || 'file';
    const columnField = /bank|statement/i.test(safeName) ? 'bank_statements' : 'documents';
    const filePath = `${ownerUserId}/${lead.id}/${columnField}/${Date.now()}_${safeName}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from('lead-attachments')
      .upload(filePath, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });
    if (uploadError) {
      console.error('Application file upload failed:', uploadError.message);
      failed.push(file.name);
      continue;
    }
    const { error: dbError } = await supabase.from('lead_attachments').insert({
      user_id: ownerUserId,
      lead_id: lead.id,
      column_field: columnField,
      file_name: file.name,
      file_path: filePath,
      file_size: file.size,
      file_type: file.type || 'application/octet-stream',
    });
    if (dbError) {
      console.error('Application attachment row failed:', dbError.message);
      await supabase.storage.from('lead-attachments').remove([filePath]);
      failed.push(file.name);
    }
  }

  console.log(`[one-funding application] Lead ${lead.id} — ${firstName} ${lastName}`);
  return NextResponse.json({ ok: true, leadId: lead.id, failed });
}
