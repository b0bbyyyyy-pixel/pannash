'use client';

import { useMemo, useState } from 'react';
import type { MerchantStage } from '@/lib/merchantPortal/stages';
import type { PortalNeed } from '@/lib/merchantPortal/mask';

type Offer = { token: string; title: string; createdAt: string };
type FileRow = { name: string; at: string };

type Props = {
  brand: { businessName: string; logoUrl: string | null; phone: string; email: string; disclaimer: string };
  application: {
    legalName: string;
    dba: string;
    ownerName: string;
    email: string;
    phone: string;
    address: string;
    amount: string;
    useOfFunds: string;
    submitted: string;
    ssn: string;
    ein: string;
  };
  stage: MerchantStage;
  updatedAt: string | null;
  needs: PortalNeed[];
  files: FileRow[];
  offers: Offer[];
};

const STAGES: MerchantStage[] = [
  'Received', 'Reviewing', 'Docs needed', 'Submitted to partners',
  'Offers ready', 'Finalizing', 'Funded', 'Closed',
];

function telHref(phone: string) {
  const d = phone.replace(/\D/g, '');
  if (!d) return '';
  return d.length === 10 ? `tel:+1${d}` : `tel:+${d}`;
}

function smsHref(phone: string) {
  const d = phone.replace(/\D/g, '');
  if (!d) return '';
  return d.length === 10 ? `sms:+1${d}` : `sms:+${d}`;
}

async function logContact(channel: string) {
  await fetch('/api/merchant/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel }),
  }).catch(() => {});
}

export default function MerchantPortalClient(props: Props) {
  const [needs, setNeeds] = useState(props.needs);
  const [files, setFiles] = useState(props.files);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const stageIndex = Math.max(0, STAGES.indexOf(props.stage));
  const visibleStages = props.stage === 'Closed'
    ? STAGES
    : STAGES.filter(s => s !== 'Closed');

  const submitted = useMemo(() => {
    if (!props.application.submitted) return '';
    const d = new Date(props.application.submitted);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }, [props.application.submitted]);

  const updated = useMemo(() => {
    if (!props.updatedAt) return '';
    const d = new Date(props.updatedAt);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }, [props.updatedAt]);

  async function upload(need: PortalNeed, file: File) {
    setError('');
    setUploading(need.id);
    try {
      const sign = await fetch('/api/merchant/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
          needId: need.id,
        }),
      });
      const signed = await sign.json().catch(() => ({}));
      if (!sign.ok) throw new Error(signed.error || 'Could not start upload');
      const put = await fetch(signed.signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });
      if (!put.ok) throw new Error('Storage rejected the file');
      const done = await fetch('/api/merchant/upload-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: signed.path,
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
          needId: need.id,
        }),
      });
      const json = await done.json().catch(() => ({}));
      if (!done.ok) throw new Error(json.error || 'Could not save file');
      if (Array.isArray(json.needs)) setNeeds(json.needs);
      if (json.file?.name) setFiles(prev => [{ name: json.file.name, at: json.file.at }, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#fdfdfd] text-[#1a1a1a]">
      <header className="border-b border-[#e5e5e5] bg-white">
        <div className="mx-auto flex max-w-2xl flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            {props.brand.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={props.brand.logoUrl} alt="" className="h-8 max-w-[140px] object-contain" />
            ) : null}
            <p className="text-base font-semibold">{props.brand.businessName || 'Application portal'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {props.brand.phone && (
              <a
                href={telHref(props.brand.phone)}
                onClick={() => void logContact('call')}
                className="rounded-lg border border-[#e5e5e5] px-3 py-1.5 text-sm hover:bg-[#f5f5f5]"
              >
                Call
              </a>
            )}
            {props.brand.phone && (
              <a
                href={smsHref(props.brand.phone)}
                onClick={() => void logContact('text')}
                className="rounded-lg border border-[#e5e5e5] px-3 py-1.5 text-sm hover:bg-[#f5f5f5]"
              >
                Text
              </a>
            )}
            {props.brand.email && (
              <a
                href={`mailto:${props.brand.email}`}
                onClick={() => void logContact('email')}
                className="rounded-lg border border-[#e5e5e5] px-3 py-1.5 text-sm hover:bg-[#f5f5f5]"
              >
                Email
              </a>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-6 px-5 py-8">
        <section className="rounded-xl border border-[#e5e5e5] bg-white p-5">
          <h2 className="text-sm font-semibold">Your application</h2>
          <dl className="mt-3 grid gap-2 text-sm">
            <Row label="Legal name" value={props.application.legalName} />
            <Row label="DBA" value={props.application.dba} />
            <Row label="Owner" value={props.application.ownerName} />
            <Row label="Email" value={props.application.email} />
            <Row label="Phone" value={props.application.phone} />
            <Row label="Business address" value={props.application.address} />
            <Row label="Amount requested" value={props.application.amount} />
            <Row label="Use of funds" value={props.application.useOfFunds} />
            <Row label="Submitted" value={submitted} />
            {props.application.ssn && <Row label="SSN" value={props.application.ssn} />}
            {props.application.ein && <Row label="EIN" value={props.application.ein} />}
          </dl>
          <p className="mt-4 text-xs text-[#6b6b6b]">Need to change something? Contact us.</p>
        </section>

        <section className="rounded-xl border border-[#e5e5e5] bg-white p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold">Status</h2>
            {updated && <p className="text-xs text-[#9ca3af]">Updated {updated}</p>}
          </div>
          <ol className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {visibleStages.map((name, i) => {
              const active = name === props.stage;
              const done = i < stageIndex && props.stage !== 'Closed';
              return (
                <li
                  key={name}
                  className={`rounded-full px-3 py-1 text-xs ${
                    active
                      ? 'bg-[#1a1a1a] text-white'
                      : done
                        ? 'bg-[#f5f5f5] text-[#1a1a1a]'
                        : 'border border-[#e5e5e5] text-[#9ca3af]'
                  }`}
                >
                  {name}
                </li>
              );
            })}
          </ol>
          {props.stage === 'Closed' && (
            <p className="mt-3 text-sm text-[#6b6b6b]">
              We weren&apos;t able to find a match right now. Contact us to talk about options.
            </p>
          )}
        </section>

        <section className="rounded-xl border border-[#e5e5e5] bg-white p-5">
          <h2 className="text-sm font-semibold">What we need from you</h2>
          <ul className="mt-3 space-y-3">
            {needs.map(need => (
              <li key={need.id} className="flex items-center justify-between gap-3 rounded-lg border border-[#e5e5e5] px-3 py-2">
                <div>
                  <p className="text-sm">{need.label}</p>
                  {need.done && <p className="text-xs text-[#6b6b6b]">Received</p>}
                </div>
                <label className="cursor-pointer rounded-lg border border-[#e5e5e5] px-3 py-1.5 text-xs font-medium hover:bg-[#f5f5f5]">
                  {uploading === need.id ? 'Uploading…' : 'Upload'}
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.heic,.heif,application/pdf,image/jpeg,image/png,image/heic,image/heif"
                    className="hidden"
                    disabled={uploading === need.id}
                    onChange={e => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (file) void upload(need, file);
                    }}
                  />
                </label>
              </li>
            ))}
          </ul>
          {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
          {files.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium text-[#6b6b6b]">Files you uploaded</p>
              <ul className="mt-1 space-y-1 text-sm">
                {files.map(file => (
                  <li key={`${file.name}-${file.at}`} className="text-[#1a1a1a]">
                    {file.name}
                    <span className="ml-2 text-xs text-[#9ca3af]">
                      {file.at ? new Date(file.at).toLocaleDateString() : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-[#e5e5e5] bg-white p-5">
          <h2 className="text-sm font-semibold">Offers</h2>
          <p className="mt-2 text-sm text-[#6b6b6b]">
            Compare offers side by side and pick the one that fits. {props.brand.disclaimer}
          </p>
          {props.offers.length === 0 ? (
            <p className="mt-3 text-sm text-[#6b6b6b]">
              When funding partners send offers, they&apos;ll show here. We&apos;ll text or email you.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {props.offers.map(offer => (
                <li key={offer.token} className="flex items-center justify-between gap-3 rounded-lg border border-[#e5e5e5] px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">{offer.title}</p>
                    <p className="text-xs text-[#9ca3af]">
                      {offer.createdAt ? new Date(offer.createdAt).toLocaleDateString() : ''}
                    </p>
                  </div>
                  <a
                    href={`/portal/${offer.token}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => {
                      void fetch('/api/merchant/offer-click', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ title: offer.title }),
                      });
                    }}
                    className="rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-xs font-medium text-white"
                  >
                    View offer
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <footer className="mx-auto max-w-2xl px-5 pb-10 text-xs leading-relaxed text-[#6b6b6b]">
        <p>{props.brand.disclaimer}</p>
        <p className="mt-2">
          {props.brand.businessName}
          {props.brand.phone ? ` · ${props.brand.phone}` : ''}
          {props.brand.email ? ` · ${props.brand.email}` : ''}
        </p>
        <p className="mt-2">This page is private to you.</p>
      </footer>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-[#6b6b6b]">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
