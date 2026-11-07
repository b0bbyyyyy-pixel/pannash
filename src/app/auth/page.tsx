'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function AuthPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  // Sign-up temporarily hidden — flip to 'signup' to re-enable that flow
  const [mode] = useState<'signin' | 'signup'>('signin');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleAuth = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/onboarding`,
          },
        });

        if (error) {
          setError(error.message);
        } else if (data?.user) {
          if (data.user.identities && data.user.identities.length === 0) {
            setError('An account with this email already exists. Please sign in instead.');
          } else if (data.session) {
            setSuccess('Account created. Redirecting…');
            setTimeout(() => { window.location.href = '/onboarding'; }, 1000);
          } else {
            setSuccess('Account created. Check your email to verify, then sign in.');
            setTimeout(() => setSuccess(''), 5000);
          }
        } else {
          setError('Something went wrong. Please try again.');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          setError(error.message);
        } else {
          setSuccess('Signed in. Redirecting…');
          setTimeout(() => { window.location.href = '/dashboard'; }, 500);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const inputClass = [
    'w-full bg-transparent border-0 border-b border-[#f5f1e8]/60 pb-2',
    'text-sm text-[#f5f1e8] focus:outline-none focus:border-[#f5f1e8]',
    'transition-colors rounded-none',
    // Kill browser autofill highlight
    '[&:-webkit-autofill]:shadow-[0_0_0_1000px_rgb(13,13,13)_inset]',
    '[&:-webkit-autofill]:[color:white]',
    '[&:-webkit-autofill]:[-webkit-text-fill-color:#f5f1e8]',
    '[&:-webkit-autofill]:caret-[#f5f1e8]',
  ].join(' ');

  return (
    <div className="min-h-screen bg-[rgb(13,13,13)] flex items-center justify-center px-6 py-12">
      <div className="flex flex-col md:flex-row items-center gap-10 md:gap-20 w-full max-w-4xl justify-center">

        {/* Logo */}
        <div className="shrink-0">
          <img
            src="/images/logo/gostwrk-auth-logo-transparent.png"
            alt="Gostwrk"
            className="w-[260px] md:w-[320px] h-auto"
          />
        </div>

        {/* Form */}
        <div className="w-full max-w-[300px]">
          <form onSubmit={handleAuth} className="space-y-10">

            {/* Email */}
            <div>
              <label className="block text-[11px] tracking-[0.3em] text-[#f5f1e8] font-medium mb-2">
                EMAIL
              </label>
              <div className="relative">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className={inputClass}
                />
                {email && (
                  <span className="absolute right-0 bottom-3 text-[#f5f1e8]/50 text-[8px] leading-none select-none">·</span>
                )}
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-[11px] tracking-[0.3em] text-[#f5f1e8] font-medium mb-2">
                PASSWORD
              </label>
              <div className="relative">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  className={inputClass}
                />
                {password && (
                  <span className="absolute right-0 bottom-3 text-[#f5f1e8]/50 text-[8px] leading-none select-none">·</span>
                )}
              </div>
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}
            {success && <p className="text-xs text-green-400">{success}</p>}

            <div>
              <button
                type="submit"
                disabled={loading}
                className="bg-transparent text-[#f5f1e8] text-[12px] font-bold tracking-[0.3em] hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? '···' : 'ENTER'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
