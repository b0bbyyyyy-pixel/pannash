'use client';

export default function GmailButton() {
  const handleGmailConnect = () => {
    window.location.href = '/api/auth/google';
  };

  return (
    <button
      onClick={handleGmailConnect}
      className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
    >
      Connect Gmail
    </button>
  );
}
