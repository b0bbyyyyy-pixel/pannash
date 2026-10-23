'use client';

export default function GmailConnectButton({
  error,
  kind = 'send',
  label,
}: {
  error?: string | null;
  kind?: 'send' | 'read';
  label?: string;
}) {
  const handleConnect = () => {
    window.location.href = `/api/auth/google?kind=${kind}&redirect=/settings/connections`;
  };

  return (
    <div className="space-y-3">
      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error === 'run_read_sql'
            ? 'Run add-email-read-connections.sql in Supabase, then connect Gmail read again.'
            : `Gmail connect failed (${error}). Try again.`}
        </p>
      )}
      <button
        onClick={handleConnect}
        className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
      >
        {label || (kind === 'read' ? 'Connect Gmail (read inbox)' : 'Connect Gmail (send)')}
      </button>
    </div>
  );
}
