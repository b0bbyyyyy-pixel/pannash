'use client';

import Link from 'next/link';
import MainToggle from './MainToggle';

interface CampaignCardProps {
  campaign: {
    id: string;
    name: string;
    created_at: string;
    status: string;
    type: string;
    is_main: boolean;
    sent: number;
    total: number;
  };
}

export default function CampaignCard({ campaign }: CampaignCardProps) {
  return (
    <div className="bg-white border border-[#e5e5e5] rounded-md p-6 hover:border-[#1a1a1a] transition-all group relative">
      {/* Main Toggle - Top Right */}
      <div className="absolute top-5 right-5" onClick={(e) => e.stopPropagation()}>
        <MainToggle campaignId={campaign.id} isMain={campaign.is_main || false} />
      </div>

      <Link href={`/campaigns/${campaign.id}`}>
        <div className="mb-5 pr-24">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-lg font-bold text-[#1a1a1a] group-hover:opacity-70 transition-opacity tracking-tight">
              {campaign.name}
            </h3>
            <span className={`px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide rounded ${
              campaign.type === 'sms' 
                ? 'bg-[#e5d5e8] text-[#4a4a4a]' 
                : 'bg-[#d5e5f0] text-[#4a4a4a]'
            }`}>
              {campaign.type === 'sms' ? 'SMS' : 'Email'}
            </span>
          </div>
          <p className="text-xs text-[#999]">
            {new Date(campaign.created_at).toLocaleDateString('en-US', { 
              month: 'numeric', 
              day: 'numeric', 
              year: 'numeric' 
            })}
          </p>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-sm text-[#6b6b6b]">
            <span className="font-bold text-[#1a1a1a]">{campaign.sent}</span> / {campaign.total} sent
          </div>
          <span
            className={`inline-flex px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide rounded ${
              campaign.status === 'active'
                ? 'bg-[#d5f0d5] text-[#2a5a2a]'
                : campaign.status === 'paused'
                ? 'bg-[#fff4d5] text-[#6b5a2a]'
                : campaign.status === 'completed'
                ? 'bg-[#e5e5e5] text-[#4a4a4a]'
                : 'bg-[#d5e5f0] text-[#2a4a5a]'
            }`}
          >
            {campaign.status}
          </span>
        </div>
      </Link>
    </div>
  );
}
