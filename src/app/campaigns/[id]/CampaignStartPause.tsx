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
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        status === 'active'
          ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200 border border-yellow-300'
          : 'bg-green-100 text-green-800 hover:bg-green-200 border border-green-300'
      }`}
    >
      {loading ? '...' : status === 'active' ? 'Pause' : 'Start'}
    </button>
  );
}
