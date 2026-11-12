import type { ReactNode } from 'react';
import type { MerchantStage } from '@/lib/merchantPortal/stages';
import {
  IconBriefcase,
  IconBuilding,
  IconCalendar,
  IconDollar,
  IconPhone,
  IconPin,
  IconUser,
} from './icons';
import { formatLongDate, stageLabel } from './status';

type Application = {
  id?: string;
  product?: string;
  legalName: string;
  phone: string;
  address: string;
  amount: string;
  useOfFunds: string;
  submitted: string;
};

function Field({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 py-5">
      <span className="mt-0.5 text-[#111113]">{icon}</span>
      <div>
        <p className="text-sm font-semibold">{label}</p>
        <p className="mt-1 whitespace-pre-line text-sm text-[#3d3d3d]">{value || '—'}</p>
      </div>
    </div>
  );
}

export default function ApplicationDetails({
  application,
  stage,
  updatedAt,
  onBack,
}: {
  application: Application;
  stage: MerchantStage;
  updatedAt: string | null;
  onBack: () => void;
}) {
  const updated = formatLongDate(updatedAt || application.submitted);
  const submitted = formatLongDate(application.submitted);
  const address = application.address.replace(/, /g, '\n');

  return (
    <div>
      <p className="text-[12px] text-[#8a8a8a]">Applications / Application Details</p>
      <div className="mt-3 flex items-start justify-between gap-4">
        <h1 className="text-[32px] font-semibold tracking-tight">Application Details</h1>
        <button
          type="button"
          onClick={onBack}
          className="mt-1 hidden items-center gap-1 text-sm text-[#3d3d3d] hover:text-[#111113] md:inline-flex"
        >
          ← Back to Applications
        </button>
      </div>
      <div className="mt-6 border-t border-[#e5e5e5] pt-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="flex h-16 w-16 items-center justify-center rounded-full border border-[#e5e5e5] text-[#111113]">
              <IconBuilding className="h-7 w-7" />
            </span>
            <div>
              <p className="text-[11px] font-semibold tracking-[0.14em] text-[#6b6b6b] uppercase">
                Application{application.id ? ` #${application.id}` : ''}
              </p>
              <p className="mt-1 text-sm text-[#3d3d3d]">{application.product || application.useOfFunds || 'Funding application'}</p>
            </div>
          </div>
          <div className="sm:text-right">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-[#6b6b6b] uppercase">Status</p>
            <div className="mt-2 flex flex-wrap items-center gap-3 sm:justify-end">
              <span className="rounded-full bg-[#eaf6ee] px-3 py-1 text-xs font-medium text-[#1f7a3f]">
                {stageLabel(stage)}
              </span>
              {updated && <p className="text-sm text-[#6b6b6b]">Updated {updated}</p>}
            </div>
          </div>
        </div>

        <div className="mt-2 grid border-t border-[#e5e5e5] sm:grid-cols-2">
          <div className="border-b border-[#e5e5e5] sm:border-r">
            <Field icon={<IconUser className="h-5 w-5" />} label="Legal name" value={application.legalName} />
          </div>
          <div className="border-b border-[#e5e5e5] sm:pl-8">
            <Field icon={<IconDollar className="h-5 w-5" />} label="Amount requested" value={application.amount} />
          </div>
          <div className="border-b border-[#e5e5e5] sm:border-r">
            <Field icon={<IconPhone className="h-5 w-5" />} label="Phone" value={application.phone} />
          </div>
          <div className="border-b border-[#e5e5e5] sm:pl-8">
            <Field icon={<IconBriefcase className="h-5 w-5" />} label="Use of funds" value={application.useOfFunds} />
          </div>
          <div className="border-b border-[#e5e5e5] sm:border-b-0 sm:border-r">
            <Field icon={<IconPin className="h-5 w-5" />} label="Business address" value={address} />
          </div>
          <div className="sm:pl-8">
            <Field icon={<IconCalendar className="h-5 w-5" />} label="Submitted date" value={submitted} />
          </div>
        </div>
      </div>
    </div>
  );
}
