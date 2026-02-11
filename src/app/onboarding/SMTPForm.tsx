'use client';

import { useState } from 'react';

interface SMTPFormProps {
  saveSMTP: (formData: FormData) => Promise<void>;
}

export default function SMTPForm({ saveSMTP }: SMTPFormProps) {
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    
    const formData = new FormData(e.currentTarget);
    await saveSMTP(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          SMTP Host
        </label>
        <input
          type="text"
          name="smtp_host"
          defaultValue="smtp.office365.com"
          required
          className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Port
        </label>
        <input
          type="number"
          name="smtp_port"
          defaultValue="587"
          required
          className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Username (Email)
        </label>
        <input
          type="email"
          name="smtp_username"
          placeholder="your-email@outlook.com"
          required
          className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Password
        </label>
        <input
          type="password"
          name="smtp_password"
          placeholder="App Password"
          required
          className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
        />
        <p className="mt-2 text-xs text-gray-500">
          If MFA is on, use an App Password:{' '}
          <a
            href="https://account.live.com/proofs/AppPassword"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-700 underline"
          >
            Get App Password
          </a>
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          From Name (optional)
        </label>
        <input
          type="text"
          name="from_name"
          placeholder="Your Name"
          className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full px-6 py-3 bg-black text-white rounded-lg font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Connecting...' : 'Connect Outlook'}
      </button>
    </form>
  );
}
