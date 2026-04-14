'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface CampaignToggleProps {
  campaignId: string;
  initialStatus: string;
}

export default function CampaignToggle({ campaignId, initialStatus }: CampaignToggleProps) {
  const [status, setStatus] = useState(initialStatus);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleToggle = async () => {
    const newStatus = status === 'active' ? 'paused' : 'active';
    
    setLoading(true);
    try {
      const response = await fetch('/api/campaigns/toggle-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId, status: newStatus }),
      });

      if (response.ok) {
        setStatus(newStatus);
        router.refresh();
      } else {
        const data = await response.json();
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Error toggling campaign:', error);
      alert('Failed to toggle campaign');
    } finally {
      setLoading(false);
    }
  };

  const isActive = status === 'active';

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      className={`px-6 py-3 rounded-lg font-semibold transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed ${
        isActive
          ? 'bg-black text-white hover:bg-gray-800'
          : 'bg-green-600 text-white hover:bg-green-700 shadow-lg shadow-green-600/50'
      }`}
    >
      {loading ? (
        <span className="flex items-center gap-2">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          {isActive ? 'Pausing...' : 'Starting...'}
        </span>
      ) : (
        <span className="flex items-center gap-2">
          {isActive ? (
            <>
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
              </svg>
              Pause Campaign
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
              Start Sending
            </>
          )}
        </span>
      )}
    </button>
  );
}
