import type { MerchantStage } from '@/lib/merchantPortal/stages';
import { IconShield, IconTrend, IconWallet } from './icons';
import StatusTracker from './StatusTracker';
import { stageCaption } from './status';

export default function ApplicationCard({
  stage,
  amount,
  useOfFunds,
}: {
  stage: MerchantStage;
  amount: string;
  useOfFunds: string;
}) {
  return (
    <section className="rounded-xl border border-[#e5e5e5] bg-white p-6 shadow-[0_1px_2px_rgba(17,17,19,0.04)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[17px] font-semibold">Application Status</h2>
          <p className="mt-1 text-sm text-[#6b6b6b]">{stageCaption(stage)}</p>
        </div>
        <p className="hidden items-center gap-1.5 text-[12px] font-medium text-[#111113] sm:inline-flex">
          <IconShield className="h-4 w-4" />
          Secure & Confidential
        </p>
      </div>
      <div className="mt-8">
        <StatusTracker stage={stage} />
      </div>
      <div className="mt-8 grid gap-6 border-t border-[#e5e5e5] pt-5 sm:grid-cols-2">
        <div className="flex items-start gap-3">
          <IconWallet className="mt-0.5 h-5 w-5 text-[#111113]" />
          <div>
            <p className="text-[12px] text-[#6b6b6b]">Amount requested</p>
            <p className="mt-1 text-xl font-semibold tracking-tight">{amount || '—'}</p>
          </div>
        </div>
        <div className="flex items-start gap-3 sm:border-l sm:border-[#e5e5e5] sm:pl-6">
          <IconTrend className="mt-0.5 h-5 w-5 text-[#111113]" />
          <div>
            <p className="text-[12px] text-[#6b6b6b]">Use of funds</p>
            <p className="mt-1 text-xl font-semibold tracking-tight">{useOfFunds || '—'}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
