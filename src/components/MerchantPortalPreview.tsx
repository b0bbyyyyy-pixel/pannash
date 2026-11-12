'use client';

import { useEffect, useState } from 'react';

export default function MerchantPortalPreview({
  leadId,
  refreshKey,
}: {
  leadId: string;
  refreshKey?: string | number;
}) {
  const [mode, setMode] = useState<'phone' | 'computer'>('phone');
  const [fullPage, setFullPage] = useState(false);
  const src = `/merchant/preview?leadId=${encodeURIComponent(leadId)}&t=${encodeURIComponent(String(refreshKey ?? ''))}`;

  useEffect(() => {
    if (!fullPage) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullPage(false);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [fullPage]);

  return (
    <div className="mb-5 rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Merchant view</h3>
          <p className="text-xs text-gray-500">Exactly what they see on their phone or computer.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-lg border border-[#e5e5e5]">
            <button
              type="button"
              onClick={() => setMode('phone')}
              className={`px-3 py-1.5 text-xs font-medium ${mode === 'phone' ? 'bg-[#1a1a1a] text-white' : 'bg-white text-[#1a1a1a] hover:bg-[#f5f5f5]'}`}
            >
              Phone
            </button>
            <button
              type="button"
              onClick={() => setMode('computer')}
              className={`px-3 py-1.5 text-xs font-medium border-l border-[#e5e5e5] ${mode === 'computer' ? 'bg-[#1a1a1a] text-white' : 'bg-white text-[#1a1a1a] hover:bg-[#f5f5f5]'}`}
            >
              Computer
            </button>
          </div>
          <button
            type="button"
            onClick={() => setFullPage(true)}
            className="rounded-lg border border-[#e5e5e5] bg-white px-3 py-1.5 text-xs font-medium text-[#1a1a1a] hover:bg-[#f5f5f5]"
          >
            Open full page
          </button>
        </div>
      </div>

      {mode === 'phone' ? (
        <div className="flex justify-center py-2">
          <div className="w-[390px] max-w-full overflow-hidden rounded-[2.4rem] border-[10px] border-[#1a1a1a] bg-[#1a1a1a] shadow-xl">
            <div className="flex h-6 items-start justify-center bg-[#1a1a1a]">
              <div className="mt-1.5 h-1.5 w-20 rounded-full bg-[#3a3a3a]" />
            </div>
            <iframe
              title="Merchant phone preview"
              src={src}
              className="h-[680px] w-full border-0 bg-[#fdfdfd]"
            />
            <div className="flex h-5 items-end justify-center bg-[#1a1a1a]">
              <div className="mb-1.5 h-1 w-28 rounded-full bg-[#3a3a3a]" />
            </div>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-[#e5e5e5] bg-white">
          <div className="flex items-center gap-2 border-b border-[#e5e5e5] bg-[#f5f5f5] px-3 py-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#e5e5e5]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#e5e5e5]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#e5e5e5]" />
            <span className="ml-2 text-[11px] text-[#9b9b9b]">Application portal</span>
          </div>
          <iframe
            title="Merchant computer preview"
            src={src}
            className="h-[720px] w-full border-0 bg-[#fdfdfd]"
          />
        </div>
      )}

      {fullPage && (
        <div className="fixed inset-0 z-[90] flex flex-col bg-[#fdfdfd]">
          <div className="flex flex-shrink-0 items-center justify-between border-b border-[#e5e5e5] bg-white px-4 py-2.5">
            <p className="text-xs font-medium text-[#6b6b6b]">Computer view — what the merchant sees full page</p>
            <button
              type="button"
              onClick={() => setFullPage(false)}
              className="rounded-md border border-[#e5e5e5] px-3 py-1.5 text-xs font-medium text-[#1a1a1a] hover:bg-[#f5f5f5]"
            >
              Close
            </button>
          </div>
          <iframe
            title="Merchant full page preview"
            src={src}
            className="min-h-0 w-full flex-1 border-0 bg-[#fdfdfd]"
          />
        </div>
      )}
    </div>
  );
}
