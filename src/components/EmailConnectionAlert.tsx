'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function EmailConnectionAlert() {
  const [hasConnection, setHasConnection] = useState<boolean | null>(null);

  useEffect(() => {
    const checkConnection = async () => {
      try {
        const res = await fetch('/api/settings/check-email-connection');
        const data = await res.json();
        setHasConnection(data.hasConnection);
      } catch (error) {
        console.error('Error checking email connection:', error);
      }
    };

    checkConnection();
  }, []);

  if (hasConnection === null || hasConnection === true) {
    return null;
  }

  return (
    <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="ml-3 flex-1">
          <h3 className="text-sm font-medium text-yellow-800">
            Email Connection Required
          </h3>
          <div className="mt-2 text-sm text-yellow-700">
            <p>
              You need to connect an email account to send campaigns.{' '}
              <Link href="/settings/connections" className="font-medium underline hover:text-yellow-600">
                Connect your email now
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
