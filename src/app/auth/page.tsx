'use client';

import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

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
    <div className="min-h-screen bg-[#F5F5F5] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-12">
          <h1 className="font-serif text-5xl font-bold text-[#001F3F] mb-2">
            Gostwrk.io
          </h1>
          <p className="text-[#4A4A4A] text-sm">AI-powered outreach, simplified</p>
        </div>

        {/* Mode Toggle */}
        <div className="flex space-x-2 mb-8 bg-white border border-[#E0E0E0] rounded p-1 shadow-sm">
          <button
            type="button"
            onClick={() => {
              setMode('signin');
              setError('');
              setSuccess('');
            }}
            className={`flex-1 px-4 py-2.5 rounded text-sm font-medium transition-all ${
              mode === 'signin'
                ? 'bg-[#001F3F] text-[#F5F5F5]'
                : 'text-[#4A4A4A] hover:text-[#000000]'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('signup');
              setError('');
              setSuccess('');
            }}
            className={`flex-1 px-4 py-2.5 rounded text-sm font-medium transition-all ${
              mode === 'signup'
                ? 'bg-[#001F3F] text-[#F5F5F5]'
                : 'text-[#4A4A4A] hover:text-[#000000]'
            }`}
          >
            Sign Up
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleAuth} className="space-y-5 bg-white p-8 rounded shadow-sm border border-[#E0E0E0]">
          <div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              required
              className="w-full px-4 py-3.5 bg-[#F5F5F5] border border-[#E0E0E0] rounded text-[#000000] placeholder-[#4A4A4A] focus:outline-none focus:ring-2 focus:ring-[#001F3F] focus:border-transparent transition-all"
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
              className="w-full px-4 py-3.5 bg-[#F5F5F5] border border-[#E0E0E0] rounded text-[#000000] placeholder-[#4A4A4A] focus:outline-none focus:ring-2 focus:ring-[#001F3F] focus:border-transparent transition-all"
            />
            {mode === 'signup' && (
              <p className="mt-2 text-xs text-[#4A4A4A]">
                Must be at least 6 characters
              </p>
            )}
          </div>

          {error && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded text-sm text-red-700 text-center">
              {error}
            </div>
          )}

          {success && (
            <div className="p-3.5 bg-green-50 border border-green-200 rounded text-sm text-green-700 text-center">
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-3.5 bg-[#001F3F] text-[#F5F5F5] rounded font-medium hover:bg-[#8A9A5B] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading 
              ? (mode === 'signup' ? 'Creating Account...' : 'Signing In...') 
              : (mode === 'signup' ? 'Create Account' : 'Sign In')
            }
          </button>
        </form>
      </div>
    </div>
  );
}
