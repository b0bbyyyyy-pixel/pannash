'use client';

import { useRouter } from 'next/navigation';

export default function SkipButton() {
  const router = useRouter();

  const handleSkip = () => {
    // Set flag in localStorage that user has skipped onboarding
    localStorage.setItem('onboarding_skipped', 'true');
    
    // Redirect to dashboard
    router.push('/dashboard');
  };

  return (
    <button
      onClick={handleSkip}
      className="text-sm text-[#999] hover:text-[#1a1a1a] underline"
    >
      Skip for now
    </button>
  );
}
