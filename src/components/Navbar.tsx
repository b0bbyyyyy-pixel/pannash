'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import ManualDialPanel from '@/app/dialer/ManualDialPanel';
import { useWebPhone } from '@/components/webphone/WebPhone';
import BillingClient from '@/app/settings/billing/BillingClient';
import DocumentVault from '@/components/DocumentVault';

interface NavbarProps {
  userName: string;
}

export default function Navbar({ userName }: NavbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [showDropdown, setShowDropdown] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showAgent, setShowAgent] = useState(false);
  const [showBilling, setShowBilling] = useState(false);
  const [showVault, setShowVault] = useState(false);
  const webphone = useWebPhone();

  const isActive = (path: string) => pathname === path || pathname?.startsWith(path + '/');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const openBilling = params.get('billing') === '1';
    const openVault = params.get('vault') === '1';
    if (!openBilling && !openVault) return;
    if (openBilling) setShowBilling(true);
    if (openVault) setShowVault(true);
    params.delete('billing');
    params.delete('vault');
    const q = params.toString();
    router.replace(`${pathname || '/'}${q ? `?${q}` : ''}`, { scroll: false });
  }, [pathname, router]);

  return (
    <nav className="fixed top-0 left-0 right-0 bg-[#fafafa] border-b border-[#e5e5e5] z-50">
      <div className="w-full px-4">
        <div className="flex items-center justify-between h-20">
          {/* Logo - Trylon & Perisphere */}
          <Link href="/inbox" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <img
              src="/images/logo/trylon-perisphere.svg"
              alt="Gostwrk"
              width={40}
              height={40}
              className="w-[40px] h-[40px]"
            />
            <span className="text-xl font-bold text-[#1a1a1a] tracking-tight font-serif">
              Gostwrk
            </span>
          </Link>

          {/* Center Links */}
          <div className="flex items-center space-x-12">
            <Link
              href="/inbox"
              className={`text-sm font-medium transition-colors ${
                isActive('/inbox')
                  ? 'text-[#1a1a1a]'
                  : 'text-[#6b6b6b] hover:text-[#1a1a1a]'
              }`}
            >
              Inbox
            </Link>
            <Link
              href="/leads"
              className={`text-sm font-medium transition-colors ${
                isActive('/leads')
                  ? 'text-[#1a1a1a]'
                  : 'text-[#6b6b6b] hover:text-[#1a1a1a]'
              }`}
            >
              Leads
            </Link>
          </div>

          {/* Right Side - Phone popup + Agent popup + Calendar popup + Settings menu */}
          <div className="relative flex items-center gap-4">
            {/* Phone icon → live keypad popup */}
            <button
              onClick={() => { webphone.dialPadOpen ? webphone.closeDialPad() : webphone.openDialPad(); setShowAgent(false); setShowCalendar(false); setShowBilling(false); setShowVault(false); setShowDropdown(false); }}
              className="focus:outline-none hover:opacity-70 transition-opacity"
              title="Phone"
            >
              <img
                src="/images/icons/phone-handset.png"
                alt="Phone"
                width={18}
                height={18}
                className="w-[18px] h-[18px]"
              />
            </button>

            {/* Agent icon → popup */}
            <button
              onClick={() => { setShowAgent(true); webphone.closeDialPad(); setShowCalendar(false); setShowBilling(false); setShowVault(false); setShowDropdown(false); }}
              className="focus:outline-none hover:opacity-70 transition-opacity"
              title="Agent"
            >
              <img
                src="/images/icons/agent-icon.png"
                alt="Agent"
                width={22}
                height={22}
                className="w-[22px] h-[22px]"
              />
            </button>

            {/* Calendar icon → popup */}
            <button
              onClick={() => { setShowCalendar(true); setShowAgent(false); setShowBilling(false); setShowVault(false); webphone.closeDialPad(); setShowDropdown(false); }}
              className="focus:outline-none hover:opacity-70 transition-opacity"
              title="Calendar"
            >
              <img
                src="/images/icons/calendar-icon.png"
                alt="Calendar"
                width={22}
                height={22}
                className="w-[22px] h-[22px]"
              />
            </button>

            {/* Settings (kanban icon) */}
            <button
              onClick={() => { setShowDropdown(!showDropdown); webphone.closeDialPad(); }}
              className="focus:outline-none hover:opacity-70 transition-opacity"
              title="Settings"
            >
              <img
                src="/images/icons/kanban-icon.png"
                alt="Settings"
                width={22}
                height={22}
                className="w-[22px] h-[22px]"
              />
            </button>

            {/* Settings Dropdown */}
            {showDropdown && (
              <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-[#e5e5e5] rounded-md shadow-lg py-2">
                <Link
                  href="/settings/automation"
                  className="block px-4 py-2.5 text-sm text-[#1a1a1a] hover:bg-[#f5f5f5] transition-colors"
                  onClick={() => setShowDropdown(false)}
                >
                  Automation
                </Link>
                <Link
                  href="/settings/connections"
                  className="block px-4 py-2.5 text-sm text-[#1a1a1a] hover:bg-[#f5f5f5] transition-colors"
                  onClick={() => setShowDropdown(false)}
                >
                  Email & Phone Connectors
                </Link>
                <button
                  type="button"
                  className="block w-full text-left px-4 py-2.5 text-sm text-[#1a1a1a] hover:bg-[#f5f5f5] transition-colors"
                  onClick={() => {
                    setShowBilling(true);
                    setShowVault(false);
                    setShowDropdown(false);
                    setShowAgent(false);
                    setShowCalendar(false);
                    webphone.closeDialPad();
                  }}
                >
                  Billing
                </button>
                <button
                  type="button"
                  className="block w-full text-left px-4 py-2.5 text-sm text-[#1a1a1a] hover:bg-[#f5f5f5] transition-colors"
                  onClick={() => {
                    setShowVault(true);
                    setShowBilling(false);
                    setShowDropdown(false);
                    setShowAgent(false);
                    setShowCalendar(false);
                    webphone.closeDialPad();
                  }}
                >
                  Document Vault
                </button>
                <Link
                  href="/settings/profile"
                  className="block px-4 py-2.5 text-sm text-[#1a1a1a] hover:bg-[#f5f5f5] transition-colors"
                  onClick={() => setShowDropdown(false)}
                >
                  User Profile
                </Link>
                <Link
                  href="/settings/timezone"
                  className="block px-4 py-2.5 text-sm text-[#1a1a1a] hover:bg-[#f5f5f5] transition-colors"
                  onClick={() => setShowDropdown(false)}
                >
                  Timezone
                </Link>
                <hr className="my-2 border-[#e5e5e5]" />
                <button
                  onClick={async () => {
                    try {
                      const res = await fetch('/api/auth/signout', {
                        method: 'POST',
                        credentials: 'include',
                      });
                      if (res.redirected) {
                        window.location.href = res.url;
                      } else {
                        router.push('/auth');
                      }
                    } catch (error) {
                      console.error('Sign out error:', error);
                      router.push('/auth');
                    }
                  }}
                  className="w-full text-left px-4 py-2.5 text-sm text-[#6b6b6b] hover:bg-[#f5f5f5] hover:text-[#1a1a1a] transition-colors"
                >
                  Sign Out
                </button>
                <div className="px-4 py-2.5 text-sm font-bold text-[#1a1a1a] capitalize border-t border-[#f0f0f0] mt-1">
                  {userName}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Phone keypad popup — live WebRTC pad, same Device as Dialer */}
      {webphone.dialPadOpen && (
        <>
          <div
            className="fixed inset-0 z-[80]"
            onClick={() => webphone.closeDialPad()}
          />
          <div
            className="fixed top-24 left-1/2 -translate-x-1/2 z-[81] w-[min(92vw,340px)]"
            onClick={(e) => e.stopPropagation()}
          >
            <ManualDialPanel
              onClose={() => webphone.closeDialPad()}
              initialNumber={webphone.dialPadNumber}
              className="shadow-2xl"
            />
          </div>
        </>
      )}

      {/* Agent popup overlay */}
      {showAgent && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 z-[80]"
            onClick={() => setShowAgent(false)}
          />
          {/* Panel */}
          <div
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[81] flex flex-col rounded-xl shadow-2xl overflow-hidden"
            style={{ width: 'min(92vw, 1200px)', height: 'calc(100vh - 2rem)' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-[#e5e5e5] flex-shrink-0">
              <span className="text-xs text-[#6b6b6b] font-medium">Agent</span>
              <div className="flex items-center gap-3">
                <a
                  href="/agent"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#6b6b6b] hover:text-[#1a1a1a] text-xs flex items-center gap-1 transition-colors"
                  title="Open in full page"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  Full page
                </a>
                <button
                  onClick={() => setShowAgent(false)}
                  className="text-[#6b6b6b] hover:text-[#1a1a1a] transition-colors p-1 rounded hover:bg-[#f5f5f5]"
                  title="Close"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            {/* iframe */}
            <iframe
              src="/agent?modal=1"
              className="flex-1 w-full bg-white border-0"
              title="Agent"
            />
          </div>
        </>
      )}

      {showVault && (
        <DocumentVault onClose={() => setShowVault(false)} />
      )}

      {/* Billing popup — stays on the current page */}
      {showBilling && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-[80]"
            onClick={() => setShowBilling(false)}
          />
          <div
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[81] bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between px-6 py-4 border-b border-[#f0f0f0] shrink-0">
              <div>
                <h3 className="font-bold text-[#1a1a1a]">Billing</h3>
                <p className="text-xs text-[#6b6b6b] mt-0.5">Remaining Twilio and xAI credits</p>
              </div>
              <button
                type="button"
                onClick={() => setShowBilling(false)}
                className="text-[#9b9b9b] hover:text-[#1a1a1a] transition-colors p-1 rounded hover:bg-[#f5f5f5]"
                title="Close"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-5 overflow-y-auto">
              <BillingClient />
            </div>
          </div>
        </>
      )}

      {/* Calendar popup overlay */}
      {showCalendar && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 z-[80]"
            onClick={() => setShowCalendar(false)}
          />
          {/* Panel */}
          <div
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[81] flex flex-col rounded-xl shadow-2xl overflow-hidden"
            style={{ width: 'min(92vw, 1200px)', height: 'calc(100vh - 2rem)' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-[#e5e5e5] flex-shrink-0">
              <span className="text-xs text-[#6b6b6b] font-medium">Calendar</span>
              <div className="flex items-center gap-3">
                <a
                  href="/calendar"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#6b6b6b] hover:text-[#1a1a1a] text-xs flex items-center gap-1 transition-colors"
                  title="Open in full page"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  Full page
                </a>
                <button
                  onClick={() => setShowCalendar(false)}
                  className="text-[#6b6b6b] hover:text-[#1a1a1a] transition-colors p-1 rounded hover:bg-[#f5f5f5]"
                  title="Close"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            {/* iframe */}
            <iframe
              src="/calendar?modal=1"
              className="flex-1 w-full bg-white border-0"
              title="Calendar"
            />
          </div>
        </>
      )}
    </nav>
  );
}
