'use client';

import { useState, useEffect } from 'react';

export default function SettingsForm() {
  const [dailyLimit, setDailyLimit] = useState(75);
  const [emailFrequency, setEmailFrequency] = useState('2-5'); // minutes between emails
  const [autoStartDaily, setAutoStartDaily] = useState(true);
  const [loopAfterDays, setLoopAfterDays] = useState(14);
  const [followUpEnabled, setFollowUpEnabled] = useState(true);
  const [followUpTiming, setFollowUpTiming] = useState('3_days');
  const [businessHoursOnly, setBusinessHoursOnly] = useState(true);
  const [aiPersonalization, setAIPersonalization] = useState(50);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        if (data) {
          setDailyLimit(data.daily_limit || 75);
          setEmailFrequency(data.email_frequency || '2-5');
          setAutoStartDaily(data.auto_start_daily ?? true);
          setLoopAfterDays(data.loop_after_days || 14);
          setFollowUpEnabled(data.followup_enabled ?? true);
          setFollowUpTiming(data.followup_timing || '3_days');
          setBusinessHoursOnly(data.business_hours_only ?? true);
          setAIPersonalization(data.ai_personalization || 50);
        }
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          daily_limit: dailyLimit,
          email_frequency: emailFrequency,
          auto_start_daily: autoStartDaily,
          loop_after_days: loopAfterDays,
          followup_enabled: followUpEnabled,
          followup_timing: followUpTiming,
          business_hours_only: businessHoursOnly,
          ai_personalization: aiPersonalization,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        // Refresh the page to apply new settings
        alert('✓ Settings saved! Refreshing to apply changes...');
        window.location.reload();
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error: any) {
      console.error('Error saving settings:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-500">Loading settings...</div>
      </div>
    );
  }

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

      {/* Email Frequency */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-1">
            Email Sending Frequency
          </h3>
          <p className="text-sm text-gray-600">
            How many minutes between each email send
          </p>
        </div>
        
        <select
          value={emailFrequency}
          onChange={(e) => setEmailFrequency(e.target.value)}
          className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
        >
          <option value="0.5-2">Very Fast (30s - 2min between emails)</option>
          <option value="2-5">Fast (2-5min between emails)</option>
          <option value="5-10">Moderate (5-10min between emails)</option>
          <option value="10-20">Slow (10-20min between emails)</option>
          <option value="20-40">Very Slow (20-40min between emails)</option>
          <option value="40-60">Ultra Slow (40-60min between emails)</option>
        </select>
        
        <div className="mt-3 p-3 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-600">
            {emailFrequency === '0.5-2' && '⚡ Fastest speed - Use for warm leads or established sender reputation'}
            {emailFrequency === '2-5' && '🚀 Good balance of speed and safety'}
            {emailFrequency === '5-10' && '⚖️ Recommended for most campaigns - Natural human pace'}
            {emailFrequency === '10-20' && '🐢 Slower, more cautious - Good for cold outreach'}
            {emailFrequency === '20-40' && '🔒 Very conservative - Best for new accounts'}
            {emailFrequency === '40-60' && '🛡️ Maximum safety - Looks most human-like'}
          </p>
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
          value={loopAfterDays}
          onChange={(e) => setLoopAfterDays(parseInt(e.target.value))}
          className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
        >
          <option value="7">7 days (weekly)</option>
          <option value="14">14 days (bi-weekly)</option>
          <option value="30">30 days (monthly)</option>
          <option value="60">60 days</option>
          <option value="90">90 days (quarterly)</option>
          <option value="0">Never loop</option>
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
          disabled={saving}
          className="w-full px-6 py-3 bg-black text-white rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
