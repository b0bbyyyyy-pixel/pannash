'use client';

import { useEffect } from 'react';

/** Small phones that are not iPhone still land on mobile text after login. */
export default function PhoneLanding() {
  useEffect(() => {
    if (window.self !== window.top) return;
    if (document.cookie.includes('gostwrk_m_landing=0')) return;
    if (document.cookie.includes('gostwrk_full_crm=1')) return;
    const iphone = /iPhone|iPod/i.test(navigator.userAgent);
    const narrow = window.matchMedia('(max-width: 430px)').matches;
    if (iphone || narrow) window.location.replace('/m/text');
  }, []);
  return null;
}
