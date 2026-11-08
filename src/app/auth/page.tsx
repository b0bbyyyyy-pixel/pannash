'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import './auth.css';

const SCENE = '/images/auth/trylon-perisphere-wide.png?v=4';

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
      <p className="auth-mark">Gostwrk</p>
      <div className="auth-scene">
        <img
          className="auth-art"
          src={SCENE}
          alt="The Trylon and Perisphere"
          width={4096}
          height={2304}
          decoding="sync"
          fetchPriority="high"
        />
        <svg
          className="auth-water"
          viewBox="0 0 4096 2304"
          preserveAspectRatio="none"
          aria-hidden
        >
          <defs>
            <clipPath id="auth-pool-clip">
              <polygon points="1100,1688 2996,1688 3380,2304 720,2304" />
            </clipPath>
            <clipPath id="auth-fountain-clip">
              <rect x="2190" y="1452" width="280" height="128" rx="10" />
            </clipPath>
            <filter
              id="auth-water-ripple"
              x="680"
              y="1660"
              width="2760"
              height="660"
              filterUnits="userSpaceOnUse"
              primitiveUnits="userSpaceOnUse"
              colorInterpolationFilters="sRGB"
            >
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.0025 0.007"
                numOctaves="2"
                seed="2"
                result="noise"
              >
                <animate
                  attributeName="baseFrequency"
                  dur="18s"
                  values="0.0025 0.007;0.004 0.011;0.0025 0.007"
                  repeatCount="indefinite"
                />
              </feTurbulence>
              <feDisplacementMap
                in="SourceGraphic"
                in2="noise"
                scale="14"
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>
            <filter
              id="auth-fountain-ripple"
              x="2170"
              y="1435"
              width="320"
              height="160"
              filterUnits="userSpaceOnUse"
              primitiveUnits="userSpaceOnUse"
              colorInterpolationFilters="sRGB"
            >
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.03 0.12"
                numOctaves="1"
                seed="7"
                result="noise"
              >
                <animate
                  attributeName="baseFrequency"
                  dur="4s"
                  values="0.03 0.12;0.045 0.18;0.03 0.12"
                  repeatCount="indefinite"
                />
              </feTurbulence>
              <feDisplacementMap
                in="SourceGraphic"
                in2="noise"
                scale="5"
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>
          </defs>
          <g filter="url(#auth-water-ripple)">
            <g clipPath="url(#auth-pool-clip)">
              <image href={SCENE} width="4096" height="2304" />
            </g>
          </g>
          <g filter="url(#auth-fountain-ripple)">
            <g clipPath="url(#auth-fountain-clip)">
              <image href={SCENE} width="4096" height="2304" />
            </g>
          </g>
        </svg>

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

          {error && <p className="text-xs text-red-300">{error}</p>}
          {success && <p className="text-xs text-emerald-300">{success}</p>}

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
