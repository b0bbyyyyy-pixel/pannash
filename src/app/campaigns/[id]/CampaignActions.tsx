'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface CampaignActionsProps {
  campaignId: string;
  status: string;
  subject: string;
  emailBody: string;
  updateStatus: (formData: FormData) => Promise<void>;
  deleteCampaign: () => Promise<void>;
}

export default function CampaignActions({ 
  campaignId, 
  status, 
  subject,
  emailBody,
  updateStatus,
  deleteCampaign 
}: CampaignActionsProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [showTemplate, setShowTemplate] = useState(false);
  const [editedSubject, setEditedSubject] = useState(subject);
  const [editedBody, setEditedBody] = useState(emailBody);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

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

  const handleViewTemplate = () => {
    setEditedSubject(subject);
    setEditedBody(emailBody);
    setShowTemplate(true);
    setShowMenu(false);
  };

  const handleSaveTemplate = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/campaigns/update-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId,
          subject: editedSubject,
          emailBody: editedBody,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setShowTemplate(false);
        router.refresh();
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error: any) {
      console.error('Error saving template:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Are you sure you want to reset this campaign? This will reset all lead statuses and clear the queue. This action cannot be undone.')) {
      return;
    }

    setShowMenu(false);
    try {
      const res = await fetch('/api/campaigns/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId }),
      });

      const data = await res.json();
      if (res.ok) {
        alert('Campaign reset successfully!');
        router.refresh();
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error: any) {
      console.error('Error resetting campaign:', error);
      alert(`Error: ${error.message}`);
    }
  };

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:border-gray-400 transition-colors"
        >
          Actions
        </button>

        {showMenu && (
          <>
            <div 
              className="fixed inset-0 z-10" 
              onClick={() => setShowMenu(false)}
            />
            <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-20">
              <button
                onClick={handleViewTemplate}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Edit Template
              </button>
              <hr className="my-1" />
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
                onClick={handleReset}
                className="w-full text-left px-4 py-2 text-sm text-orange-600 hover:bg-gray-50"
              >
                Reset Campaign
              </button>
              <button
                onClick={handleDelete}
                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-50"
              >
                Delete Campaign
              </button>
            </div>
          </>
        )}
      </div>

      {/* Template Modal */}
      {showTemplate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">Edit Email Template</h2>
                <button
                  onClick={() => setShowTemplate(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Subject</label>
                <input
                  type="text"
                  value={editedSubject}
                  onChange={(e) => setEditedSubject(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                  placeholder="Email subject..."
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Body</label>
                <textarea
                  value={editedBody}
                  onChange={(e) => setEditedBody(e.target.value)}
                  rows={12}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent font-mono text-sm"
                  placeholder="Email body... Use [Name], [Company], [Email], [Phone] for personalization"
                />
              </div>
              <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded">
                <strong>Template variables:</strong> [Name], [Company], [Email], [Phone], [Notes]
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 flex gap-3">
              <button
                onClick={() => setShowTemplate(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTemplate}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
