'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface CampaignActionsProps {
  campaignId: string;
  status: string;
  campaignType: string;
  subject: string | null;
  emailBody: string | null;
  smsBody: string | null;
  aiDirective: string | null;
  aiRepliesEnabled: boolean;
  updateStatus: (formData: FormData) => Promise<void>;
  deleteCampaign: () => Promise<void>;
}

export default function CampaignActions({ 
  campaignId, 
  status,
  campaignType,
  subject,
  emailBody,
  smsBody,
  aiDirective,
  aiRepliesEnabled,
  updateStatus,
  deleteCampaign 
}: CampaignActionsProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [showTemplate, setShowTemplate] = useState(false);
  const [showManageLeads, setShowManageLeads] = useState(false);
  const [editedSubject, setEditedSubject] = useState(subject || '');
  const [editedBody, setEditedBody] = useState(emailBody || '');
  const [editedSmsBody, setEditedSmsBody] = useState(smsBody || '');
  const [editedAiDirective, setEditedAiDirective] = useState(aiDirective || '');
  const [editedAiRepliesEnabled, setEditedAiRepliesEnabled] = useState(aiRepliesEnabled);
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
    if (campaignType === 'sms') {
      setEditedSmsBody(smsBody || '');
      setEditedAiDirective(aiDirective || '');
      setEditedAiRepliesEnabled(aiRepliesEnabled);
    } else {
      setEditedSubject(subject || '');
      setEditedBody(emailBody || '');
    }
    setShowTemplate(true);
    setShowMenu(false);
  };

  const handleSaveTemplate = async () => {
    setSaving(true);
    try {
      let payload: any = { campaignId };
      
      if (campaignType === 'sms') {
        payload.smsBody = editedSmsBody;
        payload.aiRepliesEnabled = editedAiRepliesEnabled;
        // Only include AI directive if AI replies are enabled
        if (editedAiRepliesEnabled) {
          payload.aiDirective = editedAiDirective;
        } else {
          // Clear the directive if AI is disabled
          payload.aiDirective = null;
        }
      } else {
        payload.subject = editedSubject;
        payload.emailBody = editedBody;
      }

      const res = await fetch('/api/campaigns/update-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
          className="px-5 py-2.5 border border-[#e5e5e5] rounded-md text-sm font-medium text-[#1a1a1a] hover:border-[#1a1a1a] transition-colors"
        >
          Actions
        </button>

        {showMenu && (
          <>
            <div 
              className="fixed inset-0 z-10" 
              onClick={() => setShowMenu(false)}
            />
            <div className="absolute right-0 mt-2 w-48 bg-white border border-[#e5e5e5] rounded-md shadow-lg py-2 z-20">
              <button
                onClick={handleViewTemplate}
                className="w-full text-left px-4 py-2 text-sm text-[#1a1a1a] hover:bg-[#f5f5f5] font-medium"
              >
                Edit Template
              </button>
              <button
                onClick={() => {
                  setShowManageLeads(true);
                  setShowMenu(false);
                }}
                className="w-full text-left px-4 py-2 text-sm text-[#1a1a1a] hover:bg-[#f5f5f5] font-medium"
              >
                Manage Leads
              </button>
              <hr className="my-1 border-[#e5e5e5]" />
              {status !== 'active' && (
                <button
                  onClick={() => handleStatusChange('active')}
                  className="w-full text-left px-4 py-2 text-sm text-[#1a1a1a] hover:bg-[#f5f5f5] font-medium"
                >
                  Activate
                </button>
              )}
              {status === 'active' && (
                <button
                  onClick={() => handleStatusChange('paused')}
                  className="w-full text-left px-4 py-2 text-sm text-[#1a1a1a] hover:bg-[#f5f5f5] font-medium"
                >
                  Pause
                </button>
              )}
              <button
                onClick={() => handleStatusChange('completed')}
                className="w-full text-left px-4 py-2 text-sm text-[#1a1a1a] hover:bg-[#f5f5f5] font-medium"
              >
                Mark Complete
              </button>
              <hr className="my-1 border-[#e5e5e5]" />
              <button
                onClick={handleReset}
                className="w-full text-left px-4 py-2 text-sm text-[#d17a3f] hover:bg-[#f5f5f5] font-medium"
              >
                Reset Campaign
              </button>
              <button
                onClick={handleDelete}
                className="w-full text-left px-4 py-2 text-sm text-[#8a2a2a] hover:bg-[#f5f5f5] font-medium"
              >
                Delete Campaign
              </button>
            </div>
          </>
        )}
      </div>

      {/* Template Modal */}
      {showTemplate && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-md max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="p-8 border-b border-[#e5e5e5]">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-[#1a1a1a] tracking-tight">
                  {campaignType === 'sms' ? 'Edit SMS Template' : 'Edit Email Template'}
                </h2>
                <button
                  onClick={() => setShowTemplate(false)}
                  className="text-[#999] hover:text-[#1a1a1a]"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="p-8 space-y-5">
              {campaignType === 'sms' ? (
                <>
                  {/* SMS Template Fields */}
                  <div>
                    <label className="text-sm font-bold text-[#1a1a1a] mb-2 block tracking-tight">SMS Message</label>
                    <textarea
                      value={editedSmsBody}
                      onChange={(e) => setEditedSmsBody(e.target.value)}
                      rows={4}
                      maxLength={320}
                      className="w-full px-4 py-3 border border-[#e5e5e5] rounded-md focus:outline-none focus:ring-1 focus:ring-[#1a1a1a] focus:border-[#1a1a1a] bg-white text-[#1a1a1a]"
                      placeholder="Hi [Name], quick question about [Company]..."
                    />
                    <div className="mt-2 flex justify-between text-xs">
                      <span className="text-[#999]">
                        Use [Name], [Company], [Phone] for personalization
                      </span>
                      <span className={`${editedSmsBody.length > 160 ? 'text-[#d17a3f]' : 'text-[#999]'}`}>
                        {editedSmsBody.length}/320 characters
                      </span>
                    </div>
                  </div>

                  {/* AI Auto-Reply Toggle */}
                  <div className="bg-[#f5f5f5] border border-[#e5e5e5] rounded-md p-5">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h3 className="text-sm font-bold text-[#1a1a1a] mb-1 tracking-tight">
                          AI Auto-Replies
                        </h3>
                        <p className="text-xs text-[#6b6b6b]">
                          {editedAiRepliesEnabled 
                            ? 'AI will automatically respond to incoming SMS based on your directive below'
                            : 'Leads can reply, but you\'ll need to respond manually. AI responses disabled.'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditedAiRepliesEnabled(!editedAiRepliesEnabled)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          editedAiRepliesEnabled ? 'bg-[#1a1a1a]' : 'bg-[#d5d5d5]'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            editedAiRepliesEnabled ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                  
                  {/* Only show AI directive if AI replies are enabled */}
                  {editedAiRepliesEnabled && (
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-2 block">AI Reply Directive</label>
                      <textarea
                        value={editedAiDirective}
                        onChange={(e) => setEditedAiDirective(e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                        placeholder="e.g., You're a sales assistant trying to book a demo. Be friendly and persistent but not pushy."
                      />
                      <p className="mt-2 text-xs text-gray-500">
                        Tell the AI how to respond when leads reply
                      </p>
                    </div>
                  )}

                  <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded">
                    <strong>Template variables:</strong> [Name], [Company], [Phone]
                  </div>
                </>
              ) : (
                <>
                  {/* Email Template Fields */}
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
                </>
              )}
            </div>
            <div className="p-8 border-t border-[#e5e5e5] flex gap-3">
              <button
                onClick={() => setShowTemplate(false)}
                className="flex-1 px-4 py-2.5 border border-[#e5e5e5] text-[#6b6b6b] rounded-md hover:border-[#1a1a1a] hover:text-[#1a1a1a] transition-colors font-medium text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTemplate}
                disabled={saving}
                className="flex-1 px-4 py-2.5 bg-[#1a1a1a] text-white rounded-md hover:bg-[#2a2a2a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manage Leads Modal */}
      {showManageLeads && (
        <ManageLeadsModal 
          campaignId={campaignId}
          onClose={() => setShowManageLeads(false)}
        />
      )}
    </>
  );
}

function ManageLeadsModal({ campaignId, onClose }: { campaignId: string; onClose: () => void }) {
  const [leadLists, setLeadLists] = useState<any[]>([]);
  const [currentLeadList, setCurrentLeadList] = useState<string | null>(null);
  const [selectedLists, setSelectedLists] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch all lead lists
        const listsRes = await fetch('/api/lead-lists');
        const listsData = await listsRes.json();
        setLeadLists(listsData.lists || []);

        // Fetch current campaign's lead list
        const campaignRes = await fetch(`/api/campaigns/${campaignId}/lead-lists`);
        const campaignData = await campaignRes.json();
        if (campaignData.leadListIds) {
          setSelectedLists(campaignData.leadListIds);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [campaignId]);

  const handleAddLeads = async () => {
    if (selectedLists.length === 0) {
      alert('Please select at least one lead list');
      return;
    }

    setAdding(true);
    try {
      const res = await fetch('/api/campaigns/add-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId,
          leadListIds: selectedLists,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        alert(`Added ${data.added} new leads to campaign!`);
        router.refresh();
        onClose();
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error: any) {
      console.error('Error adding leads:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setAdding(false);
    }
  };

  const toggleList = (listId: string) => {
    setSelectedLists(prev =>
      prev.includes(listId)
        ? prev.filter(id => id !== listId)
        : [...prev, listId]
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">Manage Campaign Leads</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>
        </div>
        
        <div className="p-6">
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : (
            <>
              <p className="text-sm text-gray-600 mb-4">
                Select lead lists to add to this campaign. New leads will be queued when you start the campaign.
              </p>
              
              <div className="space-y-2 mb-6">
                {leadLists.map((list) => (
                  <label
                    key={list.id}
                    className="flex items-center p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedLists.includes(list.id)}
                      onChange={() => toggleList(list.id)}
                      className="w-4 h-4 text-gray-900 rounded mr-3"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">{list.name}</div>
                      {list.description && (
                        <div className="text-xs text-gray-500">{list.description}</div>
                      )}
                    </div>
                    <div className="text-sm text-gray-500">{list.lead_count || 0} leads</div>
                  </label>
                ))}
              </div>

              {leadLists.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No lead lists available. Create one in the Leads page first.
                </div>
              )}
            </>
          )}
        </div>

        <div className="p-6 border-t border-gray-200 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-[#e5e5e5] text-[#6b6b6b] rounded-md hover:border-[#1a1a1a] hover:text-[#1a1a1a] transition-colors font-medium text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleAddLeads}
            disabled={adding || selectedLists.length === 0}
            className="flex-1 px-4 py-2.5 bg-[#1a1a1a] text-white rounded-md hover:bg-[#2a2a2a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm"
          >
            {adding ? 'Adding...' : 'Add Selected Leads'}
          </button>
        </div>
      </div>
    </div>
  );
}
