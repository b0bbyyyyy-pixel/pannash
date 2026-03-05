'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface EmailToolsBarProps {
  selectedListId?: string;
}

export default function EmailToolsBar({ selectedListId }: EmailToolsBarProps) {
  const [validating, setValidating] = useState(false);
  const [finding, setFinding] = useState(false);
  const [showDomainModal, setShowDomainModal] = useState(false);
  const router = useRouter();

  const handleValidateEmails = async () => {
    const listName = selectedListId === 'unlisted' ? 'unlisted leads' : selectedListId ? 'this list' : 'all leads';
    if (!confirm(`This will check ${listName} for invalid emails and blocked domains. Continue?`)) {
      return;
    }

    setValidating(true);
    try {
      const response = await fetch('/api/leads/validate-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listId: selectedListId }),
      });

      const data = await response.json();
      
      if (response.ok) {
        alert(
          `Email validation complete!\n\n` +
          `✅ Valid: ${data.valid}\n` +
          `❌ Invalid format: ${data.invalid}\n` +
          `🚫 Blocked domains: ${data.blocked}\n` +
          `❓ Missing: ${data.missing}\n\n` +
          `${data.blocked > 0 ? '💡 Tip: Blocked domain emails have a red ✗. Use "AI Email Finder" to replace them with suggested emails.' : ''}`
        );
        router.refresh();
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Error validating emails:', error);
      alert('Failed to validate emails');
    } finally {
      setValidating(false);
    }
  };

  const handleFindEmails = async () => {
    setFinding(true);
    try {
      const response = await fetch('/api/leads/find-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listId: selectedListId }),
      });

      const data = await response.json();
      
      if (response.ok) {
        if (data.suggestions && data.suggestions.length > 0) {
          alert(
            `✅ AI Email Finder complete!\n\n` +
            `Updated ${data.suggestions.length} lead(s) with AI-suggested emails.\n\n` +
            `Processed: ${data.processed} out of ${data.total} leads needing help.\n\n` +
            `The invalid/missing emails have been replaced.`
          );
          router.refresh();
        } else {
          alert('✅ No email suggestions needed. All leads have valid emails!');
        }
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Error finding emails:', error);
      alert('Failed to find emails');
    } finally {
      setFinding(false);
    }
  };

  return (
    <>
      <div className="bg-white border border-[#e5e5e5] rounded-md p-5 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-[#1a1a1a] mb-1 tracking-tight">
              Email Quality Tools
            </h3>
            <p className="text-xs text-[#6b6b6b]">
              Validate emails and find missing addresses with AI
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setShowDomainModal(true)}
              className="px-4 py-2 border border-[#e5e5e5] text-[#1a1a1a] rounded-md text-sm font-medium hover:border-[#1a1a1a] transition-colors"
            >
              Manage Blocked Domains
            </button>
            <button
              onClick={handleValidateEmails}
              disabled={validating}
              className="px-4 py-2 bg-[#d17a3f] text-white rounded-md text-sm font-medium hover:bg-[#b86a35] disabled:opacity-50 transition-colors"
            >
              {validating ? 'Validating...' : 'Validate All Emails'}
            </button>
            <button
              onClick={handleFindEmails}
              disabled={finding}
              className="px-4 py-2 bg-[#6b5a8a] text-white rounded-md text-sm font-medium hover:bg-[#5a4a7a] disabled:opacity-50 transition-colors"
            >
              {finding ? 'Finding...' : 'AI Email Finder'}
            </button>
          </div>
        </div>
      </div>

      {/* Blocked Domains Modal */}
      {showDomainModal && (
        <BlockedDomainsModal onClose={() => setShowDomainModal(false)} />
      )}
    </>
  );
}

function BlockedDomainsModal({ onClose }: { onClose: () => void }) {
  const [domains, setDomains] = useState<Array<{ id: string; domain: string; reason?: string }>>([]);
  const [newDomain, setNewDomain] = useState('');
  const [newReason, setNewReason] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // Fetch blocked domains on mount
  useState(() => {
    fetch('/api/blocked-domains')
      .then(res => res.json())
      .then(data => {
        if (data.domains) setDomains(data.domains);
      });
  });

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newDomain) return;

    setLoading(true);
    try {
      const response = await fetch('/api/blocked-domains/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          domain: newDomain.toLowerCase().trim(),
          reason: newReason.trim() || null
        }),
      });

      const data = await response.json();
      
      if (response.ok) {
        setDomains([...domains, data.domain]);
        setNewDomain('');
        setNewReason('');
        router.refresh();
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Error adding domain:', error);
      alert('Failed to add domain');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveDomain = async (domainId: string) => {
    try {
      const response = await fetch('/api/blocked-domains/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domainId }),
      });

      if (response.ok) {
        setDomains(domains.filter(d => d.id !== domainId));
        router.refresh();
      } else {
        const data = await response.json();
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Error removing domain:', error);
      alert('Failed to remove domain');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-md p-8 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-[#1a1a1a] tracking-tight">
            Blocked Domains
          </h2>
          <button
            onClick={onClose}
            className="text-[#999] hover:text-[#1a1a1a] text-2xl"
          >
            ×
          </button>
        </div>

        <p className="text-sm text-[#6b6b6b] mb-6">
          Block emails from specific domains (e.g., "noreply.com", "placeholder.com", "example.com"). 
          Leads with emails from blocked domains will be flagged and won't be sent emails.
        </p>

        {/* Add Domain Form */}
        <form onSubmit={handleAddDomain} className="mb-6 p-5 bg-[#f5f5f5] rounded-md">
          <div className="flex gap-3">
            <div className="flex-1">
              <input
                type="text"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                placeholder="example.com"
                className="w-full px-4 py-3 bg-white border border-[#e5e5e5] rounded-md text-[#1a1a1a] focus:outline-none focus:ring-1 focus:ring-[#1a1a1a] focus:border-[#1a1a1a]"
              />
            </div>
            <div className="flex-1">
              <input
                type="text"
                value={newReason}
                onChange={(e) => setNewReason(e.target.value)}
                placeholder="Reason (optional)"
                className="w-full px-4 py-3 bg-white border border-[#e5e5e5] rounded-md text-[#1a1a1a] focus:outline-none focus:ring-1 focus:ring-[#1a1a1a] focus:border-[#1a1a1a]"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !newDomain}
              className="px-6 py-3 bg-[#1a1a1a] text-white rounded-md font-medium hover:bg-[#2a2a2a] disabled:opacity-50 transition-colors"
            >
              Add
            </button>
          </div>
        </form>

        {/* Blocked Domains List */}
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-[#1a1a1a] mb-3 tracking-tight">
            Current Blocked Domains ({domains.length})
          </h3>
          {domains.length === 0 ? (
            <p className="text-sm text-[#999] text-center py-8">
              No blocked domains yet. Add one above.
            </p>
          ) : (
            domains.map((domain) => (
              <div
                key={domain.id}
                className="flex items-center justify-between p-4 bg-white border border-[#e5e5e5] rounded-md"
              >
                <div>
                  <div className="font-bold text-[#1a1a1a]">
                    {domain.domain}
                  </div>
                  {domain.reason && (
                    <div className="text-xs text-[#999] mt-1">
                      {domain.reason}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleRemoveDomain(domain.id)}
                  className="text-[#8a2a2a] hover:text-[#6a1a1a] text-xs font-medium uppercase tracking-wide"
                >
                  Remove
                </button>
              </div>
            ))
          )}
        </div>

        {/* Common Examples */}
        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm font-medium text-blue-900 mb-2">
            💡 Common auto-filled domains to block:
          </p>
          <p className="text-xs text-blue-700">
            noreply.com, placeholder.com, example.com, test.com, invalid.com, 
            unknown.com, notprovided.com, missing.com, temp.com
          </p>
        </div>
      </div>
    </div>
  );
}
