'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ProcessQueueButton() {
  const [isProcessing, setIsProcessing] = useState(false);
  const router = useRouter();

  const handleProcess = async () => {
    setIsProcessing(true);

    try {
      const response = await fetch('/api/queue/process', {
        method: 'POST',
      });

      const result = await response.json();

      if (response.ok) {
        if (result.processed === 0) {
          alert(
            'ℹ️ No emails ready to send yet.\n\n' +
            'All emails are scheduled for later. Check the queue schedule below.'
          );
        } else {
          alert(
            `✅ Queue processed!\n\n` +
            `Sent: ${result.success}\n` +
            `Failed: ${result.failed}`
          );
        }
        // Refresh the page to show updated statuses
        router.refresh();
      } else {
        alert(`❌ Error: ${result.error}`);
      }
    } catch (err: any) {
      alert(`❌ Failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <button
      onClick={handleProcess}
      disabled={isProcessing}
      className="px-6 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-50 font-medium"
    >
      {isProcessing ? 'Processing...' : 'Send Ready Emails Now'}
    </button>
  );
}
