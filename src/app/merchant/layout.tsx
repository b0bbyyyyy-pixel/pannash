import type { Metadata } from 'next';
import './portal.css';

export const metadata: Metadata = {
  title: 'Application portal',
  robots: { index: false, follow: false },
};

export default function MerchantLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="merchant-portal min-h-screen bg-white text-[#111113] antialiased">
      {children}
    </div>
  );
}
