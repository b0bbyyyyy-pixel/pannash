'use client';

export default function GmailConnectButton() {
  const handleConnect = () => {
    window.location.href = '/api/auth/google';
  };

  return (
    <button
      onClick={handleConnect}
      className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
    >
      Connect Gmail
    </button>
  );
}
