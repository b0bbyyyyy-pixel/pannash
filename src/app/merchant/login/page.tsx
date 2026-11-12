import MerchantLoginForm from './MerchantLoginForm';

export const dynamic = 'force-dynamic';

export default function MerchantLoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-5 py-16 text-[#111113]">
      <div className="w-full max-w-md rounded-xl border border-[#e5e5e5] bg-white p-7 shadow-[0_1px_2px_rgba(17,17,19,0.04)]">
        <h1 className="text-2xl font-semibold tracking-tight">Application portal</h1>
        <p className="mt-2 text-sm text-[#6b6b6b]">
          Email me a new link to open your private application page.
        </p>
        <MerchantLoginForm />
      </div>
    </div>
  );
}
