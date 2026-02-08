'use client';

export default function TestEmailButton({ userEmail }: { userEmail: string }) {
  return (
    <div className="bg-white rounded-lg shadow p-8 mb-8">
      <h3 className="text-xl font-bold mb-4">Test Email Sending</h3>
      <button
        onClick={async () => {
          try {
            const response = await fetch('/api/test-email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ to: 'bobbygulinello@gmail.com' }),
            });
            const result = await response.json();

            if (response.ok) {
              alert('Test email sent successfully! Check your inbox.');
            } else {
              alert('Error: ' + (result.error || 'Unknown error'));
            }
          } catch (err: any) {
            alert('Failed to send: ' + (err.message || 'Unknown error'));
          }
        }}
        className="px-6 py-3 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors"
      >
        Send Test Email to Myself
      </button>
      <p className="mt-3 text-sm text-gray-600">
        This will send a test email to <strong>bobbygulinello@gmail.com</strong> using Resend.
      </p>
    </div>
  );
}
