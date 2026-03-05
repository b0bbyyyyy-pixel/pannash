'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

export default function AutoProcessor() {
  const router = useRouter();
  const [lastProcessed, setLastProcessed] = useState<Date | null>(null);
  const [failureCount, setFailureCount] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const [showAlert, setShowAlert] = useState(false);
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
          console.log(`[Auto-Processor] Sent ${result.success} emails, Failed ${result.failed || 0}`);
          if (result.errors && result.errors.length > 0) {
            // Only log connection-related errors, not spam console
            const hasConnectionError = result.errors.some((err: string) => 
              err.includes('expired') || err.includes('connection')
            );
            if (hasConnectionError) {
              console.log('[Auto-Processor] Connection issue detected:', result.errors[0]);
            }
          }
          setLastProcessed(new Date());
          
          // Check for failures
          if (result.failed > 0 && result.success === 0) {
            // All emails failed
            setFailureCount(prev => prev + 1);
            
            // Use specific error message if available
            if (result.errors && result.errors.length > 0) {
              const error = result.errors[0];
              setLastError(error);
              
              // Only show alert for connection errors (not other transient issues)
              if (error.includes('expired') || error.includes('reconnect')) {
                setShowAlert(true);
              }
            } else {
              setLastError('All emails failed to send');
            }
          } else if (result.failed > 0) {
            // Some emails failed (partial success is normal, don't alarm user)
            setLastError(null); // Don't show error indicator for partial failures
          } else {
            // All successful - reset counters
            setFailureCount(0);
            setLastError(null);
            setShowAlert(false);
          }
          
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
  }, [router, failureCount]);

  return (
    <>
      {/* Alert Banner */}
      {showAlert && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-red-600 text-white px-6 py-3 rounded-lg shadow-xl z-50 max-w-md">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 text-2xl">⚠️</div>
            <div className="flex-1">
              <div className="font-semibold mb-1">Email Sending Failed</div>
              <div className="text-sm opacity-90 mb-2">
                Your email connection may have expired. Please reconnect your email account in Settings → Connections.
              </div>
              <button
                onClick={() => setShowAlert(false)}
                className="text-xs underline hover:no-underline"
              >
                Dismiss
              </button>
            </div>
            <button
              onClick={() => setShowAlert(false)}
              className="text-white hover:text-gray-200 text-xl leading-none"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Status Indicator */}
      <div className={`fixed bottom-4 right-4 px-4 py-2 rounded-md shadow-lg text-sm flex items-center gap-2 ${
        lastError ? 'bg-orange-600' : 'bg-green-600'
      } text-white`}>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${lastError ? 'bg-white' : 'animate-pulse bg-white'}`}></div>
          <span>{lastError ? 'Sending issues' : 'Auto-sending active'}</span>
        </div>
        {lastProcessed && (
          <span className="text-xs opacity-75">
            Last: {lastProcessed.toLocaleTimeString()}
          </span>
        )}
      </div>
    </>
  );
}
