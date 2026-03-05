'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * AutoHotDetector runs hot lead detection every 5 minutes in the background
 */
export default function AutoHotDetector() {
  const [detectedCount, setDetectedCount] = useState<number>(0);
  const router = useRouter();

  useEffect(() => {
    const detectHotLeads = async () => {
      try {
        const response = await fetch('/api/leads/detect-hot', {
          method: 'POST',
        });

        if (!response.ok) {
          console.log('[AutoHotDetector] Detection check failed');
          return;
        }

        const data = await response.json();
        console.log('[AutoHotDetector]', data.message);
        
        if (data.detected > 0) {
          setDetectedCount(prev => prev + data.detected);
          // Refresh page if new hot leads detected
          router.refresh();
        }
      } catch (err) {
        // Silently log errors - don't break the UI
        console.log('[AutoHotDetector] Check failed (server may be starting)');
      }
    };

    // Wait 10 seconds before first check (let server fully start + user settle in)
    const initialTimeout = setTimeout(detectHotLeads, 10000);

    // Then run every 5 minutes
    const intervalId = setInterval(detectHotLeads, 5 * 60 * 1000);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(intervalId);
    };
  }, [router]);

  if (detectedCount === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-orange-500 text-white px-4 py-2 rounded-lg shadow-lg animate-pulse">
      🔥 {detectedCount} new hot lead{detectedCount > 1 ? 's' : ''} detected!
    </div>
  );
}
