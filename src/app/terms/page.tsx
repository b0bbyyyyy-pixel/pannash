import Link from 'next/link';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-200 py-6">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-4 hover:opacity-80 transition-opacity">
            <img
              src="/images/logo/gostwrk-logo-gray.svg"
              alt="Gostwrk"
              width={48}
              height={48}
              className="w-12 h-12"
            />
            <h1 className="text-2xl font-bold text-gray-900">Gostwrk</h1>
          </Link>
          <div className="flex gap-4">
            <Link
              href="/contact"
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
            >
              Contact
            </Link>
            <Link
              href="/auth"
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
            >
              Sign In
            </Link>
          </div>
        </div>
      </header>

      {/* Terms Content */}
      <main className="max-w-4xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-bold text-gray-900 mb-3">Terms & Conditions – Gostwrk Messaging</h1>
        <p className="text-sm text-gray-600 mb-12">Effective Date: February 22, 2026</p>

        <div className="prose prose-lg max-w-none space-y-8">
          <section>
            <p className="text-gray-700 leading-relaxed">
              By contacting Gostwrk or providing your phone number, you agree to receive SMS messages under the following terms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Messaging Program</h2>
            <p className="text-gray-700 mb-3">
              Gostwrk provides conversational SMS messaging for individuals who contact us regarding customer support and assistance.
            </p>
            <p className="text-gray-700">
              Messages may include responses to inquiries, requested information, and follow-up communication related to your request.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Message Frequency</h2>
            <p className="text-gray-700">
              Message frequency varies depending on the conversation.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Message and Data Rates</h2>
            <p className="text-gray-700">
              Message and data rates may apply based on your mobile carrier plan.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Opt-Out Instructions</h2>
            <p className="text-gray-700">
              You may opt out of receiving SMS messages at any time by replying STOP.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Help Instructions</h2>
            <p className="text-gray-700">
              For assistance, reply HELP or contact <a href="mailto:support@gostwrk.com" className="text-gray-900 font-medium hover:underline">support@gostwrk.com</a>.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Consent</h2>
            <p className="text-gray-700">
              By contacting Gostwrk or texting our business number, you consent to receive conversational SMS messages related to your inquiry.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Privacy</h2>
            <p className="text-gray-700">
              For information on how your data is handled, please review our <Link href="/privacy" className="text-gray-900 font-medium hover:underline">Privacy Policy</Link>.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Service Availability</h2>
            <p className="text-gray-700">
              Gostwrk is not responsible for delays or undelivered messages caused by carrier or network issues.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Contact</h2>
            <p className="text-gray-900 font-medium">
              <a href="mailto:support@gostwrk.com" className="hover:underline">support@gostwrk.com</a>
            </p>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-8 mt-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="text-sm text-gray-500">
              © 2026 Gostwrk. All rights reserved.
            </div>
            <div className="flex gap-6">
              <Link href="/" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                Home
              </Link>
              <Link href="/contact" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                Contact
              </Link>
              <Link href="/privacy" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                Privacy Policy
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
