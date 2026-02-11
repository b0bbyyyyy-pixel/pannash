'use client';

import { useState } from 'react';

interface CampaignActionsProps {
  campaignId: string;
  status: string;
  updateStatus: (formData: FormData) => Promise<void>;
  deleteCampaign: () => Promise<void>;
}

export default function CampaignActions({ 
  campaignId, 
  status, 
  updateStatus,
  deleteCampaign 
}: CampaignActionsProps) {
  const [showMenu, setShowMenu] = useState(false);

  const handleStatusChange = async (newStatus: string) => {
    const formData = new FormData();
    formData.append('status', newStatus);
    await updateStatus(formData);
    setShowMenu(false);
  };

  const handleDelete = async () => {
    if (confirm('Are you sure you want to delete this campaign?')) {
      await deleteCampaign();
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:border-gray-400 transition-colors"
      >
        Actions
      </button>

      {showMenu && (
        <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-10">
          {status !== 'active' && (
            <button
              onClick={() => handleStatusChange('active')}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Activate
            </button>
          )}
          {status === 'active' && (
            <button
              onClick={() => handleStatusChange('paused')}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Pause
            </button>
          )}
          <button
            onClick={() => handleStatusChange('completed')}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Mark Complete
          </button>
          <hr className="my-1" />
          <button
            onClick={handleDelete}
            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-50"
          >
            Delete Campaign
          </button>
        </div>
      )}
    </div>
  );
}
