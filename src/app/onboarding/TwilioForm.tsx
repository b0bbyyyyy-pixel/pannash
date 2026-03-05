'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function TwilioForm() {
  const [accountSid, setAccountSid] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/settings/phone/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_sid: accountSid,
          auth_token: authToken,
          phone_number: phoneNumber,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        // Redirect to dashboard after successful connection
        router.push('/dashboard');
      } else {
        setError(data.error || 'Failed to connect Twilio');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 bg-red-900/20 border border-red-800/30 rounded-md text-sm text-red-300">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-bold text-[#1a1a1a] mb-2 tracking-tight">
          Account SID
        </label>
        <input
          type="text"
          value={accountSid}
          onChange={(e) => setAccountSid(e.target.value)}
          className="w-full px-4 py-3 bg-white border border-[#e5e5e5] rounded-md text-[#1a1a1a] focus:outline-none focus:ring-1 focus:ring-[#1a1a1a] focus:border-[#1a1a1a] text-sm"
          placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-bold text-[#1a1a1a] mb-2 tracking-tight">
          Auth Token
        </label>
        <input
          type="password"
          value={authToken}
          onChange={(e) => setAuthToken(e.target.value)}
          className="w-full px-4 py-3 bg-white border border-[#e5e5e5] rounded-md text-[#1a1a1a] focus:outline-none focus:ring-1 focus:ring-[#1a1a1a] focus:border-[#1a1a1a] text-sm"
          placeholder="Your Twilio Auth Token"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-bold text-[#1a1a1a] mb-2 tracking-tight">
          Phone Number
        </label>
        <input
          type="tel"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          className="w-full px-4 py-3 bg-white border border-[#e5e5e5] rounded-md text-[#1a1a1a] focus:outline-none focus:ring-1 focus:ring-[#1a1a1a] focus:border-[#1a1a1a] text-sm"
          placeholder="+1234567890"
          required
        />
        <p className="mt-1 text-xs text-[#999]">
          Include country code (e.g., +1 for US)
        </p>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full px-4 py-3 bg-[#1a1a1a] text-white rounded-md hover:bg-[#2a2a2a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
      >
        {loading ? 'Connecting...' : 'Connect & Continue'}
      </button>
    </form>
  );
}
