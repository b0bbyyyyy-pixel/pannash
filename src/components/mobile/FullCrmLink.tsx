'use client';

import { openFullCrm } from '@/components/mobile/format';

export default function FullCrmLink() {
  return (
    <button
      type="button"
      onClick={openFullCrm}
      className="block w-full text-center text-[11px] text-[#8E8E93] py-1"
    >
      Open full CRM
    </button>
  );
}
