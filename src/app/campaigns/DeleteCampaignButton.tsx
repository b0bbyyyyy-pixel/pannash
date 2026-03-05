'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface CampaignCardActionsProps {
  campaignId: string;
  campaignName: string;
  deleteCampaign: (formData: FormData) => Promise<void>;
}

export default function CampaignCardActions({ 
  campaignId, 
  campaignName, 
  deleteCampaign 
}: CampaignCardActionsProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to delete "${campaignName}"? This will also delete all associated queue items and cannot be undone.`)) {
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('campaignId', campaignId);
      await deleteCampaign(formData);
      setShowMenu(false);
    } catch (error) {
      console.error('Error deleting campaign:', error);
      alert('Failed to delete campaign');
      setLoading(false);
    }
  };

  const handleView = (e: React.MouseEvent) => {
    e.stopPropagation();
    router.push(`/campaigns/${campaignId}`);
    setShowMenu(false);
  };

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setShowMenu(!showMenu);
        }}
        className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-700 hover:border-gray-400 transition-colors"
      >
        Actions
      </button>

      {showMenu && (
        <>
          <div 
            className="fixed inset-0 z-10" 
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(false);
            }}
          />
          <div className="absolute right-0 mt-2 w-40 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-20">
            <button
              onClick={handleView}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              View Campaign
            </button>
            <hr className="my-1" />
            <button
              onClick={handleDelete}
              disabled={loading}
              className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
