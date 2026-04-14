'use client';

import { useEffect, useState } from 'react';

interface EngagementStatsProps {
  campaignLeadId: string;
}

export default function EngagementStats({ campaignLeadId }: EngagementStatsProps) {
  const [stats, setStats] = useState<{
    opens: number;
    clicks: number;
  }>({ opens: 0, clicks: 0 });

  useEffect(() => {
    // Fetch engagement stats for this lead
    fetch(`/api/leads/engagement?campaignLeadId=${campaignLeadId}`)
      .then(res => res.json())
      .then(data => {
        if (data.opens !== undefined && data.clicks !== undefined) {
          setStats({ opens: data.opens, clicks: data.clicks });
        }
      })
      .catch(err => console.error('Error fetching engagement:', err));
  }, [campaignLeadId]);

  if (stats.opens === 0 && stats.clicks === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
      {stats.opens > 0 && (
        <span className="flex items-center gap-1">
          <span className="text-blue-600">👁️</span>
          {stats.opens} {stats.opens === 1 ? 'open' : 'opens'}
        </span>
      )}
      {stats.clicks > 0 && (
        <span className="flex items-center gap-1">
          <span className="text-[#722F37]">🖱️</span>
          {stats.clicks} {stats.clicks === 1 ? 'click' : 'clicks'}
        </span>
      )}
    </div>
  );
}
