'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

interface EmailConnection {
  provider: string;
  email_address: string;
}

export default function ConnectEmailButtons({
  connections,
}: {
  connections: EmailConnection[];
}) {
  const searchParams = useSearchParams();
  const [showSuccess, setShowSuccess] = useState(false);
  const [connectedProvider, setConnectedProvider] = useState<string | null>(null);

  useEffect(() => {
    const connected = searchParams.get('connected');
    if (connected) {
      setConnectedProvider(connected);
      setShowSuccess(true);
      // Clear the success message after 5 seconds
      setTimeout(() => setShowSuccess(false), 5000);
    }
  }, [searchParams]);

  const gmailConnection = connections.find((c) => c.provider === 'gmail');
  const outlookConnection = connections.find((c) => c.provider === 'outlook');

  return (
    <div className="bg-white rounded-lg shadow p-8 mb-8">
      <h3 className="text-2xl font-bold mb-4">Email Connection</h3>
      <p className="text-gray-600 mb-6">
        Connect your Gmail or Outlook account to send emails from your own address.
      </p>

      {showSuccess && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-md">
          <p className="text-green-800 font-medium">
            ✅{' '}
            {connectedProvider === 'gmail' ? 'Gmail' : 'Outlook'} connected
            successfully! Emails will now send from your address.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Gmail Button */}
        {gmailConnection ? (
          <div className="p-4 border-2 border-blue-200 bg-blue-50 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-gray-900 mb-1">
                  Gmail Connected
                </h4>
                <p className="text-sm text-gray-600">{gmailConnection.email_address}</p>
              </div>
              <span className="text-green-600 text-2xl">✓</span>
            </div>
          </div>
        ) : (
          <a
            href="/api/auth/connect/gmail"
            className="block p-6 border-2 border-blue-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-all"
          >
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-2">
                  📧 Connect Gmail
                </h4>
                <p className="text-gray-600 text-sm">
                  Send emails from your Gmail account
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

        {/* Outlook Button */}
        {outlookConnection ? (
          <div className="p-4 border-2 border-purple-200 bg-purple-50 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-gray-900 mb-1">
                  Outlook Connected
                </h4>
                <p className="text-sm text-gray-600">
                  {outlookConnection.email_address}
                </p>
              </div>
              <span className="text-green-600 text-2xl">✓</span>
            </div>
          </div>
        ) : (
          <a
            href="/api/auth/connect/outlook"
            className="block p-6 border-2 border-purple-200 rounded-lg hover:border-purple-400 hover:bg-purple-50 transition-all"
          >
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-2">
                  📨 Connect Outlook
                </h4>
                <p className="text-gray-600 text-sm">
                  Send emails from your Outlook account
                </p>
              </div>
              <svg
                className="w-6 h-6 text-purple-600"
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
    </div>
  );
}
