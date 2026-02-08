'use client';

import { useState } from 'react';

interface SMTPConnection {
  provider: string;
  smtp_host: string;
  smtp_port: number;
  smtp_username: string;
  from_email: string;
  from_name: string | null;
}

export default function SMTPConnectionForm({
  connection,
  onSave,
  onDisconnect,
}: {
  connection: SMTPConnection | null;
  onSave: (formData: FormData) => Promise<void>;
  onDisconnect: () => Promise<void>;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setShowSuccess(false);

    try {
      const formData = new FormData(e.currentTarget);
      await onSave(formData);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 5000);
    } catch (error: any) {
      alert('Error: ' + (error.message || 'Failed to save'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect your Outlook SMTP?')) {
      return;
    }
    setIsSubmitting(true);
    try {
      await onDisconnect();
    } catch (error: any) {
      alert('Error: ' + (error.message || 'Failed to disconnect'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-8 mb-8">
      <h3 className="text-2xl font-bold mb-4">Connect Outlook via SMTP</h3>
      <p className="text-gray-600 mb-6">
        Send emails from your Microsoft 365 or Outlook.com account using SMTP.
      </p>

      {showSuccess && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-md">
          <p className="text-green-800 font-medium">
            ✅ Outlook connected via SMTP! Emails will now send from your address.
          </p>
        </div>
      )}

      {connection ? (
        <div className="p-6 border-2 border-purple-200 bg-purple-50 rounded-lg">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="font-semibold text-gray-900 mb-1">
                Outlook Connected (SMTP)
              </h4>
              <p className="text-sm text-gray-600">{connection.from_email}</p>
              <p className="text-xs text-gray-500 mt-1">
                Host: {connection.smtp_host}:{connection.smtp_port}
              </p>
            </div>
            <span className="text-green-600 text-2xl">✓</span>
          </div>
          <button
            onClick={handleDisconnect}
            disabled={isSubmitting}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {isSubmitting ? 'Disconnecting...' : 'Disconnect SMTP'}
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="smtp_host" className="block text-sm font-medium text-gray-700 mb-1">
              SMTP Host
            </label>
            <input
              type="text"
              id="smtp_host"
              name="smtp_host"
              defaultValue="smtp.office365.com"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>

          <div>
            <label htmlFor="smtp_port" className="block text-sm font-medium text-gray-700 mb-1">
              SMTP Port
            </label>
            <input
              type="number"
              id="smtp_port"
              name="smtp_port"
              defaultValue="587"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>

          <div>
            <label htmlFor="smtp_username" className="block text-sm font-medium text-gray-700 mb-1">
              Email Address (Username)
            </label>
            <input
              type="email"
              id="smtp_username"
              name="smtp_username"
              placeholder="your-email@outlook.com"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>

          <div>
            <label htmlFor="from_name" className="block text-sm font-medium text-gray-700 mb-1">
              From Name (Optional)
            </label>
            <input
              type="text"
              id="from_name"
              name="from_name"
              placeholder="Your Name"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>

          <div>
            <label htmlFor="smtp_password" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              type="password"
              id="smtp_password"
              name="smtp_password"
              placeholder="Your password or app password"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
            <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
              <p className="text-sm text-yellow-800">
                <strong>⚠️ If you have 2-step verification (MFA) enabled:</strong>
                <br />
                You need an <strong>App Password</strong> instead of your regular password.
                <br />
                <a
                  href="https://account.live.com/proofs/AppPassword"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-600 underline hover:text-purple-800"
                >
                  Create an App Password here →
                </a>
              </p>
              <p className="text-xs text-yellow-700 mt-2">
                Learn more:{' '}
                <a
                  href="https://support.microsoft.com/en-us/account-billing/manage-app-passwords-for-two-step-verification-d6dc8c6d-4bf7-4851-ad95-6d07799387e9"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-yellow-900"
                >
                  Microsoft support article
                </a>
              </p>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full px-6 py-3 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors disabled:opacity-50 font-medium"
          >
            {isSubmitting ? 'Saving...' : 'Save Outlook SMTP'}
          </button>
        </form>
      )}
    </div>
  );
}
