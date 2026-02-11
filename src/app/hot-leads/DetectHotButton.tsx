'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function DetectHotButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const router = useRouter();

  const handleDetect = async () => {
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch('/api/leads/detect-hot', {
        method: 'POST',
      });

      const data = await response.json();

      if (response.ok) {
        setResult(`✅ Checked ${data.checked} leads, detected ${data.detected} hot leads`);
        
        // Refresh the page if any hot leads detected
        if (data.detected > 0) {
          setTimeout(() => {
            router.refresh();
          }, 1500);
        }
      } else {
        setResult(`❌ Error: ${data.error || 'Failed to detect hot leads'}`);
      }
    } catch (err: any) {
      console.error('Detection error:', err);
      setResult(`❌ Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleDetect}
        disabled={loading}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Detecting...' : 'Detect Hot Leads Now'}
      </button>
      
      {result && (
        <div className="mt-2 text-sm">
          {result}
        </div>
      )}
    </div>
  );
}
