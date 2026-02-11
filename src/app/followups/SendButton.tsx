'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SendButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const router = useRouter();

  const handleSend = async () => {
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch('/api/followups/process', {
        method: 'POST',
      });

      const data = await response.json();

      if (response.ok) {
        setResult(`✅ ${data.message}`);
        
        // Refresh the page
        setTimeout(() => {
          router.refresh();
        }, 1500);
      } else {
        setResult(`❌ Error: ${data.error || 'Failed to send follow-ups'}`);
      }
    } catch (err: any) {
      console.error('Send error:', err);
      setResult(`❌ Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleSend}
        disabled={loading}
        className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Sending...' : 'Send Now'}
      </button>
      
      {result && (
        <div className="mt-2 text-sm">
          {result}
        </div>
      )}
    </div>
  );
}
