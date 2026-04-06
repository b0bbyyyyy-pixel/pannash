import Link from 'next/link';

export default function PrivacyPage() {
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

      {/* Privacy Policy Content */}
      <main className="max-w-4xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-bold text-gray-900 mb-3">Privacy Policy – Gostwrk</h1>
        <p className="text-sm text-gray-600 mb-12">Effective Date: February 22, 2026</p>

        <div className="prose prose-lg max-w-none space-y-8">
          <section>
            <p className="text-gray-700 leading-relaxed">
              Gostwrk respects your privacy and is committed to protecting your personal information. This Privacy Policy explains how we collect, use, and safeguard information when you communicate with us.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Information We Collect</h2>
            <p className="text-gray-700 mb-3">We may collect the following information when you contact us:</p>
            <ul className="list-disc pl-6 space-y-2 text-gray-700">
              <li>Name</li>
              <li>Phone number</li>
              <li>Business contact information</li>
              <li>Any information you voluntarily provide during communication</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">How We Use Information</h2>
            <p className="text-gray-700 mb-3">We use this information to:</p>
            <ul className="list-disc pl-6 space-y-2 text-gray-700">
              <li>Respond to inquiries</li>
              <li>Provide requested information or services</li>
              <li>Conduct customer support and follow-up communication</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">SMS Communications</h2>
            <p className="text-gray-700 mb-3">
              By providing your phone number or initiating contact, you consent to receive conversational SMS messages from Gostwrk related to your inquiry or request.
            </p>
            <p className="text-gray-700 mb-3">
              Message frequency varies.<br />
              Message and data rates may apply.
            </p>
            <p className="text-gray-700">
              You can opt out at any time by replying STOP.<br />
              You can reply HELP for assistance.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Data Sharing</h2>
            <p className="text-gray-700 mb-3">
              Gostwrk does not sell, rent, or share your personal information with third parties for marketing or promotional purposes.
            </p>
            <p className="text-gray-700">
              Information may only be shared with service providers necessary to operate our communication services.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Data Security</h2>
            <p className="text-gray-700">
              We take reasonable measures to protect your information from unauthorized access or disclosure.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Contact</h2>
            <p className="text-gray-700">
              For questions about this Privacy Policy, contact:
            </p>
            <p className="text-gray-900 font-medium mt-2">
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
