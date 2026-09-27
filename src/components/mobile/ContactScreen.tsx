'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { fmtPhone, initial, weekdayLabel } from '@/components/mobile/format';

type Contact = {
  id: string;
  name: string;
  business: string;
  phone: string;
  email: string;
  stage: string;
  status: string;
  lastIn: string | null;
  lastOut: string | null;
  crmUrl: string;
};

export default function ContactScreen() {
  const { threadId } = useParams<{ threadId: string }>();
  const router = useRouter();
  const [contact, setContact] = useState<Contact | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/m/threads/${threadId}/contact`)
      .then(r => r.json())
      .then(d => {
        if (d.contact) setContact(d.contact);
        else setError(d.error || 'Not found');
      })
      .catch(() => setError('Not found'));
  }, [threadId]);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#F2F2F7]">
      <header className="flex items-center px-2 pt-[max(8px,env(safe-area-inset-top))] pb-2">
        <button type="button" onClick={() => router.push(`/m/text/${threadId}`)} className="px-1 text-[17px] text-[#007AFF]">
          ‹ Messages
        </button>
      </header>

      {!contact ? (
        <p className="px-4 py-8 text-center text-[15px] text-[#8E8E93]">{error || 'Loading…'}</p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8">
          <div className="flex flex-col items-center pt-4">
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-[#E9E9EB] text-[32px] font-semibold text-[#3a3a3c]">
              {initial(contact.name || contact.business)}
            </span>
            <p className="mt-3 text-center text-[28px] font-bold leading-tight text-black">{contact.name || 'Unknown'}</p>
            {contact.business && <p className="text-[15px] text-[#8E8E93]">{contact.business}</p>}
          </div>

          <div className="mt-6 overflow-hidden rounded-xl bg-white">
            <Row label="Phone" value={contact.phone ? fmtPhone(contact.phone) : '—'} />
            <Row label="Email" value={contact.email || '—'} />
            {(contact.stage || contact.status) && (
              <Row label="Status" value={[contact.stage, contact.status].filter(Boolean).join(' · ')} />
            )}
            <Row label="Last in" value={contact.lastIn ? weekdayLabel(contact.lastIn) : '—'} />
            <Row label="Last out" value={contact.lastOut ? weekdayLabel(contact.lastOut) : '—'} last />
          </div>

          <div className="mt-4 overflow-hidden rounded-xl bg-white">
            <button
              type="button"
              onClick={() => router.push(`/m/text/${threadId}`)}
              className="block w-full border-b border-[#C6C6C8]/70 px-4 py-3 text-left text-[17px] text-[#007AFF]"
            >
              Text
            </button>
            {contact.phone ? (
              <a href={`tel:${contact.phone}`} className="block border-b border-[#C6C6C8]/70 px-4 py-3 text-[17px] text-[#007AFF]">
                Call
              </a>
            ) : null}
            <a href={contact.crmUrl} className="block px-4 py-3 text-[17px] text-[#007AFF]">
              Open full lead in CRM
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 px-4 py-3 ${last ? '' : 'border-b border-[#C6C6C8]/70'}`}>
      <span className="text-[13px] text-[#8E8E93]">{label}</span>
      <span className="truncate text-[17px] text-black">{value}</span>
    </div>
  );
}
