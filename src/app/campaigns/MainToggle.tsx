'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface MainToggleProps {
  campaignId: string;
  isMain: boolean;
}

export default function MainToggle({ campaignId, isMain }: MainToggleProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleToggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    setLoading(true);
    try {
      const res = await fetch('/api/campaigns/set-main', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          campaignId, 
          isMain: !isMain 
        }),
      });

      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json();
        alert(`Error: ${data.error}`);
      }
    } catch (error: any) {
      console.error('Error toggling main:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
        isMain
          ? 'bg-black text-white'
          : 'bg-white text-gray-600 border border-gray-300 hover:border-gray-400'
      }`}
    >
      {loading ? '...' : isMain ? 'Main' : 'Set as Main'}
    </button>
  );
}
