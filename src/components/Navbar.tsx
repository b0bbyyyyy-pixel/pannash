'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

interface NavbarProps {
  userName: string;
}

export default function Navbar({ userName }: NavbarProps) {
  const pathname = usePathname();
  const [showDropdown, setShowDropdown] = useState(false);

  const isActive = (path: string) => pathname === path || pathname?.startsWith(path + '/');

  return (
    <nav className="fixed top-0 left-0 right-0 bg-white border-b border-[#E0E0E0] z-50">
      <div className="max-w-[1400px] mx-auto px-8">
        <div className="flex items-center justify-between h-20">
          {/* Logo - Crimson Text */}
          <Link href="/campaigns" className="font-serif text-3xl font-bold text-[#001F3F] hover:text-[#8A9A5B] transition-colors">
            Gostwrk.io
          </Link>

          {/* Center Links */}
          <div className="flex items-center space-x-10">
            <Link
              href="/campaigns"
              className={`text-sm font-medium transition-colors ${
                isActive('/campaigns')
                  ? 'text-[#000000] border-b-2 border-[#001F3F] pb-1'
                  : 'text-[#4A4A4A] hover:text-[#722F37]'
              }`}
            >
              Campaigns
            </Link>
            <Link
              href="/leads"
              className={`text-sm font-medium transition-colors ${
                isActive('/leads')
                  ? 'text-[#000000] border-b-2 border-[#001F3F] pb-1'
                  : 'text-[#4A4A4A] hover:text-[#722F37]'
              }`}
            >
              Leads
            </Link>
            <Link
              href="/brains"
              className={`text-sm font-medium transition-colors ${
                isActive('/brains')
                  ? 'text-[#000000] border-b-2 border-[#001F3F] pb-1'
                  : 'text-[#4A4A4A] hover:text-[#722F37]'
              }`}
            >
              Brains
            </Link>
          </div>

          {/* Right Side - User Menu */}
          <div className="relative">
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="flex items-center space-x-3 text-sm focus:outline-none hover:opacity-80 transition-opacity"
            >
              <span className="font-medium text-[#000000] capitalize">
                {userName}
              </span>
              <svg
                className="w-5 h-5 text-[#4A4A4A]"
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

            {/* Dropdown Menu */}
            {showDropdown && (
              <div className="absolute right-0 mt-2 w-56 bg-white border border-[#E0E0E0] rounded shadow-lg py-1">
                <Link
                  href="/settings/billing"
                  className="block px-4 py-2.5 text-sm text-[#4A4A4A] hover:bg-[#F5F5F5] hover:text-[#722F37] transition-colors"
                  onClick={() => setShowDropdown(false)}
                >
                  Billing
                </Link>
                <Link
                  href="/settings/connections"
                  className="block px-4 py-2.5 text-sm text-[#4A4A4A] hover:bg-[#F5F5F5] hover:text-[#722F37] transition-colors"
                  onClick={() => setShowDropdown(false)}
                >
                  Email & Phone Connectors
                </Link>
                <Link
                  href="/settings/profile"
                  className="block px-4 py-2.5 text-sm text-[#4A4A4A] hover:bg-[#F5F5F5] hover:text-[#722F37] transition-colors"
                  onClick={() => setShowDropdown(false)}
                >
                  User Profile
                </Link>
                <Link
                  href="/settings/timezone"
                  className="block px-4 py-2.5 text-sm text-[#4A4A4A] hover:bg-[#F5F5F5] hover:text-[#722F37] transition-colors"
                  onClick={() => setShowDropdown(false)}
                >
                  Timezone
                </Link>
                <hr className="my-1 border-[#E0E0E0]" />
                <form action="/api/auth/signout" method="POST">
                  <button
                    type="submit"
                    className="w-full text-left px-4 py-2.5 text-sm text-[#722F37] hover:bg-[#F5F5F5] transition-colors"
                  >
                    Sign Out
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
