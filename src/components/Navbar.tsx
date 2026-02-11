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
    <nav className="fixed top-0 left-0 right-0 bg-[#fdfdfd] border-b border-gray-200 z-50">
      <div className="max-w-[1400px] mx-auto px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/dashboard" className="text-xl font-bold text-gray-900">
            pannash.io
          </Link>

          {/* Center Links */}
          <div className="flex items-center space-x-8">
            <Link
              href="/campaigns"
              className={`text-sm font-medium transition-colors ${
                isActive('/campaigns')
                  ? 'text-gray-900'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Campaigns
            </Link>
            <Link
              href="/leads"
              className={`text-sm font-medium transition-colors ${
                isActive('/leads')
                  ? 'text-gray-900'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Leads
            </Link>
            <Link
              href="/brains"
              className={`text-sm font-medium transition-colors ${
                isActive('/brains')
                  ? 'text-gray-900'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Brains
            </Link>
          </div>

          {/* Right Side - User Menu */}
          <div className="relative">
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="flex items-center space-x-3 text-sm focus:outline-none"
            >
              <span className="font-medium text-gray-900 capitalize">
                {userName}
              </span>
              <svg
                className="w-5 h-5 text-gray-600"
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
              <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-1">
                <Link
                  href="/settings/billing"
                  className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  onClick={() => setShowDropdown(false)}
                >
                  Billing
                </Link>
                <Link
                  href="/settings/connections"
                  className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  onClick={() => setShowDropdown(false)}
                >
                  Email & Phone Connectors
                </Link>
                <Link
                  href="/settings/profile"
                  className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  onClick={() => setShowDropdown(false)}
                >
                  User Profile
                </Link>
                <Link
                  href="/settings/timezone"
                  className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  onClick={() => setShowDropdown(false)}
                >
                  Timezone
                </Link>
                <hr className="my-1" />
                <form action="/api/auth/signout" method="POST">
                  <button
                    type="submit"
                    className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-50"
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
