'use client';

import { useState } from 'react';

export default function SettingsForm() {
  const [dailyLimit, setDailyLimit] = useState(75);
  const [spreadThroughoutDay, setSpreadThroughoutDay] = useState(true);
  const [autoStartDaily, setAutoStartDaily] = useState(true);
  const [loopAfter, setLoopAfter] = useState('14_days');
  const [followUpEnabled, setFollowUpEnabled] = useState(true);
  const [followUpTiming, setFollowUpTiming] = useState('3_days');
  const [businessHoursOnly, setBusinessHoursOnly] = useState(true);
  const [aiPersonalization, setAIPersonalization] = useState(50);

  const handleSave = () => {
    // TODO: Save settings to Supabase
    alert('Settings saved! (Backend integration coming soon)');
  };

  return (
    <div className="space-y-6">
      {/* Daily Email Limit */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-1">
            Daily Email Limit
          </h3>
          <p className="text-sm text-gray-600">
            Maximum emails to send per day
          </p>
        </div>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-2xl font-bold text-gray-900">{dailyLimit}</span>
            <span className="text-sm text-gray-500">emails/day</span>
          </div>
          <input
            type="range"
            min="10"
            max="200"
            value={dailyLimit}
            onChange={(e) => setDailyLimit(parseInt(e.target.value))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-black"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>10</span>
            <span>200</span>
          </div>
        </div>
      </div>

      {/* Spread Emails Throughout Day */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              Spread Emails Throughout Day
            </h3>
            <p className="text-sm text-gray-600">
              Evenly distribute {dailyLimit} emails from 9 AM - 6 PM with random variance
            </p>
            {spreadThroughoutDay && (
              <p className="text-xs text-gray-500 mt-2">
                ≈ {Math.round((9 * 60) / dailyLimit)} minutes between emails (with randomization)
              </p>
            )}
          </div>
          <button
            onClick={() => setSpreadThroughoutDay(!spreadThroughoutDay)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              spreadThroughoutDay ? 'bg-black' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                spreadThroughoutDay ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Auto-Start Daily at 9 AM */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              Auto-Start Daily at 9 AM
            </h3>
            <p className="text-sm text-gray-600">
              Automatically queue next {dailyLimit} emails every day at 9 AM
            </p>
          </div>
          <button
            onClick={() => setAutoStartDaily(!autoStartDaily)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              autoStartDaily ? 'bg-black' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                autoStartDaily ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Loop Leads After */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-1">
            Loop Leads After
          </h3>
          <p className="text-sm text-gray-600">
            After sending to all leads, wait this long before re-sending
          </p>
        </div>
        
        <select
          value={loopAfter}
          onChange={(e) => setLoopAfter(e.target.value)}
          className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
        >
          <option value="14_days">14 days</option>
          <option value="30_days">30 days (monthly)</option>
          <option value="60_days">60 days</option>
          <option value="90_days">90 days (quarterly)</option>
          <option value="never">Never loop</option>
        </select>
      </div>

      {/* Follow-up Logic */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              Auto Follow-ups
            </h3>
            <p className="text-sm text-gray-600">
              Automatically send follow-ups to warm leads
            </p>
          </div>
          <button
            onClick={() => setFollowUpEnabled(!followUpEnabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              followUpEnabled ? 'bg-black' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                followUpEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {followUpEnabled && (
          <div className="mt-4 pl-4 border-l-2 border-gray-200">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Follow-up Timing
            </label>
            <select
              value={followUpTiming}
              onChange={(e) => setFollowUpTiming(e.target.value)}
              className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            >
              <option value="1_day">1 day after no response</option>
              <option value="3_days">3 days after no response</option>
              <option value="1_week">1 week after no response</option>
              <option value="2_weeks">2 weeks after no response</option>
              <option value="30_days">30 days after no response</option>
            </select>
          </div>
        )}
      </div>

      {/* Business Hours Only */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              Business Hours Only
            </h3>
            <p className="text-sm text-gray-600">
              Send emails only between 9 AM - 6 PM
            </p>
          </div>
          <button
            onClick={() => setBusinessHoursOnly(!businessHoursOnly)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              businessHoursOnly ? 'bg-black' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                businessHoursOnly ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* AI Personalization Level */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-1">
            AI Personalization Level
          </h3>
          <p className="text-sm text-gray-600">
            How much AI personalizes each email
          </p>
        </div>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">
              {aiPersonalization < 30 ? 'Minimal' : aiPersonalization < 70 ? 'Moderate' : 'High'}
            </span>
            <span className="text-sm text-gray-500">{aiPersonalization}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={aiPersonalization}
            onChange={(e) => setAIPersonalization(parseInt(e.target.value))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-black"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>Template only</span>
            <span>Fully personalized</span>
          </div>
        </div>
      </div>

      {/* Hot Lead Threshold */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">
            Hot Lead Detection
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            Automatically flag leads with high engagement
          </p>
          <div className="text-sm text-gray-700">
            <div className="flex items-center justify-between py-2">
              <span>3+ opens OR 2+ clicks</span>
              <span className="text-green-600 font-medium">✓ Auto-detect</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span>Any reply</span>
              <span className="text-green-600 font-medium">✓ Instant hot</span>
            </div>
          </div>
        </div>
      </div>

      {/* Manual Scheduling Controls */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Manual Controls (Testing)
        </h3>
        <div className="space-y-3">
          <button
            onClick={async () => {
              const res = await fetch('/api/queue/daily-schedule', { method: 'POST' });
              const data = await res.json();
              alert(data.message);
            }}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
          >
            Trigger Daily Schedule Now
          </button>
          <button
            onClick={async () => {
              const res = await fetch('/api/leads/reset-loop', { method: 'POST' });
              const data = await res.json();
              alert(data.message);
            }}
            className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm"
          >
            Trigger Lead Loop Now
          </button>
          <p className="text-xs text-gray-500">
            These run automatically in production. Use these buttons for testing only.
          </p>
        </div>
      </div>

      {/* Save Button */}
      <div className="pt-4">
        <button
          onClick={handleSave}
          className="w-full px-6 py-3 bg-black text-white rounded-lg font-medium hover:bg-gray-800 transition-colors"
        >
          Save Settings
        </button>
      </div>
    </div>
  );
}
