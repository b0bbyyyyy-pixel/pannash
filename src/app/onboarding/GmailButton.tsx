'use client';

export default function GmailButton() {
  const handleGmailConnect = () => {
    window.location.href = '/api/auth/google';
  };

  return (
    <button
      onClick={handleGmailConnect}
      className="w-full px-6 py-3 bg-[#5a7fc7] text-white rounded-md font-medium hover:bg-[#4a6fb7] transition-colors"
    >
      Connect Gmail
    </button>
  );
}
