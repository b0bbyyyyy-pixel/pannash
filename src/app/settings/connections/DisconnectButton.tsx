'use client';

import { useState } from 'react';

interface DisconnectButtonProps {
  provider: string;
  disconnectAction: () => Promise<void>;
}

export default function DisconnectButton({ provider, disconnectAction }: DisconnectButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleDisconnect = async () => {
    if (!confirm(`Are you sure you want to disconnect ${provider}?`)) {
      return;
    }

    setLoading(true);
    try {
      await disconnectAction();
    } catch (error) {
      console.error('Error disconnecting:', error);
      alert('Failed to disconnect. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleDisconnect}
      disabled={loading}
      className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {loading ? 'Disconnecting...' : 'Disconnect'}
    </button>
  );
}
