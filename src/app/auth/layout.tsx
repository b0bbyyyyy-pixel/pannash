import type { Metadata } from 'next';
import { Cinzel } from 'next/font/google';

const cinzel = Cinzel({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-auth-fair',
});

export const metadata: Metadata = {
  title: 'Sign in — Gostwrk',
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${cinzel.variable} ${cinzel.className}`}>
      <link rel="preload" as="image" href="/images/auth/trylon-perisphere-wide.png?v=4" />
      {children}
    </div>
  );
}
