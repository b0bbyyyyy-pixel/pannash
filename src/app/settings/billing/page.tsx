'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Billing is a navbar popup. This URL just sends you back and opens it. */
export default function BillingPage() {
  const router = useRouter();

  useEffect(() => {
    let target = '/inbox?billing=1';
    try {
      const ref = document.referrer ? new URL(document.referrer) : null;
      if (ref && ref.origin === window.location.origin && !ref.pathname.startsWith('/settings/billing')) {
        const params = new URLSearchParams(ref.search);
        params.set('billing', '1');
        target = `${ref.pathname}?${params.toString()}`;
      }
    } catch {
      /* stay on inbox */
    }
    router.replace(target);
  }, [router]);

  return null;
}
