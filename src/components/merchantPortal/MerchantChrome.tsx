'use client';

import { useState } from 'react';
import BrandMark from './BrandMark';
import {
  IconApps,
  IconClock,
  IconDocs,
  IconHome,
  IconMail,
  IconMenu,
  IconShield,
  IconSignOut,
  IconUser,
} from './icons';

export type PortalScreen =
  | 'dashboard'
  | 'applications'
  | 'documents'
  | 'approvals'
  | 'profile'
  | 'messages';

const SIDEBAR: { id: PortalScreen; label: string; icon: typeof IconHome }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: IconHome },
  { id: 'applications', label: 'Applications', icon: IconApps },
  { id: 'approvals', label: 'Approvals', icon: IconClock },
  { id: 'messages', label: 'Messages', icon: IconMail },
  { id: 'documents', label: 'Documents', icon: IconDocs },
  { id: 'profile', label: 'Profile', icon: IconUser },
];

const TOP: PortalScreen[] = ['dashboard', 'applications', 'documents'];
const BOTTOM: { id: PortalScreen; label: string; icon: typeof IconHome }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: IconHome },
  { id: 'documents', label: 'Documents', icon: IconDocs },
  { id: 'approvals', label: 'Approvals', icon: IconClock },
  { id: 'profile', label: 'Profile', icon: IconUser },
];

export function DesktopTopNav({
  brandName,
  logoUrl,
  screen,
  onScreen,
  onSignOut,
}: {
  brandName: string;
  logoUrl?: string | null;
  screen: PortalScreen;
  onScreen: (screen: PortalScreen) => void;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <header className="hidden border-b border-[#e5e5e5] bg-white md:block">
      <div className="mx-auto flex h-[72px] max-w-6xl items-center justify-between px-8">
        <BrandMark name={brandName} logoUrl={logoUrl} />
        <nav className="flex h-full items-center gap-8 text-sm">
          {TOP.map(id => (
            <button
              key={id}
              type="button"
              onClick={() => onScreen(id)}
              className={`flex h-full items-center border-b-2 capitalize ${
                screen === id
                  ? 'border-[#111113] font-semibold text-[#111113]'
                  : 'border-transparent text-[#8a8a8a] hover:text-[#111113]'
              }`}
            >
              {id}
            </button>
          ))}
        </nav>
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen(v => !v)}
            className="inline-flex items-center gap-2 text-sm text-[#3d3d3d]"
          >
            <IconUser className="h-5 w-5" />
            Business Account
            <span className="text-[10px]">▾</span>
          </button>
          {open && (
            <div className="absolute right-0 z-20 mt-2 w-44 rounded-xl border border-[#e5e5e5] bg-white py-1 shadow-[0_8px_24px_rgba(17,17,19,0.08)]">
              <button type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-[#fafafa]" onClick={() => { setOpen(false); onScreen('profile'); }}>
                Profile
              </button>
              <button type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-[#fafafa]" onClick={() => { setOpen(false); onSignOut(); }}>
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export function DesktopSidebar({
  brandName,
  logoUrl,
  screen,
  onScreen,
  onSignOut,
}: {
  brandName: string;
  logoUrl?: string | null;
  screen: PortalScreen;
  onScreen: (screen: PortalScreen) => void;
  onSignOut: () => void;
}) {
  return (
    <aside className="hidden w-[220px] shrink-0 flex-col border-r border-[#e5e5e5] bg-white px-4 py-6 md:flex">
      <div className="px-2">
        <BrandMark name={brandName} logoUrl={logoUrl} size="sm" />
      </div>
      <nav className="mt-8 flex flex-1 flex-col gap-1">
        {SIDEBAR.map(item => {
          const active = screen === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onScreen(item.id)}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${
                active ? 'bg-[#f4f4f4] font-medium text-[#111113]' : 'text-[#3d3d3d] hover:bg-[#fafafa]'
              }`}
            >
              <Icon className="h-[18px] w-[18px]" />
              {item.label}
            </button>
          );
        })}
      </nav>
      <div className="border-t border-[#e5e5e5] pt-4">
        <p className="flex items-center gap-2 px-3 py-2 text-xs text-[#6b6b6b]">
          <IconShield className="h-4 w-4" />
          Secure & Confidential
        </p>
        <button
          type="button"
          onClick={onSignOut}
          className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-[#3d3d3d] hover:bg-[#fafafa]"
        >
          <IconSignOut className="h-[18px] w-[18px]" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}

export function MobileHeader({
  brandName,
  logoUrl,
  onScreen,
  onSignOut,
}: {
  brandName: string;
  logoUrl?: string | null;
  onScreen: (screen: PortalScreen) => void;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-20 border-b border-[#e5e5e5] bg-white md:hidden">
      <div className="flex h-14 items-center justify-between px-4">
        <BrandMark name={brandName} logoUrl={logoUrl} size="sm" />
        <button type="button" aria-label="Menu" onClick={() => setOpen(v => !v)} className="p-1">
          <IconMenu className="h-6 w-6" />
        </button>
      </div>
      {open && (
        <div className="border-t border-[#e5e5e5] bg-white px-2 py-2">
          {SIDEBAR.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => { setOpen(false); onScreen(item.id); }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm"
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => { setOpen(false); onSignOut(); }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm"
          >
            <IconSignOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      )}
    </header>
  );
}

export function MobileBottomNav({
  screen,
  onScreen,
}: {
  screen: PortalScreen;
  onScreen: (screen: PortalScreen) => void;
}) {
  return (
    <nav className="sticky bottom-0 z-20 border-t border-[#e5e5e5] bg-white md:hidden">
      <div className="grid grid-cols-4">
        {BOTTOM.map(item => {
          const active = screen === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onScreen(item.id)}
              className={`flex flex-col items-center gap-1 py-2.5 text-[11px] ${
                active ? 'font-semibold text-[#111113]' : 'text-[#8a8a8a]'
              }`}
            >
              <Icon className="h-5 w-5" />
              {item.label}
              {active && <span className="h-0.5 w-8 rounded-full bg-[#111113]" />}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
