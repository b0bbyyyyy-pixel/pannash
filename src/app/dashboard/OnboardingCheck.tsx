'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface OnboardingCheckProps {
  hasEmailConnection: boolean;
}

export default function OnboardingCheck({ hasEmailConnection }: OnboardingCheckProps) {
  const router = useRouter();

  useEffect(() => {
    // If no email connection and user hasn't skipped onboarding, redirect
    if (!hasEmailConnection) {
      const hasSkipped = localStorage.getItem('onboarding_skipped');
      
      if (!hasSkipped) {
        // First time without connection - redirect to onboarding
        router.push('/onboarding');
      }
    }
  }, [hasEmailConnection, router]);

  // Show warning banner if user skipped but has no connection
  if (!hasEmailConnection) {
    return (
      <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium text-yellow-900 mb-1">
              ⚠️ No Email Connected
            </div>
            <div className="text-sm text-yellow-700">
              Connect your email account to start sending campaigns
            </div>
          </div>
          <Link
            href="/settings/connections"
            className="px-4 py-2 bg-yellow-600 text-white rounded-lg text-sm font-medium hover:bg-yellow-700 transition-colors"
          >
            Connect Email
          </Link>
        </div>
      </div>
    );
  }

  return null;
}
