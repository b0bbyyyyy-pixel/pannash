'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import { DialerCard, CampaignPickerModal } from '@/app/dialer/DialerClient';
import { useDialerSession } from '@/app/dialer/useDialerSession';

const ScheduleEmailModal = dynamic(() => import('@/components/ScheduleEmailModal'), { ssr: false });

export default function InboxDialer() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);
  const {
    state, lead, error, setError,
    activeCampaign, showPicker, setShowPicker,
    testMode, toggleTestMode, showCallCount, setShowCallCount,
    showEmailModal, setShowEmailModal,
    webphone, campaignPct, claimNext,
    handleLoadCampaign, handleClearCampaign,
    handleCall, handleHangup, handleDisposition, setLead,
  } = useDialerSession();

  return (
    <div className="flex-shrink-0 bg-white border-b border-[#e5e5e5]">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-[#fafafa] transition-colors"
      >
        <span className="text-xs font-medium text-[#6b6b6b]">Dialer</span>
        <svg
          className={`w-3.5 h-3.5 text-[#6b6b6b] transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div>
          <div className="flex flex-wrap items-center justify-end gap-x-1.5 gap-y-1 pl-6 pr-3 pb-2">
            <button
              onClick={toggleTestMode}
              title="Test mode — Call skips the real phone dial"
              className="flex items-center gap-1 shrink-0"
            >
              <span className={`text-[9px] ${testMode ? 'text-[#1a1a1a] font-medium' : 'text-[#c4c4c4]'}`}>Test</span>
              <span className={`relative inline-block w-5 h-3 rounded-full transition-colors ${testMode ? 'bg-[#1a1a1a]' : 'bg-[#e5e5e5]'}`}>
                <span className={`absolute top-0.5 w-2 h-2 rounded-full bg-white transition-all ${testMode ? 'left-2.5' : 'left-0.5'}`} />
              </span>
            </button>
            {activeCampaign && (
              <button
                onClick={() => setShowCallCount(v => !v)}
                className="flex items-center gap-1 min-w-0"
              >
                <span className="text-[9px] font-semibold text-[#1a1a1a] truncate max-w-[72px]">{activeCampaign.name}</span>
                <div className="w-10 h-0.5 bg-[#f0f0f0] rounded-full overflow-hidden shrink-0">
                  <div className="h-full bg-[#1a1a1a] rounded-full" style={{ width: `${campaignPct}%` }} />
                </div>
                <span className="text-[9px] text-[#9ca3af] shrink-0">
                  {showCallCount ? `${activeCampaign.called}/${activeCampaign.total}` : `${campaignPct}%`}
                </span>
              </button>
            )}
            <button
              onClick={() => setShowPicker(true)}
              className="text-[9px] font-medium text-[#1a1a1a] hover:text-[#555]"
            >
              {activeCampaign ? 'Switch' : 'Load'}
            </button>
            {activeCampaign && (
              <button
                onClick={handleClearCampaign}
                className="text-[9px] text-[#9ca3af] hover:text-[#1a1a1a]"
              >
                Clear
              </button>
            )}
          </div>

          {error && (
            <p className="px-3 pb-2 text-[11px] text-red-600">
              {error}
              <button onClick={() => setError(null)} className="ml-2 text-red-400">✕</button>
            </p>
          )}

          {state === 'loading' ? (
            <div className="px-4 py-8 flex flex-col items-center justify-center">
              <div className="w-6 h-6 border-2 border-[#e5e5e5] border-t-[#1a1a1a] rounded-full animate-spin mb-2" />
              <p className="text-[11px] text-[#9ca3af]">Loading next lead…</p>
            </div>
          ) : state === 'empty' ? (
            <div className="px-4 py-6 text-center">
              <p className="text-sm font-medium text-[#1a1a1a]">Queue&apos;s clear</p>
              <button
                onClick={() => claimNext(null)}
                className="mt-2 text-xs text-[#6b6b6b] hover:text-[#1a1a1a] underline"
              >
                Check again
              </button>
            </div>
          ) : lead && (state === 'ready' || state === 'on_call' || state === 'wrap_up' || state === 'saving') ? (
            <DialerCard
              lead={lead}
              view={state === 'on_call' ? 'on_call' : state === 'ready' ? 'idle' : 'wrap'}
              onCall={handleCall}
              phoneStatus={webphone.status}
              onHangup={handleHangup}
              onSave={handleDisposition}
              saving={state === 'saving'}
              onEmailSaved={(email) => setLead(prev => prev ? { ...prev, email } : prev)}
              onQuickEmail={() => setShowEmailModal(true)}
              compact
              className="!rounded-none !border-0 !border-t !border-[#f0f0f0] !shadow-none !p-4"
            />
          ) : null}
        </div>
      )}

      {showPicker && (
        <CampaignPickerModal
          onSelect={handleLoadCampaign}
          onClose={() => setShowPicker(false)}
        />
      )}

      {showEmailModal && lead && (
        <ScheduleEmailModal
          lead={{
            id: lead.id,
            name: lead.name,
            email: lead.email,
            company: lead.company,
          }}
          onClose={() => setShowEmailModal(false)}
        />
      )}
    </div>
  );
}
