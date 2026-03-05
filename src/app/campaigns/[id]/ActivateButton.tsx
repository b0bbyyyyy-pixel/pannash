'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ActivateButton({ campaignId }: { campaignId: string }) {
  const [isActivating, setIsActivating] = useState(false);
  const router = useRouter();

  const handleActivate = async () => {
    if (!confirm('Activate this campaign? Emails will be queued and sent automatically.')) {
      return;
    }

    setIsActivating(true);

    try {
      const response = await fetch(`/api/campaigns/${campaignId}/activate`, {
        method: 'POST',
      });

      const result = await response.json();

      if (response.ok) {
        alert(`✅ Campaign activated!\n\n${result.queued} emails queued for sending.`);
        router.refresh();
      } else {
        alert(`❌ Error: ${result.error}`);
      }
    } catch (err: any) {
      alert(`❌ Failed to activate: ${err.message}`);
    } finally {
      setIsActivating(false);
    }
  };

  return (
    <button
      onClick={handleActivate}
      disabled={isActivating}
      className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 font-medium disabled:opacity-50"
    >
      {isActivating ? 'Activating...' : 'Activate'}
    </button>
  );
}
