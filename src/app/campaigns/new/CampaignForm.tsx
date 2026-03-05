'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface CampaignFormProps {
  hasEmailConnection: boolean;
  hasPhoneConnection: boolean;
  leadLists: any[];
}

export default function CampaignForm({ hasEmailConnection, hasPhoneConnection, leadLists }: CampaignFormProps) {
  const [campaignType, setCampaignType] = useState<'email' | 'sms'>('email');
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [smsBody, setSmsBody] = useState('');
  const [aiDirective, setAiDirective] = useState('');
  const [aiRepliesEnabled, setAiRepliesEnabled] = useState(true);
  const [selectedLists, setSelectedLists] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch('/api/campaigns/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: campaignType,
          name,
          subject: campaignType === 'email' ? subject : undefined,
          email_body: campaignType === 'email' ? emailBody : undefined,
          sms_body: campaignType === 'sms' ? smsBody : undefined,
          ai_directive: campaignType === 'sms' ? aiDirective : undefined,
          ai_replies_enabled: campaignType === 'sms' ? aiRepliesEnabled : undefined,
          leadListIds: selectedLists,
        }),
      });

      const data = await res.json();
      
      if (res.ok) {
        router.push(`/campaigns/${data.campaignId}`);
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error: any) {
      console.error('Error creating campaign:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const toggleList = (listId: string) => {
    setSelectedLists(prev =>
      prev.includes(listId)
        ? prev.filter(id => id !== listId)
        : [...prev, listId]
    );
  };

  const canSubmit = () => {
    if (!name || selectedLists.length === 0) return false;
    
    if (campaignType === 'email') {
      return !!(hasEmailConnection && subject && emailBody);
    } else {
      // For SMS: require smsBody always, aiDirective only if AI is enabled
      const hasBody = smsBody.trim() !== '';
      const aiValid = !aiRepliesEnabled || (aiDirective.trim() !== '');
      return !!(hasPhoneConnection && hasBody && aiValid);
    }
  };

  const smsCharCount = smsBody.length;
  const smsSegments = Math.ceil(smsCharCount / 160);

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Campaign Type Selector */}
      <div>
        <label className="block text-sm font-bold text-[#1a1a1a] mb-3 tracking-tight">
          Campaign Type
        </label>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setCampaignType('email')}
            className={`flex-1 px-6 py-4 border rounded-md transition-all ${
              campaignType === 'email'
                ? 'border-[#1a1a1a] bg-[#1a1a1a] text-white'
                : 'border-[#e5e5e5] bg-white text-[#6b6b6b] hover:border-[#1a1a1a]'
            }`}
          >
            <div className="font-semibold mb-1">Email Campaign</div>
            <div className="text-xs opacity-80">Send personalized emails with tracking</div>
          </button>
          <button
            type="button"
            onClick={() => {
              console.log('SMS button clicked, changing to SMS');
              setCampaignType('sms');
            }}
            className={`flex-1 px-6 py-4 border rounded-md transition-all ${
              campaignType === 'sms'
                ? 'border-[#1a1a1a] bg-[#1a1a1a] text-white'
                : 'border-[#e5e5e5] bg-white text-[#6b6b6b] hover:border-[#1a1a1a]'
            }`}
          >
            <div className="font-bold mb-1">SMS Campaign</div>
            <div className="text-xs opacity-70">Send texts with AI auto-replies</div>
          </button>
        </div>

        {campaignType === 'email' && !hasEmailConnection && (
          <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
            ⚠️ No email connection found. Connect Gmail in Settings first.
          </div>
        )}

        {campaignType === 'sms' && !hasPhoneConnection && (
          <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
            ⚠️ No Twilio connection found. Connect Twilio in Settings first.
          </div>
        )}
      </div>

      {/* Campaign Name */}
      <div>
        <label className="block text-sm font-bold text-[#1a1a1a] mb-2 tracking-tight">
          Campaign Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-4 py-3 border border-[#e5e5e5] rounded-md focus:outline-none focus:ring-1 focus:ring-[#1a1a1a] focus:border-[#1a1a1a] bg-white text-[#1a1a1a]"
          placeholder="e.g., Q1 Outreach, Product Launch..."
        />
      </div>

      {/* Email-Specific Fields */}
      {campaignType === 'email' && (
        <>
          <div>
            <label className="block text-sm font-bold text-[#1a1a1a] mb-2 tracking-tight">
              Subject Line
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-4 py-3 border border-[#e5e5e5] rounded-md focus:outline-none focus:ring-1 focus:ring-[#1a1a1a] focus:border-[#1a1a1a] bg-white text-[#1a1a1a]"
              placeholder="Use [Name], [Company] for personalization"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-[#1a1a1a] mb-2 tracking-tight">
              Email Body
            </label>
            <textarea
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              rows={12}
              className="w-full px-4 py-3 border border-[#e5e5e5] rounded-md focus:outline-none focus:ring-1 focus:ring-[#1a1a1a] focus:border-[#1a1a1a] font-mono text-sm bg-white text-[#1a1a1a]"
              placeholder="Hi [Name],&#10;&#10;I noticed [Company]...&#10;&#10;Variables: [Name], [Company], [Email], [Phone]"
            />
            <p className="mt-2 text-xs text-[#999]">
              Use [Name], [Company], [Email], [Phone] for personalization
            </p>
          </div>
        </>
      )}

      {/* SMS-Specific Fields */}
      {campaignType === 'sms' && (
        <>
          <div>
            <label className="block text-sm font-bold text-[#1a1a1a] mb-2 tracking-tight">
              SMS Message
            </label>
            <textarea
              value={smsBody}
              onChange={(e) => setSmsBody(e.target.value)}
              rows={4}
              className="w-full px-4 py-3 border border-[#e5e5e5] rounded-md focus:outline-none focus:ring-1 focus:ring-[#1a1a1a] focus:border-[#1a1a1a] bg-white text-[#1a1a1a]"
              placeholder="Hi [Name], quick question about [Company]..."
              maxLength={320}
            />
            <div className="mt-2 flex justify-between text-xs">
              <span className="text-gray-500">
                Use [Name], [Company], [Phone] for personalization
              </span>
              <span className={`${smsCharCount > 160 ? 'text-orange-600' : 'text-gray-500'}`}>
                {smsCharCount}/320 characters ({smsSegments} SMS {smsSegments === 1 ? 'segment' : 'segments'})
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
                  {aiRepliesEnabled 
                    ? 'AI will automatically respond to incoming SMS based on your directive below'
                    : 'Leads can reply, but you\'ll need to respond manually. AI responses disabled.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAiRepliesEnabled(!aiRepliesEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  aiRepliesEnabled ? 'bg-black' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    aiRepliesEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          <div>
            <label className={`block text-sm font-bold mb-2 tracking-tight ${aiRepliesEnabled ? 'text-[#1a1a1a]' : 'text-[#999]'}`}>
              AI Reply Directive {!aiRepliesEnabled && '(Optional - AI disabled)'}
            </label>
            <textarea
              value={aiDirective}
              onChange={(e) => setAiDirective(e.target.value)}
              rows={3}
              disabled={!aiRepliesEnabled}
              className={`w-full px-4 py-3 border border-[#e5e5e5] rounded-md focus:outline-none focus:ring-1 focus:ring-[#1a1a1a] focus:border-[#1a1a1a] text-[#1a1a1a] ${
                !aiRepliesEnabled ? 'bg-[#f5f5f5] cursor-not-allowed opacity-60' : 'bg-white'
              }`}
              placeholder={aiRepliesEnabled 
                ? "e.g., You're a sales assistant trying to book a demo. Be friendly and persistent but not pushy. If they ask about pricing, mention starting at $99/mo."
                : "Enable AI Auto-Replies to set a directive"
              }
            />
            <p className={`mt-2 text-xs ${aiRepliesEnabled ? 'text-gray-500' : 'text-gray-400'}`}>
              {aiRepliesEnabled 
                ? 'Tell the AI how to respond when leads reply. Be specific about your goals, tone, and key information to share.'
                : 'AI replies are disabled. Leads can still reply but you\'ll need to respond manually.'}
            </p>
          </div>
        </>
      )}

      {/* Lead List Selection */}
      <div>
        <label className="block text-sm font-bold text-[#1a1a1a] mb-3 tracking-tight">
          Select Lead Lists
        </label>
        
        {leadLists.length === 0 ? (
          <div className="text-center py-10 bg-[#f5f5f5] border border-[#e5e5e5] rounded-md">
            <p className="text-[#6b6b6b] mb-4">No lead lists yet</p>
            <Link
              href="/leads"
              className="inline-block px-4 py-2 bg-[#1a1a1a] text-white rounded-md text-sm font-medium hover:bg-[#2a2a2a] transition-colors"
            >
              Create Lead List
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {leadLists.map((list) => (
              <label
                key={list.id}
                className="flex items-center p-4 border border-[#e5e5e5] rounded-md hover:bg-[#f5f5f5] cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selectedLists.includes(list.id)}
                  onChange={() => toggleList(list.id)}
                  className="w-4 h-4 text-[#1a1a1a] rounded mr-3"
                />
                <div className="flex-1">
                  <div className="font-bold text-[#1a1a1a] tracking-tight">{list.name}</div>
                  {list.description && (
                    <div className="text-xs text-[#999] mt-1">{list.description}</div>
                  )}
                </div>
                <div className="text-sm text-gray-500">
                  {list.leadCount} {campaignType === 'email' ? 'contacts' : 'phone numbers'}
                </div>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Submit Buttons */}
      <div className="flex gap-3 pt-6 border-t border-[#e5e5e5]">
        <Link
          href="/campaigns"
          className="flex-1 px-6 py-3 border border-[#e5e5e5] text-[#6b6b6b] rounded-md hover:border-[#1a1a1a] hover:text-[#1a1a1a] transition-colors text-center font-medium text-sm"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={loading || !canSubmit()}
          className="flex-1 px-6 py-3 bg-[#1a1a1a] text-white rounded-md hover:bg-[#2a2a2a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm"
        >
          {loading ? 'Creating...' : `Create ${campaignType === 'email' ? 'Email' : 'SMS'} Campaign`}
        </button>
      </div>
    </form>
  );
}
