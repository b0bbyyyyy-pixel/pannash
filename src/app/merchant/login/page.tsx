import MerchantLoginForm from './MerchantLoginForm';

export const dynamic = 'force-dynamic';

export default function MerchantLoginPage() {
  return (
    <div className="min-h-screen bg-[#fdfdfd] px-5 py-16 text-[#1a1a1a]">
      <div className="mx-auto max-w-md rounded-xl border border-[#e5e5e5] bg-white p-6">
        <h1 className="text-xl font-semibold">Application portal</h1>
        <p className="mt-2 text-sm text-[#6b6b6b]">
          Email me a new link to open your private application page.
        </p>
        <MerchantLoginForm />
      </div>
    </div>
  );
}
