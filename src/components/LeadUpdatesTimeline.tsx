function fmtDate(d: string | null | undefined) {
  return d
    ? new Date(d).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';
}

export default function LeadUpdatesTimeline({
  createdAt,
  lastContact,
}: {
  createdAt?: string | null;
  lastContact?: string | null;
}) {
  return (
    <div className="space-y-2">
      {createdAt && (
        <div className="flex gap-2">
          <div className="w-1 h-1 rounded-full bg-[#d4d4d4] mt-1.5 flex-shrink-0" />
          <div>
            <p className="text-[11px] text-[#1a1a1a]">Lead created</p>
            <p className="text-[10px] text-[#9b9b9b]">{fmtDate(createdAt)}</p>
          </div>
        </div>
      )}
      {lastContact && (
        <div className="flex gap-2">
          <div className="w-1 h-1 rounded-full bg-[#d4d4d4] mt-1.5 flex-shrink-0" />
          <div>
            <p className="text-[11px] text-[#1a1a1a]">Last contact logged</p>
            <p className="text-[10px] text-[#9b9b9b]">{fmtDate(lastContact)}</p>
          </div>
        </div>
      )}
    </div>
  );
}
