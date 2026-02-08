'use client';

import { useState } from 'react';

interface ConnectionInfo {
  hasGmail: boolean;
  hasOutlook: boolean;
  gmailEmail?: string;
  outlookEmail?: string;
}

export default function TestEmailButton({ connectionInfo }: { connectionInfo: ConnectionInfo }) {
  const [isSending, setIsSending] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);

  const sendingFrom = connectionInfo.hasGmail
    ? `Gmail (${connectionInfo.gmailEmail})`
    : connectionInfo.hasOutlook
    ? `Outlook (${connectionInfo.outlookEmail})`
    : 'Resend default sender';

  const hasConnection = connectionInfo.hasGmail || connectionInfo.hasOutlook;

  const handleSendTest = async () => {
    setIsSending(true);
    setLastResult(null);

    try {
            const response = await fetch('/api/test-email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ to: 'b0bbyyyyy@aol.com' }),
            });
      const result = await response.json();

      setLastResult(result);

      if (response.ok) {
        const method = result.method === 'gmail_oauth' ? 'Gmail OAuth' 
          : result.method === 'outlook_smtp' ? 'Outlook SMTP' 
          : 'Resend';
        const from = result.from || 'Resend default';
        
        alert(
          `✅ Test email sent successfully!\n\nMethod: ${method}\nFrom: ${from}\n\nCheck your inbox at b0bbyyyyy@aol.com`
        );
      } else {
        alert('❌ Error: ' + (result.error || 'Unknown error'));
      }
    } catch (err: any) {
      alert('❌ Failed to send: ' + (err.message || 'Unknown error'));
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-8 mb-8">
      <h3 className="text-xl font-bold mb-4">Test Email Sending</h3>

      {/* Connection Status */}
      <div className="mb-4 p-4 bg-gray-50 border border-gray-200 rounded-md">
        <p className="text-sm font-medium text-gray-700 mb-1">
          Currently sending from:
        </p>
        <p className="text-lg font-semibold text-gray-900">
          {sendingFrom}
        </p>
        {!hasConnection && (
          <p className="text-xs text-gray-500 mt-2">
            💡 Connect Gmail or Outlook above to send from your own email address
          </p>
        )}
      </div>

      <button
        onClick={handleSendTest}
        disabled={isSending}
        className="px-6 py-3 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors disabled:opacity-50 font-medium"
      >
        {isSending ? 'Sending...' : 'Test Send from Connected Account'}
      </button>

      <p className="mt-3 text-sm text-gray-600">
        This will send a test email to <strong>b0bbyyyyy@aol.com</strong>
        {hasConnection && ' from your connected email account'}.
      </p>
    </div>
  );
}
