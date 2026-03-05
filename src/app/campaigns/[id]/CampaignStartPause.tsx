'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface CampaignStartPauseProps {
  campaignId: string;
  status: string;
}

export default function CampaignStartPause({ campaignId, status }: CampaignStartPauseProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleToggle = async () => {
    setLoading(true);
    try {
      const newStatus = status === 'active' ? 'paused' : 'active';
      
      const res = await fetch('/api/campaigns/toggle-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId, status: newStatus }),
      });

      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json();
        alert(`Error: ${data.error}`);
      }
    } catch (error: any) {
      console.error('Error toggling campaign:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      className={`px-5 py-2.5 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        status === 'active'
          ? 'bg-[#fff4d5] text-[#6b5a2a] hover:bg-[#ffe9b8] border border-[#f0d58a]'
          : 'bg-[#d5f0d5] text-[#2a5a2a] hover:bg-[#c0e5c0] border border-[#9ad09a]'
      }`}
    >
      {loading ? '...' : status === 'active' ? 'Pause' : 'Start'}
    </button>
  );
}
