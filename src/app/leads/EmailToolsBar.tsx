'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function EmailToolsBar() {
  const [validating, setValidating] = useState(false);
  const [finding, setFinding] = useState(false);
  const [showDomainModal, setShowDomainModal] = useState(false);
  const router = useRouter();

  const handleValidateEmails = async () => {
    if (!confirm('This will check all leads for invalid emails and blocked domains. Continue?')) {
      return;
    }

    setValidating(true);
    try {
      const response = await fetch('/api/leads/validate-emails', {
        method: 'POST',
      });

      const data = await response.json();
      
      if (response.ok) {
        alert(
          `Email validation complete!\n\n` +
          `✅ Valid: ${data.valid}\n` +
          `❌ Invalid: ${data.invalid}\n` +
          `🚫 Blocked domains: ${data.blocked}\n` +
          `❓ Missing: ${data.missing}`
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
      });

      const data = await response.json();
      
      if (response.ok) {
        if (data.suggestions && data.suggestions.length > 0) {
          // Show suggestions in a modal or separate page
          // For now, just show count
          alert(
            `AI Email Finder complete!\n\n` +
            `Found ${data.suggestions.length} email suggestions.\n` +
            `Review them on the leads page.`
          );
          router.refresh();
        } else {
          alert('No email suggestions found. All leads have valid emails!');
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
      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">
              Email Quality Tools
            </h3>
            <p className="text-xs text-gray-600">
              Validate emails and find missing addresses with AI
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setShowDomainModal(true)}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              🚫 Manage Blocked Domains
            </button>
            <button
              onClick={handleValidateEmails}
              disabled={validating}
              className="px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-50 transition-colors"
            >
              {validating ? 'Validating...' : '✓ Validate All Emails'}
            </button>
            <button
              onClick={handleFindEmails}
              disabled={finding}
              className="px-4 py-2 bg-[#722F37] text-white rounded-lg text-sm font-medium hover:bg-[#8A9A5B] disabled:opacity-50 transition-colors"
            >
              {finding ? 'Finding...' : '🤖 Find Missing Emails (AI)'}
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">
            Blocked Domains
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl"
          >
            ×
          </button>
        </div>

        <p className="text-sm text-gray-600 mb-6">
          Block emails from specific domains (e.g., "noreply.com", "placeholder.com", "example.com"). 
          Leads with emails from blocked domains will be flagged and won't be sent emails.
        </p>

        {/* Add Domain Form */}
        <form onSubmit={handleAddDomain} className="mb-6 p-4 bg-gray-50 rounded-lg">
          <div className="flex gap-3">
            <div className="flex-1">
              <input
                type="text"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                placeholder="example.com"
                className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              />
            </div>
            <div className="flex-1">
              <input
                type="text"
                value={newReason}
                onChange={(e) => setNewReason(e.target.value)}
                placeholder="Reason (optional)"
                className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !newDomain}
              className="px-6 py-2 bg-black text-white rounded-lg font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              Add
            </button>
          </div>
        </form>

        {/* Blocked Domains List */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">
            Current Blocked Domains ({domains.length})
          </h3>
          {domains.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">
              No blocked domains yet. Add one above.
            </p>
          ) : (
            domains.map((domain) => (
              <div
                key={domain.id}
                className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg"
              >
                <div>
                  <div className="font-medium text-gray-900">
                    {domain.domain}
                  </div>
                  {domain.reason && (
                    <div className="text-xs text-gray-500 mt-1">
                      {domain.reason}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleRemoveDomain(domain.id)}
                  className="text-red-600 hover:text-red-800 text-sm font-medium"
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
