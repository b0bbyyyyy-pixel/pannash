export type UploadUnreadKind = 'application' | 'documents';

function previewFor(kinds: UploadUnreadKind[]) {
  const app = kinds.includes('application');
  const docs = kinds.includes('documents');
  if (app && docs) return 'Application and documents received';
  if (docs) return 'Documents received';
  return 'Application received';
}

function kindColumn(kind: UploadUnreadKind) {
  return kind === 'application' ? 'unseen_application_count' : 'unseen_documents_count';
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
  if (!conv?.id) return;

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
    const fallback = {
      last_message_at: now,
      last_message_preview: preview,
      last_direction: 'inbound',
      unread_count: (Number(conv.unread_count) || 0) + 1,
    };
    await supabase.from('inbox_conversations').update(fallback).eq('id', conv.id);
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

  await supabase
    .from('leads')
    .update({ last_contact: now, in_pipeline: true })
    .eq('id', args.leadId);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function countUploadUnread(supabase: any, userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('inbox_conversations')
    .select('unseen_application_count, unseen_documents_count')
    .eq('user_id', userId);

  if (error || !data) return 0;

  let total = 0;
  for (const row of data as { unseen_application_count?: number; unseen_documents_count?: number }[]) {
    total += Number(row.unseen_application_count) || 0;
    total += Number(row.unseen_documents_count) || 0;
  }
  return total;
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listUploadUnread(supabase: any, userId: string): Promise<UploadUnreadItem[]> {
  const { data, error } = await supabase
    .from('inbox_conversations')
    .select('lead_id, unseen_application_count, unseen_documents_count, last_message_preview, last_message_at')
    .eq('user_id', userId)
    .order('last_message_at', { ascending: false });

  if (error || !data) return [];

  const rows = (data as {
    lead_id: string;
    unseen_application_count?: number;
    unseen_documents_count?: number;
    last_message_preview?: string | null;
    last_message_at?: string | null;
  }[]).filter(r => (Number(r.unseen_application_count) || 0) + (Number(r.unseen_documents_count) || 0) > 0);

  if (!rows.length) return [];

  const ids = [...new Set(rows.map(r => r.lead_id).filter(Boolean))];
  const { data: leads } = await supabase
    .from('leads')
    .select('id, name, company')
    .eq('user_id', userId)
    .in('id', ids);
  const byId = new Map(
    ((leads ?? []) as { id: string; name?: string | null; company?: string | null }[]).map(l => [l.id, l]),
  );

  return rows.map(r => {
    const lead = byId.get(r.lead_id);
    return {
      leadId: r.lead_id,
      name: String(lead?.name || 'Lead').trim() || 'Lead',
      company: lead?.company ? String(lead.company) : null,
      application: Number(r.unseen_application_count) || 0,
      documents: Number(r.unseen_documents_count) || 0,
      preview: r.last_message_preview || null,
      at: r.last_message_at || null,
    };
  });
}

export async function markUploadSeen(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  args: { userId: string; leadId: string; kind: UploadUnreadKind },
) {
  const col = kindColumn(args.kind);
  const { error } = await supabase
    .from('inbox_conversations')
    .update({ [col]: 0 })
    .eq('user_id', args.userId)
    .eq('lead_id', args.leadId);
  if (error && /unseen_/i.test(error.message || '')) return;
}
