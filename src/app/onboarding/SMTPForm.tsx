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
        <label className="block text-sm font-bold text-[#1a1a1a] mb-2 tracking-tight">
          SMTP Host
        </label>
        <input
          type="text"
          name="smtp_host"
          defaultValue="smtp.office365.com"
          required
          className="w-full px-4 py-3 bg-white border border-[#e5e5e5] rounded-md text-[#1a1a1a] focus:outline-none focus:ring-1 focus:ring-[#1a1a1a] focus:border-[#1a1a1a]"
        />
      </div>

      <div>
        <label className="block text-sm font-bold text-[#1a1a1a] mb-2 tracking-tight">
          Port
        </label>
        <input
          type="number"
          name="smtp_port"
          defaultValue="587"
          required
          className="w-full px-4 py-3 bg-white border border-[#e5e5e5] rounded-md text-[#1a1a1a] focus:outline-none focus:ring-1 focus:ring-[#1a1a1a] focus:border-[#1a1a1a]"
        />
      </div>

      <div>
        <label className="block text-sm font-bold text-[#1a1a1a] mb-2 tracking-tight">
          Username (Email)
        </label>
        <input
          type="email"
          name="smtp_username"
          placeholder="your-email@outlook.com"
          required
          className="w-full px-4 py-3 bg-white border border-[#e5e5e5] rounded-md text-[#1a1a1a] focus:outline-none focus:ring-1 focus:ring-[#1a1a1a] focus:border-[#1a1a1a]"
        />
      </div>

      <div>
        <label className="block text-sm font-bold text-[#1a1a1a] mb-2 tracking-tight">
          Password
        </label>
        <input
          type="password"
          name="smtp_password"
          placeholder="App Password"
          required
          className="w-full px-4 py-3 bg-white border border-[#e5e5e5] rounded-md text-[#1a1a1a] focus:outline-none focus:ring-1 focus:ring-[#1a1a1a] focus:border-[#1a1a1a]"
        />
        <p className="mt-2 text-xs text-[#6b6b6b]">
          If MFA is on, use an App Password:{' '}
          <a
            href="https://account.live.com/proofs/AppPassword"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#5a7fc7] hover:text-[#4a6fb7] underline"
          >
            Get App Password
          </a>
        </p>
      </div>

      <div>
        <label className="block text-sm font-bold text-[#1a1a1a] mb-2 tracking-tight">
          From Name (optional)
        </label>
        <input
          type="text"
          name="from_name"
          placeholder="Your Name"
          className="w-full px-4 py-3 bg-white border border-[#e5e5e5] rounded-md text-[#1a1a1a] focus:outline-none focus:ring-1 focus:ring-[#1a1a1a] focus:border-[#1a1a1a]"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full px-6 py-3 bg-[#1a1a1a] text-white rounded-md font-medium hover:bg-[#2a2a2a] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Connecting...' : 'Connect Outlook'}
      </button>
    </form>
  );
}
