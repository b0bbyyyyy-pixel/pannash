'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function RequeueButton({ campaignId }: { campaignId: string }) {
  const [isRequeuing, setIsRequeuing] = useState(false);
  const router = useRouter();

  const handleRequeue = async () => {
    if (!confirm('Re-queue all pending leads? This will schedule them for sending.')) {
      return;
    }

    setIsRequeuing(true);

    try {
      const response = await fetch(`/api/campaigns/${campaignId}/activate`, {
        method: 'POST',
      });

      const result = await response.json();

      if (response.ok) {
        alert(`✅ Emails re-queued!\n\n${result.queued} emails scheduled for sending.`);
        router.refresh();
      } else {
        alert(`❌ Error: ${result.error}`);
      }
    } catch (err: any) {
      alert(`❌ Failed to re-queue: ${err.message}`);
    } finally {
      setIsRequeuing(false);
    }
  };

  return (
    <button
      onClick={handleRequeue}
      disabled={isRequeuing}
      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium disabled:opacity-50"
    >
      {isRequeuing ? 'Re-queuing...' : 'Re-queue Emails'}
    </button>
  );
}
