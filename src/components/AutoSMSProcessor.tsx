'use client';

import { useEffect, useRef } from 'react';

export default function AutoSMSProcessor() {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    async function processSMSQueue() {
      try {
        const res = await fetch('/api/sms/process', {
          method: 'POST',
        });
        const data = await res.json();
        
        if (data.success > 0) {
          console.log(`[SMS Processor] Sent ${data.success} SMS`);
        }
        
        if (data.failed > 0) {
          console.error(`[SMS Processor] Failed ${data.failed} SMS`);
        }
      } catch (error) {
        console.error('[SMS Processor] Error:', error);
      }
    }

    // Process every 15 seconds
    processSMSQueue();
    intervalRef.current = setInterval(processSMSQueue, 15000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return null;
}
