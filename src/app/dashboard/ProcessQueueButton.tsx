'use client';

import { useState } from 'react';

export default function ProcessQueueButton() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);

  const handleProcess = async () => {
    setIsProcessing(true);
    setLastResult(null);

    try {
      const response = await fetch('/api/queue/process', {
        method: 'POST',
      });

      const result = await response.json();
      setLastResult(result);

      if (response.ok) {
        if (result.processed === 0) {
          alert(
            'ℹ️ No emails ready to send yet.\n\n' +
            'This means:\n' +
            '- No campaigns are active\n' +
            '- OR all queued emails are scheduled for later\n' +
            '- OR the queue is empty\n\n' +
            'Check the campaign detail page to see scheduled times.'
          );
        } else {
          alert(
            `✅ Queue processed!\n\n` +
            `Processed: ${result.processed}\n` +
            `Success: ${result.success}\n` +
            `Failed: ${result.failed}`
          );
        }
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
    <div className="bg-white rounded-lg shadow p-8 mb-8">
      <h3 className="text-xl font-bold mb-4">Manual Queue Control (Optional)</h3>
      <p className="text-sm text-gray-600 mb-4">
        ✨ <strong>Emails send automatically every minute!</strong> Use this button only if you want to send immediately instead of waiting.
      </p>
      <button
        onClick={handleProcess}
        disabled={isProcessing}
        className="px-6 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-50 font-medium"
      >
        {isProcessing ? 'Processing...' : 'Send Ready Emails Now'}
      </button>
      {lastResult && (
        <div className="mt-4 p-4 bg-gray-50 rounded-md">
          <p className="text-sm font-medium text-gray-700">Last Result:</p>
          <pre className="text-xs text-gray-600 mt-2">
            {JSON.stringify(lastResult, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
