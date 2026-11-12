'use client';

import { useState } from 'react';

export default function MerchantLoginForm() {
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setMessage('');
    try {
      const res = await fetch('/api/merchant/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, mobile }),
      });
      const json = await res.json().catch(() => ({}));
      setMessage(json.message || 'If we have an application for that email or mobile, we sent a new link.');
    } catch {
      setMessage('If we have an application for that email or mobile, we sent a new link.');
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-5 space-y-3">
      <input
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="Email"
        className="w-full rounded-lg border border-[#e5e5e5] px-3 py-2.5 text-sm text-[#111113]"
      />
      <input
        type="tel"
        value={mobile}
        onChange={e => setMobile(e.target.value)}
        placeholder="Mobile"
        className="w-full rounded-lg border border-[#e5e5e5] px-3 py-2.5 text-sm text-[#111113]"
      />
      <button
        type="submit"
        disabled={sending}
        className="w-full rounded-lg bg-[#111113] py-2.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {sending ? 'Sending…' : 'Email me a new link'}
      </button>
      {message && <p className="text-sm text-[#6b6b6b]">{message}</p>}
    </form>
  );
}
