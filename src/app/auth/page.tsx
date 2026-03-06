'use client';

import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
// Trigger redeploy for env vars

export default function AuthPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    if (mode === 'signup') {
      // Sign up new user
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/onboarding`,
        },
      });

      if (error) {
        setError(error.message);
        setLoading(false);
      } else if (data?.user) {
        // Check if email confirmation is required
        if (data.user.identities && data.user.identities.length === 0) {
          // User already exists
          setError('An account with this email already exists. Please sign in instead.');
          setLoading(false);
        } else if (data.session) {
          // Email confirmation disabled - user is logged in immediately
          setSuccess('Account created! Redirecting...');
          setTimeout(() => {
            window.location.href = '/onboarding';
          }, 1000);
        } else {
          // Email confirmation required
          setSuccess('Account created! Please check your email to verify your account, then sign in.');
          setLoading(false);
          // Switch to sign in mode after 3 seconds
          setTimeout(() => {
            setMode('signin');
            setSuccess('');
          }, 5000);
        }
      } else {
        setError('Something went wrong. Please try again.');
        setLoading(false);
      }
    } else {
      // Sign in existing user
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError(error.message);
        setLoading(false);
      } else {
        setSuccess('Signed in! Redirecting...');
        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 500);
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#3a3a3a] flex items-center justify-center px-4">
      <div className="w-full max-w-[320px]">
        {/* Logo */}
        <div className="text-center mb-12">
          <div className="flex justify-center mb-0">
            <img
              src="/images/logo/gostwrk-logo-cream.svg"
              alt="Gostwrk"
              width={360}
              height={360}
              className="w-[360px] h-[360px]"
            />
          </div>
          <h1 className="text-3xl font-bold text-[#f5f1e8] -mt-12 tracking-tight font-serif">
            Gostwrk
          </h1>
        </div>

        {/* Form */}
        <form onSubmit={handleAuth} className="space-y-3">
          <div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              required
              className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#555] rounded-md text-[#f5f1e8] placeholder-[#777] focus:outline-none focus:ring-1 focus:ring-[#f5f1e8] focus:border-[#f5f1e8] transition-all text-sm"
            />
          </div>

          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              required
              minLength={6}
              className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#555] rounded-md text-[#f5f1e8] placeholder-[#777] focus:outline-none focus:ring-1 focus:ring-[#f5f1e8] focus:border-[#f5f1e8] transition-all text-sm"
            />
            {mode === 'signup' && (
              <p className="mt-1.5 text-[10px] text-[#999]">
                Must be at least 6 characters
              </p>
            )}
          </div>

          {error && (
            <div className="p-2.5 bg-red-900/20 border border-red-800/30 rounded-md text-xs text-red-300 text-center">
              {error}
            </div>
          )}

          {success && (
            <div className="p-2.5 bg-green-900/20 border border-green-800/30 rounded-md text-xs text-green-300 text-center">
              {success}
            </div>
          )}

          {/* Mode Toggle Buttons */}
          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={loading}
              onClick={() => {
                setMode('signin');
                setError('');
                setSuccess('');
              }}
              className={`flex-1 px-4 py-2 rounded-md text-xs font-medium transition-all ${
                mode === 'signin'
                  ? 'bg-[#f5f1e8] text-[#1a1a1a]'
                  : 'bg-transparent text-[#999] border border-[#555] hover:border-[#777]'
              }`}
            >
              {loading && mode === 'signin' ? 'Signing In...' : 'Sign In'}
            </button>
            <button
              type="submit"
              disabled={loading}
              onClick={() => {
                setMode('signup');
                setError('');
                setSuccess('');
              }}
              className={`flex-1 px-4 py-2 rounded-md text-xs font-medium transition-all ${
                mode === 'signup'
                  ? 'bg-[#f5f1e8] text-[#1a1a1a]'
                  : 'bg-transparent text-[#999] border border-[#555] hover:border-[#777]'
              }`}
            >
              {loading && mode === 'signup' ? 'Creating Account...' : 'Sign Up'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
