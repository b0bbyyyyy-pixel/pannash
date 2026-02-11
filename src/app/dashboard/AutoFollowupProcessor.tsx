'use client';

import { useEffect, useRef } from 'react';

/**
 * AutoFollowupProcessor runs two background tasks:
 * 1. Generate follow-ups every 30 minutes
 * 2. Send ready follow-ups every 5 minutes
 */
export default function AutoFollowupProcessor() {
  const processingRef = useRef(false);

  useEffect(() => {
    const generateFollowups = async () => {
      if (processingRef.current) return;
      
      processingRef.current = true;
      try {
        const response = await fetch('/api/followups/generate', {
          method: 'POST',
        });

        if (response.ok) {
          const data = await response.json();
          if (data.generated > 0) {
            console.log(`[Auto-Follow-up] Generated ${data.generated} follow-ups`);
          }
        }
      } catch (err) {
        console.log('[Auto-Follow-up] Generation check failed');
      } finally {
        processingRef.current = false;
      }
    };

    const sendFollowups = async () => {
      try {
        const response = await fetch('/api/followups/process', {
          method: 'POST',
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success > 0) {
            console.log(`[Auto-Follow-up] Sent ${data.success} follow-ups`);
          }
        }
      } catch (err) {
        console.log('[Auto-Follow-up] Send check failed');
      }
    };

    // Initial delays
    const generateTimeout = setTimeout(generateFollowups, 60000); // Wait 1 minute
    const sendTimeout = setTimeout(sendFollowups, 15000); // Wait 15 seconds

    // Recurring intervals
    const generateInterval = setInterval(generateFollowups, 30 * 60 * 1000); // Every 30 min
    const sendInterval = setInterval(sendFollowups, 5 * 60 * 1000); // Every 5 min

    return () => {
      clearTimeout(generateTimeout);
      clearTimeout(sendTimeout);
      clearInterval(generateInterval);
      clearInterval(sendInterval);
    };
  }, []);

  return null; // Invisible component
}
