'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import './auth.css';

const SCENE = '/images/auth/trylon-perisphere-wide.png?v=9';
const WATER = '/images/auth/trylon-perisphere-water.png?v=9';

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

  return (
    <div className="auth-page">
      <svg className="auth-svg-defs" aria-hidden>
        <filter
          id="auth-water-ripple"
          x="-8%"
          y="0%"
          width="116%"
          height="120%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.006 0.018"
            numOctaves="2"
            seed="2"
            result="noise"
          >
            <animate
              attributeName="baseFrequency"
              dur="22s"
              values="0.006 0.018;0.01 0.03;0.006 0.018"
              repeatCount="indefinite"
            />
          </feTurbulence>
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale="8"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </svg>

      <div className="auth-scene">
        <img
          className="auth-art"
          src={SCENE}
          alt="The Trylon and Perisphere"
          width={2400}
          height={1200}
          decoding="sync"
          fetchPriority="high"
        />
        <div className="auth-water" aria-hidden>
          <img src={WATER} alt="" width={2400} height={1200} decoding="async" />
        </div>
        <div className="auth-sheen" aria-hidden />
      </div>

      <div className="auth-form-col">
        <form onSubmit={handleAuth} className="auth-form">
          <div>
            <label className="auth-label">EMAIL</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="auth-input"
            />
          </div>

          <div>
            <label className="auth-label">PASSWORD</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              className="auth-input"
            />
          </div>

          {error && <p className="text-xs text-red-800">{error}</p>}
          {success && <p className="text-xs text-emerald-900">{success}</p>}

          <div>
            <button type="submit" disabled={loading} className="auth-enter">
              {loading ? '···' : 'ENTER'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
