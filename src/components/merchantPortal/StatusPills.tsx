import type { MerchantStage } from '@/lib/merchantPortal/stages';
import { IconCheck, IconSend, IconWarn } from './icons';
import { TRACKER_STAGES, stageLabel, trackerIndex } from './status';

export default function StatusPills({ stage }: { stage: MerchantStage }) {
  const active = trackerIndex(stage);
  const closed = stage === 'Closed';

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {TRACKER_STAGES.map((name, i) => {
        const current = !closed && i === active;
        const done = !closed && i < active;
        return (
          <span
            key={name}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] ${
              current
                ? 'border-[#111113] bg-[#111113] font-medium'
                : 'border-[#e5e5e5] bg-white'
            }`}
            style={{ color: current ? '#ffffff' : '#6b6b6b' }}
          >
            {current ? (
              <span className="h-3.5 w-3.5 rounded-full border border-white" />
            ) : name === 'Docs needed' ? (
              <IconWarn className="h-3.5 w-3.5" />
            ) : name === 'Submitted to partners' ? (
              <IconSend className="h-3.5 w-3.5" />
            ) : name === 'Approved' || name === 'Funded' ? (
              <IconCheck className="h-3.5 w-3.5" />
            ) : done ? (
              <IconCheck className="h-3.5 w-3.5" />
            ) : null}
            {stageLabel(name)}
          </span>
        );
      })}
    </div>
  );
}
