'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function AuthPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeAction, setActiveAction] = useState<'signin' | 'signup' | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleAuth = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter;
    const intent =
      submitter instanceof HTMLButtonElement && submitter.value === 'signup' ? 'signup' : 'signin';
    setActiveAction(intent);
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      if (intent === 'signup') {
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
            setSuccess('Account created! Redirecting...');
            setTimeout(() => {
              window.location.href = '/onboarding';
            }, 1000);
          } else {
            setSuccess('Account created! Please check your email to verify your account, then sign in.');
            setTimeout(() => {
              setSuccess('');
            }, 5000);
          }
        } else {
          setError('Something went wrong. Please try again.');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          setError(error.message);
        } else {
          setSuccess('Signed in! Redirecting...');
          setTimeout(() => {
            window.location.href = '/dashboard';
          }, 500);
        }
      }
    } finally {
      setLoading(false);
      setActiveAction(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#3a3a3a] flex items-center justify-center px-4">
      <div className="w-full max-w-[320px]">
        {/* Logo */}
        <div className="text-center mb-8">
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
            <p className="mt-1.5 text-[10px] text-[#999]">Use at least 6 characters.</p>
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

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              name="auth"
              value="signin"
              disabled={loading}
              className="flex-1 px-4 py-2.5 rounded-md text-sm font-semibold bg-[#f5f1e8] text-[#1a1a1a] hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading && activeAction === 'signin' ? 'Signing in…' : 'Sign in'}
            </button>
            <button
              type="submit"
              name="auth"
              value="signup"
              disabled={loading}
              className="flex-1 px-4 py-2.5 rounded-md text-sm font-semibold bg-transparent text-[#f5f1e8] border border-[#555] hover:border-[#777] hover:bg-[#2a2a2a] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading && activeAction === 'signup' ? 'Creating account…' : 'Sign up'}
            </button>
          </div>
        </form>

        {/* Contact & SMS Disclosure - Combined */}
        <div className="mt-12 pt-8 border-t border-[#555]">
          <div className="text-center mb-4">
            <h2 className="text-lg font-bold text-[#f5f1e8] mb-2">Need Help or Have a Question?</h2>
            <p className="text-sm text-[#999] mb-4">Text us directly to start a conversation.</p>
          </div>

          <a
            href="sms:+16318922787"
            className="block w-full px-6 py-3 bg-[#f5f1e8] text-[#1a1a1a] rounded-md text-sm font-bold hover:bg-white transition-colors mb-6 text-center"
          >
            Text Us Now
          </a>

          <div className="text-center mb-4">
            <a 
              href="tel:+16318922787" 
              className="text-2xl font-bold text-[#f5f1e8] hover:text-white transition-colors"
            >
              (631) 892-2787
            </a>
          </div>

          <div className="bg-[#2a2a2a] border border-[#555] rounded-lg p-4 text-xs text-[#999] leading-relaxed space-y-3">
            <p>
              You can text us at <a href="tel:+16318922787" className="text-[#f5f1e8] font-semibold hover:text-white">(631) 892-2787</a> to start a conversation with Gostwrk regarding your inquiry, support, or account-related questions.
            </p>
            <p>
              <strong className="text-[#f5f1e8]">By texting this number</strong>, you agree to receive conversational SMS messages from Gostwrk. Message frequency varies. Message and data rates may apply.
            </p>
            <p>
              Reply <strong className="text-[#f5f1e8]">STOP</strong> to opt out or <strong className="text-[#f5f1e8]">HELP</strong> for assistance.
            </p>
          </div>

          <div className="flex justify-center gap-4 mt-6">
            <a href="/contact" className="text-xs text-[#999] hover:text-[#f5f1e8] transition-colors">
              Contact
            </a>
            <a href="/privacy" className="text-xs text-[#999] hover:text-[#f5f1e8] transition-colors">
              Privacy
            </a>
            <a href="/terms" className="text-xs text-[#999] hover:text-[#f5f1e8] transition-colors">
              Terms
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
