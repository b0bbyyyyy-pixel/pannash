'use client';

export default function GmailConnectButton({ error }: { error?: string | null }) {
  const handleConnect = () => {
    window.location.href = '/api/auth/google?redirect=/settings/connections';
  };

  return (
    <div className="space-y-3">
      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          Gmail connect failed ({error}). Try again.
        </p>
      )}
      <button
        onClick={handleConnect}
        className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
      >
        Connect Gmail
      </button>
    </div>
  );
}
