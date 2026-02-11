'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

export default function AutoProcessor() {
  const router = useRouter();
  const [lastProcessed, setLastProcessed] = useState<Date | null>(null);
  const processingRef = useRef(false);

  useEffect(() => {
    const processQueue = async () => {
      if (processingRef.current) return; // Prevent overlapping calls
      
      processingRef.current = true;
      try {
        const response = await fetch('/api/queue/process', {
          method: 'POST',
        });

        if (!response.ok) {
          console.log('[Auto-Processor] No emails ready to send');
          return;
        }

        const result = await response.json();

        if (result.processed > 0) {
          console.log(`[Auto-Processor] Sent ${result.success} emails`);
          setLastProcessed(new Date());
          // Refresh the page to show updated statuses
          router.refresh();
        }
      } catch (err) {
        // Silently log errors - don't break the UI
        console.log('[Auto-Processor] Queue check failed (server may be starting)');
      } finally {
        processingRef.current = false;
      }
    };

    // Wait 3 seconds before first check (let server fully start)
    const initialTimeout = setTimeout(processQueue, 3000);

    // Then process every 60 seconds
    const interval = setInterval(processQueue, 60000); // 1 minute

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [router]);

  return (
    <div className="fixed bottom-4 right-4 bg-green-600 text-white px-4 py-2 rounded-md shadow-lg text-sm flex items-center gap-2">
      <div className="flex items-center gap-2">
        <div className="animate-pulse w-2 h-2 bg-white rounded-full"></div>
        <span>Auto-sending active</span>
      </div>
      {lastProcessed && (
        <span className="text-xs opacity-75">
          Last: {lastProcessed.toLocaleTimeString()}
        </span>
      )}
    </div>
  );
}
