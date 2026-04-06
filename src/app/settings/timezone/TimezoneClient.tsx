'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const US_TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Phoenix', label: 'Arizona Time (AZ)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AK)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HT)' },
];

interface TimezoneClientProps {
  browserTimezone: string;
  savedTimezone: string | null;
}

export default function TimezoneClient({ browserTimezone: serverBrowserTimezone, savedTimezone }: TimezoneClientProps) {
  const router = useRouter();
  const [browserTimezone, setBrowserTimezone] = useState(serverBrowserTimezone);
  const [selectedTimezone, setSelectedTimezone] = useState(savedTimezone || serverBrowserTimezone);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // Detect browser timezone on client side
  useEffect(() => {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setBrowserTimezone(detected);
    if (!savedTimezone) {
      setSelectedTimezone(detected);
    }
  }, [savedTimezone]);

  const handleSave = async () => {
    setSaving(true);
    setMessage('');

    try {
      const res = await fetch('/api/settings/timezone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone: selectedTimezone }),
        credentials: 'include',
      });

      if (res.ok) {
        setMessage('Timezone saved successfully!');
        router.refresh();
      } else {
        setMessage('Failed to save timezone');
      }
    } catch (error) {
      setMessage('Error saving timezone');
    } finally {
      setSaving(false);
    }
  };

  const currentTime = new Date().toLocaleString('en-US', {
    timeZone: selectedTimezone,
    dateStyle: 'full',
    timeStyle: 'long',
  });

  return (
    <div className="space-y-6">
      {/* Detected Timezone */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Auto-Detected Timezone
        </h2>
        
        <div className="px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="font-medium text-gray-900 mb-1">
            {browserTimezone}
          </div>
          <div className="text-sm text-gray-600">
            Browser detected: {new Date().toLocaleString('en-US', { timeZone: browserTimezone })}
          </div>
        </div>
      </div>

      {/* Manual Timezone Selection */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Set Your Timezone
        </h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Select Timezone
            </label>
            <select
              value={selectedTimezone}
              onChange={(e) => setSelectedTimezone(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {US_TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
          </div>

          <div className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg">
            <div className="text-sm text-gray-600 mb-1">Current time in selected timezone:</div>
            <div className="font-medium text-gray-900">{currentTime}</div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving || selectedTimezone === savedTimezone}
            className="w-full px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save Timezone'}
          </button>

          {message && (
            <div className={`px-4 py-2 rounded-lg text-sm text-center ${
              message.includes('success') 
                ? 'bg-green-50 text-green-700 border border-green-200' 
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {message}
            </div>
          )}
        </div>

        <p className="mt-4 text-sm text-gray-600">
          All email schedules and timers will use this timezone for business hours and countdowns.
        </p>
      </div>
    </div>
  );
}
