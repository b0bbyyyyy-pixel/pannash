import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign in — Gostwrk',
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link rel="preload" as="image" href="/images/auth/trylon-perisphere-wide.png?v=9" />
      <link rel="preload" as="image" href="/images/auth/trylon-perisphere-water.png?v=9" />
      {children}
    </>
  );
}
