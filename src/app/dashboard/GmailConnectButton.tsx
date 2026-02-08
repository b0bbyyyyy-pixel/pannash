'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

interface GmailConnection {
  provider: string;
  email: string;
}

export default function GmailConnectButton({
  connection,
  onDisconnect,
}: {
  connection: GmailConnection | null;
  onDisconnect: () => Promise<void>;
}) {
  const searchParams = useSearchParams();
  const [showSuccess, setShowSuccess] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  useEffect(() => {
    const connected = searchParams.get('connected');
    const error = searchParams.get('error');

    if (connected === 'gmail') {
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 5000);
    } else if (error === 'gmail_auth_failed') {
      alert('Gmail connection failed. Please try again.');
    } else if (error === 'storage_failed') {
      alert('Failed to save Gmail connection. Please try again.');
    }
  }, [searchParams]);

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect Gmail?')) {
      return;
    }
    setIsDisconnecting(true);
    try {
      await onDisconnect();
    } catch (error: any) {
      alert('Error: ' + (error.message || 'Failed to disconnect'));
    } finally {
      setIsDisconnecting(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-8 mb-8">
      <h3 className="text-2xl font-bold mb-4">Connect Gmail</h3>
      <p className="text-gray-600 mb-6">
        Send emails from your personal Gmail account using OAuth.
      </p>

      {showSuccess && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-md">
          <p className="text-green-800 font-medium">
            ✅ Gmail connected! Emails will now send from your address.
          </p>
        </div>
      )}

      {connection ? (
        <div className="p-6 border-2 border-blue-200 bg-blue-50 rounded-lg">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="font-semibold text-gray-900 mb-1">
                Gmail Connected (OAuth)
              </h4>
              <p className="text-sm text-gray-600">{connection.email}</p>
            </div>
            <span className="text-green-600 text-2xl">✓</span>
          </div>
          <button
            onClick={handleDisconnect}
            disabled={isDisconnecting}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {isDisconnecting ? 'Disconnecting...' : 'Disconnect Gmail'}
          </button>
        </div>
      ) : (
        <a
          href="/api/auth/google"
          className="block p-6 border-2 border-blue-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-all"
        >
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-lg font-semibold text-gray-900 mb-2">
                📧 Connect Gmail with OAuth
              </h4>
              <p className="text-gray-600 text-sm">
                Securely connect your Gmail account to send emails
              </p>
            </div>
            <svg
              className="w-6 h-6 text-blue-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </div>
        </a>
      )}
    </div>
  );
}
