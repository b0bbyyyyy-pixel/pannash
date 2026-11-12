'use client';

import { useMemo, useState, type ReactNode } from 'react';
import ApplicationCard from '@/components/merchantPortal/ApplicationCard';
import ApplicationDetails from '@/components/merchantPortal/ApplicationDetails';
import ContactActions from '@/components/merchantPortal/ContactActions';
import { UploadNeedRow, UploadedFileRow, type PortalFile } from '@/components/merchantPortal/DocumentRow';
import {
  DesktopSidebar,
  DesktopTopNav,
  MobileBottomNav,
  MobileHeader,
  type PortalScreen,
} from '@/components/merchantPortal/MerchantChrome';
import StatusPills from '@/components/merchantPortal/StatusPills';
import {
  IconBars,
  IconBuilding,
  IconCalendar,
  IconChevron,
  IconDocs,
  IconDollar,
  IconHelp,
  IconMail,
} from '@/components/merchantPortal/icons';
import { formatLongDate, formatShortDate, stageCaption } from '@/components/merchantPortal/status';
import type { MerchantStage } from '@/lib/merchantPortal/stages';
import type { PortalNeed } from '@/lib/merchantPortal/mask';

type Offer = { token: string; title: string; createdAt: string };
type Approval = { id: string; amount: string; term: string; frequency: string };

type Props = {
  preview?: boolean;
  brand: { businessName: string; logoUrl: string | null; phone: string; email: string; disclaimer: string };
  application: {
    id?: string;
    product?: string;
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
  files: PortalFile[];
  offers: Offer[];
  approvals?: Approval[];
};

async function logContact(channel: string) {
  await fetch('/api/merchant/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel }),
  }).catch(() => {});
}

function DetailLine({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[#e5e5e5] px-5 py-4 last:border-b-0">
      <span className="flex items-center gap-3 text-sm text-[#3d3d3d]">
        {icon}
        {label}
      </span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

export default function MerchantPortalClient(props: Props) {
  const preview = !!props.preview;
  const [screen, setScreen] = useState<PortalScreen>('dashboard');
  const [needs, setNeeds] = useState(props.needs);
  const [files, setFiles] = useState(props.files);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const brandName = props.brand.businessName || 'Application portal';
  const submittedShort = useMemo(() => formatShortDate(props.application.submitted), [props.application.submitted]);
  const submittedLong = useMemo(() => formatLongDate(props.application.submitted), [props.application.submitted]);
  const useSidebar = screen !== 'dashboard';

  async function upload(need: PortalNeed, file: File) {
    if (preview) return;
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
      if (json.file?.name) setFiles(prev => [{ name: json.file.name, at: json.file.at, size: file.size }, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(null);
    }
  }

  function onContact(channel: 'call' | 'text' | 'email') {
    if (!preview) void logContact(channel);
  }

  async function signOut() {
    if (preview) return;
    await fetch('/api/merchant/logout', { method: 'POST' }).catch(() => {});
    window.location.href = '/merchant/login';
  }

  const outstandingNeeds = needs.filter(need => !need.done);

  const needsBlock = (
    <section className="overflow-hidden rounded-xl border border-[#e5e5e5] bg-white shadow-[0_1px_2px_rgba(17,17,19,0.04)]">
      <div className="px-4 pt-4 pb-4">
        <h2 className="text-[17px] font-semibold">What we need from you</h2>
        {outstandingNeeds.length === 0 ? (
          <p className="mt-1 text-sm text-[#6b6b6b]">
            Nothing at this time. Check back here for any updates.
          </p>
        ) : (
          <p className="mt-1 text-sm text-[#6b6b6b]">
            Please upload the requested document so we can continue reviewing your request.
          </p>
        )}
      </div>
      {outstandingNeeds.length > 0 && (
        <div className="mx-4 mb-4 divide-y divide-[#e5e5e5] overflow-hidden rounded-xl border border-[#e5e5e5]">
          {outstandingNeeds.map(need => (
            <UploadNeedRow
              key={need.id}
              need={need}
              uploading={uploading === need.id}
              disabled={preview}
              onFile={file => void upload(need, file)}
            />
          ))}
        </div>
      )}
      {error && <p className="px-4 pb-4 text-xs text-red-600">{error}</p>}
    </section>
  );

  const uploadedBlock = files.length > 0 ? (
    <section className="overflow-hidden rounded-xl border border-[#e5e5e5] bg-white shadow-[0_1px_2px_rgba(17,17,19,0.04)]">
      <div className="px-4 pt-4">
        <h2 className="text-[17px] font-semibold">Your documents</h2>
        <p className="mt-1 text-sm text-[#6b6b6b]">Files already on this application.</p>
      </div>
      <div className="mx-4 my-4 divide-y divide-[#e5e5e5] overflow-hidden rounded-xl border border-[#e5e5e5]">
        {files.map(file => (
          <UploadedFileRow key={`${file.name}-${file.at}`} file={file} />
        ))}
      </div>
    </section>
  ) : null;

  const summaryBlock = (
    <section className="overflow-hidden rounded-xl border border-[#e5e5e5] bg-white shadow-[0_1px_2px_rgba(17,17,19,0.04)]">
      <h2 className="px-5 pt-4 text-[17px] font-semibold">Your Request Summary</h2>
      <div className="mt-2">
        <DetailLine icon={<IconCalendar className="h-4 w-4" />} label="Submitted on" value={submittedShort} />
        <DetailLine icon={<IconDollar className="h-4 w-4" />} label="Requested amount" value={props.application.amount} />
        <DetailLine icon={<IconBars className="h-4 w-4" />} label="Funding purpose" value={props.application.useOfFunds} />
      </div>
    </section>
  );

  const questionBar = (
    <button
      type="button"
      onClick={() => setScreen('messages')}
      className="flex w-full items-center justify-between rounded-xl bg-[#111113] px-4 py-3.5 text-left text-white"
    >
      <span className="flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/30">
          <IconHelp className="h-4 w-4" />
        </span>
        <span>
          <span className="block text-sm font-semibold">Have a question?</span>
          <span className="block text-xs text-white/70">Contact our support team for assistance.</span>
        </span>
      </span>
      <IconChevron className="h-4 w-4" />
    </button>
  );

  const approvals = props.approvals || [];
  const approvalsBlock = (
    <section className="rounded-xl border border-[#e5e5e5] bg-white p-5 shadow-[0_1px_2px_rgba(17,17,19,0.04)]">
      <h2 className="text-[17px] font-semibold">Approvals</h2>
      <p className="mt-2 text-sm text-[#6b6b6b]">{props.brand.disclaimer}</p>
      {approvals.length === 0 && props.offers.length === 0 ? (
        <p className="mt-3 text-sm text-[#6b6b6b]">
          Nothing here yet. When an approval is ready, it will show up on this tab.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {approvals.map(offer => (
            <li key={offer.id} className="rounded-xl border border-[#e5e5e5] px-4 py-3">
              <p className="text-lg font-semibold tracking-tight">{offer.amount}</p>
              {(offer.term || offer.frequency) && (
                <p className="mt-1 text-sm text-[#6b6b6b]">
                  {[offer.term, offer.frequency && !offer.term ? offer.frequency : ''].filter(Boolean).join(' · ')}
                </p>
              )}
            </li>
          ))}
          {props.offers.map(offer => (
            <li key={offer.token} className="flex items-center justify-between gap-3 rounded-xl border border-[#e5e5e5] px-4 py-3">
              <div>
                <p className="text-sm font-medium">{offer.title}</p>
                <p className="text-xs text-[#8a8a8a]">{formatShortDate(offer.createdAt)}</p>
              </div>
              <a
                href={`/portal/${offer.token}`}
                target="_blank"
                rel="noreferrer"
                onClick={() => {
                  if (preview) return;
                  void fetch('/api/merchant/offer-click', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title: offer.title }),
                  });
                }}
                className="rounded-lg bg-[#111113] px-3 py-1.5 text-xs font-medium text-white"
              >
                View offer
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  const dashboard = (
    <>
      <div className="hidden md:block">
        <h1 className="text-[36px] font-semibold tracking-tight">Welcome back</h1>
        <p className="mt-1 text-sm text-[#6b6b6b]">Here&apos;s the status of your funding application.</p>
        <div className="mt-8 space-y-4">
          <ApplicationCard
            stage={props.stage}
            amount={props.application.amount}
            useOfFunds={props.application.useOfFunds}
          />
          <section className="overflow-hidden rounded-xl border border-[#e5e5e5] bg-white shadow-[0_1px_2px_rgba(17,17,19,0.04)]">
            <DetailLine icon={<IconBuilding className="h-4 w-4" />} label="Business name" value={props.application.legalName || props.application.dba} />
            <DetailLine icon={<IconDocs className="h-4 w-4" />} label="Tax ID (EIN)" value={props.application.ein} />
            <DetailLine icon={<IconMail className="h-4 w-4" />} label="Contact email" value={props.application.email} />
            <DetailLine icon={<IconCalendar className="h-4 w-4" />} label="Submitted on" value={submittedLong} />
          </section>
        </div>
      </div>
      <div className="md:hidden">
        <h1 className="text-[28px] font-semibold tracking-tight">{props.application.legalName || props.application.dba || 'Your application'}</h1>
        <p className="mt-1 text-sm text-[#6b6b6b]">Welcome back. Here&apos;s the status of your funding request.</p>
        <div className="mt-5 border-t border-[#e5e5e5] pt-5">
          <h2 className="text-sm font-semibold">Status</h2>
          <div className="mt-3">
            <StatusPills stage={props.stage} />
          </div>
        </div>
        <div className="mt-5 space-y-4">
          {needsBlock}
          {summaryBlock}
          {questionBar}
        </div>
      </div>
    </>
  );

  const body = (() => {
    if (screen === 'dashboard') return dashboard;
    if (screen === 'applications') {
      return (
        <div>
          <ApplicationDetails
            application={{
              id: props.application.id,
              product: props.application.product,
              legalName: props.application.legalName,
              phone: props.application.phone,
              address: props.application.address,
              amount: props.application.amount,
              useOfFunds: props.application.useOfFunds,
              submitted: props.application.submitted,
            }}
            stage={props.stage}
            updatedAt={props.updatedAt}
            onBack={() => setScreen('dashboard')}
          />
          <div className="mt-8">
            <ContactActions phone={props.brand.phone} email={props.brand.email} onContact={onContact} />
          </div>
        </div>
      );
    }
    if (screen === 'documents') {
      return (
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight md:text-[32px]">Documents</h1>
          <p className="mt-1 text-sm text-[#6b6b6b]">Requested files and everything already uploaded.</p>
          <div className="mt-6 space-y-4">
            {needsBlock}
            {uploadedBlock || (
              <p className="text-sm text-[#6b6b6b]">No files have been uploaded yet.</p>
            )}
          </div>
        </div>
      );
    }
    if (screen === 'approvals') {
      return (
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight md:text-[32px]">Approvals</h1>
          <p className="mt-1 text-sm text-[#6b6b6b]">{stageCaption(props.stage)}</p>
          <div className="mt-6 space-y-4">
            <div className="rounded-xl border border-[#e5e5e5] bg-white p-5 shadow-[0_1px_2px_rgba(17,17,19,0.04)]">
              <h2 className="text-sm font-semibold">Status</h2>
              <div className="mt-3"><StatusPills stage={props.stage} /></div>
            </div>
            {approvalsBlock}
          </div>
        </div>
      );
    }
    if (screen === 'messages') {
      return (
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight md:text-[32px]">Messages</h1>
          <p className="mt-1 text-sm text-[#6b6b6b]">Reach the team working on your file.</p>
          <div className="mt-6 rounded-xl border border-[#e5e5e5] bg-white p-5 shadow-[0_1px_2px_rgba(17,17,19,0.04)]">
            <ContactActions phone={props.brand.phone} email={props.brand.email} onContact={onContact} />
            <p className="mt-4 text-xs leading-relaxed text-[#6b6b6b]">{props.brand.disclaimer}</p>
          </div>
        </div>
      );
    }
    return (
      <div>
        <h1 className="text-[28px] font-semibold tracking-tight md:text-[32px]">Profile</h1>
        <p className="mt-1 text-sm text-[#6b6b6b]">Details on file for this application.</p>
        <section className="mt-6 overflow-hidden rounded-xl border border-[#e5e5e5] bg-white shadow-[0_1px_2px_rgba(17,17,19,0.04)]">
          <DetailLine icon={<IconBuilding className="h-4 w-4" />} label="Business name" value={props.application.legalName || props.application.dba} />
          <DetailLine icon={<IconMail className="h-4 w-4" />} label="Email" value={props.application.email} />
          <DetailLine icon={<IconCalendar className="h-4 w-4" />} label="Submitted on" value={submittedLong} />
        </section>
        <p className="mt-6 text-xs leading-relaxed text-[#6b6b6b]">{props.brand.disclaimer}</p>
      </div>
    );
  })();

  return (
    <div className={`${preview ? 'min-h-full' : 'min-h-screen'} bg-white text-[#111113]`}>
      {!useSidebar && (
        <DesktopTopNav
          brandName={brandName}
          logoUrl={props.brand.logoUrl}
          screen={screen}
          onScreen={setScreen}
          onSignOut={() => void signOut()}
        />
      )}
      <MobileHeader
        brandName={brandName}
        logoUrl={props.brand.logoUrl}
        onScreen={setScreen}
        onSignOut={() => void signOut()}
      />
      <div className={useSidebar ? 'md:flex md:min-h-screen' : ''}>
        {useSidebar && (
          <DesktopSidebar
            brandName={brandName}
            logoUrl={props.brand.logoUrl}
            screen={screen}
            onScreen={setScreen}
            onSignOut={() => void signOut()}
          />
        )}
        <main className={`flex-1 px-4 py-6 md:px-10 md:py-8 ${!useSidebar ? 'mx-auto max-w-6xl' : 'max-w-5xl'}`}>
          {body}
        </main>
      </div>
      <MobileBottomNav screen={screen} onScreen={setScreen} />
    </div>
  );
}
