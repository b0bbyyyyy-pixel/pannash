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
    <div className="min-h-screen bg-[#fdfdfd] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold text-gray-900">
            pannash.io
          </h1>
        </div>

        {/* Mode Toggle */}
        <div className="flex space-x-2 mb-6 bg-white border border-gray-200 rounded-lg p-1">
          <button
            type="button"
            onClick={() => {
              setMode('signin');
              setError('');
              setSuccess('');
            }}
            className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              mode === 'signin'
                ? 'bg-black text-white'
                : 'text-gray-600 hover:text-gray-900'
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
            className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              mode === 'signup'
                ? 'bg-black text-white'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Sign Up
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleAuth} className="space-y-6">
          <div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              required
              className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
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
              className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
            />
            {mode === 'signup' && (
              <p className="mt-2 text-xs text-gray-500">
                Must be at least 6 characters
              </p>
            )}
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 text-center">
              {error}
            </div>
          )}

          {success && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 text-center">
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-3 bg-black text-white rounded-lg font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
