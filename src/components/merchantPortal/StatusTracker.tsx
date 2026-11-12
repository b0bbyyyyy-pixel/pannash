import type { MerchantStage } from '@/lib/merchantPortal/stages';
import { IconCheck } from './icons';
import { TRACKER_STAGES, stageLabel, trackerIndex } from './status';

export default function StatusTracker({ stage }: { stage: MerchantStage }) {
  const active = trackerIndex(stage);
  const closed = stage === 'Closed';

  return (
    <ol className="grid grid-cols-6 gap-1 sm:gap-2">
      {TRACKER_STAGES.map((name, i) => {
        const done = !closed && i < active;
        const current = !closed && i === active;
        return (
          <li key={name} className="relative flex flex-col items-center text-center">
            {i < TRACKER_STAGES.length - 1 && (
              <span
                className={`absolute left-[calc(50%+18px)] right-[calc(-50%+18px)] top-[17px] h-px ${
                  done || current ? 'bg-[#111113]' : 'bg-[#e5e5e5]'
                }`}
              />
            )}
            <span
              className={`relative z-[1] flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold ${
                done || current
                  ? 'bg-[#111113]'
                  : 'border border-[#d4d4d4] bg-white'
              }`}
              style={{ color: done || current ? '#ffffff' : '#9b9b9b' }}
            >
              {done ? <IconCheck className="h-4 w-4" /> : i + 1}
            </span>
            {current && <span className="mt-1 h-0.5 w-8 rounded-full bg-[#111113]" />}
            <p className={`mt-2 text-[13px] ${current ? 'font-semibold text-[#111113]' : done ? 'font-medium text-[#111113]' : 'text-[#8a8a8a]'}`}>
              {stageLabel(name)}
            </p>
            <p className="mt-0.5 text-[11px] text-[#8a8a8a]">
              {done ? 'Completed' : current ? 'In Progress' : 'Pending'}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
