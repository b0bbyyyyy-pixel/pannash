'use client';

import { useState } from 'react';
import CampaignInsightsModal from '@/components/CampaignInsightsModal';

export default function CampaignOverviewInsights() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center justify-center w-5 h-5 rounded-full border border-[#d4d4d4] text-[11px] font-semibold text-[#9b9b9b] hover:border-[#1a1a1a] hover:text-[#1a1a1a] transition-colors"
        title="Campaign insights"
      >
        i
      </button>
      {open ? (
        <CampaignInsightsModal overview onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}
