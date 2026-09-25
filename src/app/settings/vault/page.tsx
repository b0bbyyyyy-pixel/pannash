'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Document vault is a navbar popup. This URL just sends you back and opens it. */
export default function VaultSettingsPage() {
  const router = useRouter();

  useEffect(() => {
    let target = '/inbox?vault=1';
    try {
      const ref = document.referrer ? new URL(document.referrer) : null;
      if (ref && ref.origin === window.location.origin && !ref.pathname.startsWith('/settings/vault')) {
        const params = new URLSearchParams(ref.search);
        params.set('vault', '1');
        target = `${ref.pathname}?${params.toString()}`;
      }
    } catch {
      /* stay on inbox */
    }
    router.replace(target);
  }, [router]);

  return null;
}
