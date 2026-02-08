'use client';

export default function StartOutreachButton() {
  return (
    <div className="bg-white rounded-lg shadow p-8 mb-8">
      <h3 className="text-2xl font-bold mb-6">Start Outreach</h3>
      <button
        onClick={async () => {
          alert('Email outreach coming soon! This will send gentle initial emails to your leads at a human pace.');
          // Later: call API route to queue and send emails
        }}
        className="px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
      >
        Send Initial Outreach to All Leads
      </button>
      <p className="mt-4 text-gray-600 text-sm">
        Emails will be sent slowly (1 every few minutes, business hours only) to feel natural and avoid spam filters.
      </p>
    </div>
  );
}
