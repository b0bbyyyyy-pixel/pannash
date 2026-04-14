'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AutoProcessor({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [lastProcessed, setLastProcessed] = useState<Date | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    const processQueue = async () => {
      if (processing) return; // Prevent overlapping calls
      
      setProcessing(true);
      try {
        const response = await fetch('/api/queue/process', {
          method: 'POST',
        });

        const result = await response.json();

        if (response.ok && result.processed > 0) {
          console.log(`[Auto-Processor] Sent ${result.success} emails`);
          setLastProcessed(new Date());
          // Refresh the page to show updated statuses
          router.refresh();
        }
      } catch (err) {
        console.error('[Auto-Processor] Error:', err);
      } finally {
        setProcessing(false);
      }
    };

    // Process immediately on mount
    processQueue();

    // Then process every 60 seconds
    const interval = setInterval(processQueue, 60000); // 1 minute

    return () => clearInterval(interval);
  }, [enabled, router, processing]);

  if (!enabled) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-green-600 text-white px-4 py-2 rounded-md shadow-lg text-sm flex items-center gap-2">
      <div className="flex items-center gap-2">
        <div className="animate-pulse w-2 h-2 bg-white rounded-full"></div>
        <span>Auto-sending enabled</span>
      </div>
      {lastProcessed && (
        <span className="text-xs opacity-75">
          Last check: {lastProcessed.toLocaleTimeString()}
        </span>
      )}
    </div>
  );
}
