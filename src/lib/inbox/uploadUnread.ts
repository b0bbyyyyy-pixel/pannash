export type UploadUnreadKind = 'application' | 'documents';

export type UnseenUploads = {
  application: number;
  documents: number;
};

const UPLOAD_PREVIEW_RE = /^(application and documents received|documents received|application received)\b/i;

function previewFor(kinds: UploadUnreadKind[]) {
  const app = kinds.includes('application');
  const docs = kinds.includes('documents');
  if (app && docs) return 'Application and documents received';
  if (docs) return 'Documents received';
  return 'Application received';
}

export function isUploadPreview(preview: string | null | undefined) {
  return UPLOAD_PREVIEW_RE.test(String(preview ?? '').trim());
}

export function readUnseenUploads(ud: unknown): UnseenUploads {
  const rec = ud && typeof ud === 'object' ? ud as Record<string, unknown> : {};
  const raw = rec.unseenUploads;
  const o = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  return {
    application: Math.max(0, Number(o.application) || 0),
    documents: Math.max(0, Number(o.documents) || 0),
  };
}

export function unseenUploadsCleared(ud: unknown) {
  const rec = ud && typeof ud === 'object' ? ud as Record<string, unknown> : {};
  return typeof rec.uploadUnreadClearedAt === 'string' && rec.uploadUnreadClearedAt.length > 0;
}

export function uploadUnreadStillOpen(ud: unknown, signalAt?: string | null) {
  const rec = ud && typeof ud === 'object' ? ud as Record<string, unknown> : {};
  const counts = readUnseenUploads(ud);
  const hasCounts = counts.application + counts.documents > 0;
  const clearedAt = typeof rec.uploadUnreadClearedAt === 'string' ? rec.uploadUnreadClearedAt : '';
  if (!clearedAt) return hasCounts;
  const uploadedAt = typeof rec.unseenUploadAt === 'string' ? rec.unseenUploadAt : (signalAt || '');
  return hasCounts && Boolean(uploadedAt && uploadedAt > clearedAt);
}

export function mergeUnseenUploads(a: UnseenUploads, b: UnseenUploads): UnseenUploads {
  return {
    application: Math.max(a.application, b.application),
    documents: Math.max(a.documents, b.documents),
  };
}

function kindColumn(kind: UploadUnreadKind) {
  return kind === 'application' ? 'unseen_application_count' : 'unseen_documents_count';
}

function asUd(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' ? { ...(raw as Record<string, unknown>) } : {};
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function bumpLeadUnseen(
  supabase: any,
  leadId: string,
  kinds: UploadUnreadKind[],
  now: string,
) {
  const { data: lead } = await supabase
    .from('leads')
    .select('underwriting_data')
    .eq('id', leadId)
    .maybeSingle();
  const ud = asUd(lead?.underwriting_data);
  const cur = readUnseenUploads(ud);
  for (const kind of kinds) cur[kind] += 1;
  ud.unseenUploads = cur;
  ud.unseenUploadAt = now;
  ud.docsFromOutside = true;
  delete ud.uploadUnreadClearedAt;
  await supabase
    .from('leads')
    .update({ underwriting_data: ud, last_contact: now, in_pipeline: true })
    .eq('id', leadId);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getOrCreateConv(supabase: any, userId: string, leadId: string) {
  const full = await supabase
    .from('inbox_conversations')
    .select('id, unread_count, unseen_application_count, unseen_documents_count')
    .eq('user_id', userId)
    .eq('lead_id', leadId)
    .maybeSingle();
  if (full.data?.id) return full.data as {
    id: string;
    unread_count?: number;
    unseen_application_count?: number;
    unseen_documents_count?: number;
  };

  const slim = await supabase
    .from('inbox_conversations')
    .select('id, unread_count')
    .eq('user_id', userId)
    .eq('lead_id', leadId)
    .maybeSingle();
  if (slim.data?.id) return slim.data as { id: string; unread_count?: number };

  const { data: created } = await supabase
    .from('inbox_conversations')
    .insert({ user_id: userId, lead_id: leadId, unread_count: 0 })
    .select('id, unread_count')
    .single();
  return (created ?? null) as { id: string; unread_count?: number } | null;
}

/** Lead uploaded an application / documents → unread inbox thread at the top. */
export async function notifyLeadUpload(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  args: {
    userId: string;
    leadId: string;
    kinds: UploadUnreadKind[];
    preview?: string;
  },
) {
  const kinds = [...new Set(args.kinds)];
  if (!kinds.length) return;
  const now = new Date().toISOString();
  const preview = (args.preview || previewFor(kinds)).slice(0, 100);

  const conv = await getOrCreateConv(supabase, args.userId, args.leadId);
  if (conv?.id) {
    const patch: Record<string, unknown> = {
      last_message_at: now,
      last_inbound_at: now,
      last_message_preview: preview,
      last_direction: 'inbound',
      unread_count: (Number(conv.unread_count) || 0) + 1,
    };
    for (const kind of kinds) {
      const col = kindColumn(kind);
      patch[col] = (Number((conv as Record<string, unknown>)[col]) || 0) + 1;
    }

    const { error } = await supabase.from('inbox_conversations').update(patch).eq('id', conv.id);
    if (error) {
      await supabase.from('inbox_conversations').update({
        last_message_at: now,
        last_message_preview: preview,
        last_direction: 'inbound',
        unread_count: (Number(conv.unread_count) || 0) + 1,
      }).eq('id', conv.id);
    }

    try {
      await supabase.from('inbox_messages').insert({
        conversation_id: conv.id,
        lead_id: args.leadId,
        direction: 'inbound',
        body: preview,
        status: 'received',
        sent_by: 'system',
      });
    } catch {
      /* ignore */
    }
  }

  try {
    await bumpLeadUnseen(supabase, args.leadId, kinds, now);
  } catch {
    await supabase
      .from('leads')
      .update({ last_contact: now, in_pipeline: true })
      .eq('id', args.leadId);
  }

  try {
    const { maybeMarkDocsIn } = await import('@/lib/leads/markDocsIn');
    await maybeMarkDocsIn(supabase, {
      leadId: args.leadId,
      userId: args.userId,
      fromOutside: true,
    });
  } catch {
    /* status update is best-effort */
  }
}

export type UploadUnreadItem = {
  leadId: string;
  name: string;
  company: string | null;
  application: number;
  documents: number;
  preview: string | null;
  at: string | null;
};

const RECENT_UPLOAD_MS = 36 * 60 * 60 * 1000;

function unseenFromPreview(preview: string | null | undefined): UnseenUploads {
  if (!isUploadPreview(preview)) return { application: 0, documents: 0 };
  const text = String(preview);
  return {
    application: /application/i.test(text) ? 1 : 0,
    documents: /documents? received/i.test(text) ? 1 : 0,
  };
}

function isRecentIso(iso: string | null | undefined, now: number) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && now - t <= RECENT_UPLOAD_MS;
}

type ConvRow = {
  lead_id: string;
  unseen_application_count?: number;
  unseen_documents_count?: number;
  last_message_preview?: string | null;
  last_message_at?: string | null;
};

type UnseenRow = {
  fromFlag: UnseenUploads;
  preview: string | null;
  at: string | null;
};

function putUnseen(
  into: Map<string, UnseenRow>,
  leadId: string,
  add: UnseenUploads,
  preview: string | null,
  at: string | null,
) {
  if (!leadId || add.application + add.documents <= 0) return;
  const prev = into.get(leadId);
  into.set(leadId, {
    fromFlag: mergeUnseenUploads(prev?.fromFlag ?? { application: 0, documents: 0 }, add),
    preview: prev?.preview || preview,
    at: at && (!prev?.at || at > prev.at) ? at : (prev?.at ?? at),
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listUploadUnread(supabase: any, userId: string): Promise<UploadUnreadItem[]> {
  const now = Date.now();
  const since = new Date(now - RECENT_UPLOAD_MS).toISOString();
  const byLead = new Map<string, UnseenRow>();
  const leadById = new Map<string, {
    id: string;
    name?: string | null;
    company?: string | null;
    underwriting_data?: unknown;
  }>();

  const leadFull = await supabase
    .from('leads')
    .select('id, name, company, underwriting_data, last_contact')
    .eq('user_id', userId)
    .gte('last_contact', since)
    .order('last_contact', { ascending: false })
    .limit(200);
  const recentLeads = (leadFull.error ? [] : (leadFull.data ?? [])) as {
    id: string;
    name?: string | null;
    company?: string | null;
    underwriting_data?: unknown;
    last_contact?: string | null;
  }[];
  for (const lead of recentLeads) {
    leadById.set(lead.id, lead);
    const udUnseen = readUnseenUploads(lead.underwriting_data);
    if (!uploadUnreadStillOpen(lead.underwriting_data, lead.last_contact)) continue;
    putUnseen(
      byLead,
      lead.id,
      udUnseen,
      previewFor([
        ...(udUnseen.application ? ['application' as const] : []),
        ...(udUnseen.documents ? ['documents' as const] : []),
      ]),
      lead.last_contact || null,
    );
  }

  const full = await supabase
    .from('inbox_conversations')
    .select('lead_id, unseen_application_count, unseen_documents_count, last_message_preview, last_message_at')
    .eq('user_id', userId)
    .order('last_message_at', { ascending: false })
    .limit(500);
  const convs: ConvRow[] = full.error
    ? ((await supabase
        .from('inbox_conversations')
        .select('lead_id, last_message_preview, last_message_at')
        .eq('user_id', userId)
        .order('last_message_at', { ascending: false })
        .limit(500)).data ?? [])
    : (full.data ?? []);

  for (const row of convs as ConvRow[]) {
    if (!row.lead_id || !isRecentIso(row.last_message_at, now)) continue;
    const fromPreview = unseenFromPreview(row.last_message_preview);
    if (fromPreview.application + fromPreview.documents <= 0) continue;
    const fromCols: UnseenUploads = {
      application: fromPreview.application ? (Number(row.unseen_application_count) || fromPreview.application) : 0,
      documents: fromPreview.documents ? (Number(row.unseen_documents_count) || fromPreview.documents) : 0,
    };
    putUnseen(byLead, row.lead_id, mergeUnseenUploads(fromCols, fromPreview), row.last_message_preview || null, row.last_message_at || null);
  }

  const msgs = await supabase
    .from('inbox_messages')
    .select('lead_id, body, created_at')
    .eq('sent_by', 'system')
    .gte('created_at', since)
    .limit(100);
  for (const row of msgs.error ? [] : (msgs.data ?? [])) {
    putUnseen(
      byLead,
      String(row.lead_id || ''),
      unseenFromPreview(row.body),
      row.body || null,
      row.created_at || null,
    );
  }

  const missing = [...byLead.keys()].filter(id => !leadById.has(id));
  if (missing.length) {
    const extraFull = await supabase
      .from('leads')
      .select('id, name, company, underwriting_data')
      .eq('user_id', userId)
      .in('id', missing);
    const extra = extraFull.error
      ? await supabase.from('leads').select('id, name, company').eq('user_id', userId).in('id', missing)
      : extraFull;
    for (const lead of (extra.data ?? []) as { id: string; name?: string | null; company?: string | null; underwriting_data?: unknown }[]) {
      leadById.set(lead.id, lead);
    }
  }

  const items: UploadUnreadItem[] = [];
  for (const [leadId, row] of byLead) {
    const lead = leadById.get(leadId);
    const udUnseen = readUnseenUploads(lead?.underwriting_data);
    const unseen = mergeUnseenUploads(row.fromFlag, udUnseen);
    if (unseen.application + unseen.documents <= 0) continue;
    const rec = lead?.underwriting_data && typeof lead.underwriting_data === 'object'
      ? lead.underwriting_data as Record<string, unknown>
      : {};
    const clearedAt = typeof rec.uploadUnreadClearedAt === 'string' ? rec.uploadUnreadClearedAt : '';
    const uploadedAt = typeof rec.unseenUploadAt === 'string' ? rec.unseenUploadAt : row.at;
    if (clearedAt && (!uploadedAt || uploadedAt <= clearedAt)) continue;
    items.push({
      leadId,
      name: String(lead?.name || 'Lead').trim() || 'Lead',
      company: lead?.company ? String(lead.company) : null,
      application: unseen.application,
      documents: unseen.documents,
      preview: row.preview,
      at: row.at,
    });
  }

  items.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  return items;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function countUploadUnread(supabase: any, userId: string): Promise<number> {
  const items = await listUploadUnread(supabase, userId);
  return items.length;
}

export async function markUploadSeen(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  args: { userId: string; leadId: string; kind?: UploadUnreadKind | 'all' },
) {
  const { error } = await supabase
    .from('inbox_conversations')
    .update({ unseen_application_count: 0, unseen_documents_count: 0 })
    .eq('user_id', args.userId)
    .eq('lead_id', args.leadId);
  if (error) {
    for (const kind of ['application', 'documents'] as UploadUnreadKind[]) {
      await supabase
        .from('inbox_conversations')
        .update({ [kindColumn(kind)]: 0 })
        .eq('user_id', args.userId)
        .eq('lead_id', args.leadId);
    }
  }

  const { data: lead } = await supabase
    .from('leads')
    .select('underwriting_data')
    .eq('id', args.leadId)
    .eq('user_id', args.userId)
    .maybeSingle();
  const ud = asUd(lead?.underwriting_data);
  delete ud.unseenUploads;
  ud.uploadUnreadClearedAt = new Date().toISOString();
  await supabase.from('leads').update({ underwriting_data: ud }).eq('id', args.leadId).eq('user_id', args.userId);
}
