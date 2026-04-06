import Link from 'next/link';

export default function ContactPage() {
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
          <Link
            href="/auth"
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
          >
            Sign In
          </Link>
        </div>
      </header>

      {/* Contact Content */}
      <main className="max-w-3xl mx-auto px-6 py-16">
        {/* Headline */}
        <h1 className="text-4xl font-bold text-gray-900 mb-4 text-center">
          Gostwrk Support
        </h1>

        {/* Subheadline */}
        <p className="text-xl text-gray-600 mb-12 text-center leading-relaxed">
          Contact our team for customer support and assistance.
        </p>

        {/* Contact Info Card */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 mb-8">
          {/* Main Contact Text */}
          <p className="text-lg text-gray-700 mb-6 text-center leading-relaxed">
            For questions or support, text or call:
          </p>

          {/* Phone Number */}
          <div className="text-center mb-8">
            <a 
              href="tel:+16318922787" 
              className="text-3xl font-bold text-gray-900 hover:text-gray-700 transition-colors inline-block"
            >
              (631) 892-2787
            </a>
          </div>

          {/* SMS Disclosure */}
          <div className="border-t border-gray-300 pt-6">
            <div className="bg-white border border-gray-200 rounded-lg p-6 text-sm text-gray-700 leading-relaxed space-y-3">
              <p>
                <strong>By texting this number</strong>, you agree to receive conversational SMS messages from Gostwrk related to your inquiry or customer support request.
              </p>
              <p>
                Message frequency varies. Message and data rates may apply.
              </p>
              <p>
                <strong>Reply STOP</strong> to opt out at any time.
              </p>
              <p>
                <strong>Reply HELP</strong> for assistance.
              </p>
            </div>
          </div>
        </div>

        {/* Policy Links */}
        <div className="flex flex-col sm:flex-row justify-center gap-4 mb-12">
          <Link
            href="/privacy"
            className="px-6 py-3 bg-white border-2 border-gray-900 text-gray-900 font-semibold rounded-lg hover:bg-gray-900 hover:text-white transition-all text-center"
          >
            Privacy Policy
          </Link>
          <Link
            href="/terms"
            className="px-6 py-3 bg-white border-2 border-gray-900 text-gray-900 font-semibold rounded-lg hover:bg-gray-900 hover:text-white transition-all text-center"
          >
            Terms & Conditions
          </Link>
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
              <Link href="/privacy" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                Privacy Policy
              </Link>
              <Link href="/terms" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                Terms & Conditions
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
