'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

interface NavbarProps {
  userName: string;
}

export default function Navbar({ userName }: NavbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [showDropdown, setShowDropdown] = useState(false);

  const isActive = (path: string) => pathname === path || pathname?.startsWith(path + '/');

  return (
    <nav className="fixed top-0 left-0 right-0 bg-[#fafafa] border-b border-[#e5e5e5] z-50">
      <div className="max-w-[1600px] mx-auto px-12">
        <div className="flex items-center justify-between h-20">
          {/* Logo - Gray Ghost */}
          <Link href="/dashboard" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <img
              src="/images/logo/gostwrk-logo-gray.svg"
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
              href="/dashboard"
              className={`text-sm font-medium transition-colors ${
                isActive('/dashboard')
                  ? 'text-[#1a1a1a]'
                  : 'text-[#6b6b6b] hover:text-[#1a1a1a]'
              }`}
            >
              Dashboard
            </Link>
            <Link
              href="/campaigns"
              className={`text-sm font-medium transition-colors ${
                isActive('/campaigns')
                  ? 'text-[#1a1a1a]'
                  : 'text-[#6b6b6b] hover:text-[#1a1a1a]'
              }`}
            >
              Campaigns
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

          {/* Right Side - User Menu with Gear Icon */}
          <div className="relative">
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="flex items-center space-x-2 text-sm focus:outline-none hover:opacity-70 transition-opacity"
            >
              <span className="font-medium text-[#1a1a1a] capitalize">
                {userName}
              </span>
              <svg
                className="w-5 h-5 text-[#6b6b6b]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </button>

            {/* Settings Dropdown */}
            {showDropdown && (
              <div className="absolute right-0 mt-2 w-56 bg-white border border-[#e5e5e5] rounded-md shadow-lg py-2">
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
                <Link
                  href="/settings/billing"
                  className="block px-4 py-2.5 text-sm text-[#1a1a1a] hover:bg-[#f5f5f5] transition-colors"
                  onClick={() => setShowDropdown(false)}
                >
                  Billing
                </Link>
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
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
