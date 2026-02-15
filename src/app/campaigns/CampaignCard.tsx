'use client';

import Link from 'next/link';
import MainToggle from './MainToggle';

interface CampaignCardProps {
  campaign: {
    id: string;
    name: string;
    created_at: string;
    status: string;
    is_main: boolean;
    sent: number;
    total: number;
  };
}

export default function CampaignCard({ campaign }: CampaignCardProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 hover:border-gray-400 transition-all group relative">
      {/* Main Toggle - Top Right */}
      <div className="absolute top-4 right-4" onClick={(e) => e.stopPropagation()}>
        <MainToggle campaignId={campaign.id} isMain={campaign.is_main || false} />
      </div>

      <Link href={`/campaigns/${campaign.id}`}>
        <div className="mb-4 pr-24">
          <h3 className="text-lg font-semibold text-gray-900 mb-1 group-hover:text-gray-700">
            {campaign.name}
          </h3>
          <p className="text-sm text-gray-500">
            {new Date(campaign.created_at).toLocaleDateString()}
          </p>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            <span className="font-medium text-gray-900">{campaign.sent}</span> / {campaign.total} sent
          </div>
          <span
            className={`inline-flex px-3 py-1 text-xs font-medium rounded-full ${
              campaign.status === 'active'
                ? 'bg-green-100 text-green-800'
                : campaign.status === 'paused'
                ? 'bg-yellow-100 text-yellow-800'
                : campaign.status === 'completed'
                ? 'bg-gray-100 text-gray-800'
                : 'bg-blue-100 text-blue-800'
            }`}
          >
            {campaign.status}
          </span>
        </div>
      </Link>
    </div>
  );
}
