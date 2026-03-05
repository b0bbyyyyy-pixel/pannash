'use client';

import { useState, useEffect } from 'react';

export default function SettingsForm() {
  const [dailyLimit, setDailyLimit] = useState(75);
  const [emailFrequency, setEmailFrequency] = useState('5-10'); // minutes between emails - default to moderate
  const [smsDailyLimit, setSmsDailyLimit] = useState(50);
  const [smsFrequency, setSmsFrequency] = useState('5-10'); // minutes between SMS - default to moderate
  const [autoStartDaily, setAutoStartDaily] = useState(true);
  const [loopAfterDays, setLoopAfterDays] = useState(14);
  const [followUpEnabled, setFollowUpEnabled] = useState(true);
  const [followUpTiming, setFollowUpTiming] = useState('3_days');
  const [businessHoursOnly, setBusinessHoursOnly] = useState(true);
  const [aiPersonalization, setAIPersonalization] = useState(50);
  const [aiResponseDelayMin, setAiResponseDelayMin] = useState(2);
  const [aiResponseDelayMax, setAiResponseDelayMax] = useState(8);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [pendingFrequency, setPendingFrequency] = useState<{ type: 'email' | 'sms', value: string } | null>(null);

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
          setEmailFrequency(data.email_frequency || '5-10'); // Default to moderate
          setSmsDailyLimit(data.sms_daily_limit || 50);
          setSmsFrequency(data.sms_frequency || '5-10'); // Default to moderate
          setAutoStartDaily(data.auto_start_daily ?? true);
          setLoopAfterDays(data.loop_after_days || 14);
          setFollowUpEnabled(data.followup_enabled ?? true);
          setFollowUpTiming(data.followup_timing || '3_days');
          setBusinessHoursOnly(data.business_hours_only ?? true);
          setAIPersonalization(data.ai_personalization || 50);
          setAiResponseDelayMin(data.ai_response_delay_min || 2);
          setAiResponseDelayMax(data.ai_response_delay_max || 8);
        }
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFrequencyChange = (type: 'email' | 'sms', value: string) => {
    // If changing from moderate (5-10), show warning
    const currentValue = type === 'email' ? emailFrequency : smsFrequency;
    if (currentValue === '5-10' && value !== '5-10') {
      setPendingFrequency({ type, value });
      setShowWarning(true);
    } else {
      // No warning needed, apply directly
      if (type === 'email') {
        setEmailFrequency(value);
      } else {
        setSmsFrequency(value);
      }
    }
  };

  const confirmFrequencyChange = () => {
    if (pendingFrequency) {
      if (pendingFrequency.type === 'email') {
        setEmailFrequency(pendingFrequency.value);
      } else {
        setSmsFrequency(pendingFrequency.value);
      }
    }
    setShowWarning(false);
    setPendingFrequency(null);
  };

  const cancelFrequencyChange = () => {
    setShowWarning(false);
    setPendingFrequency(null);
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
          sms_daily_limit: smsDailyLimit,
          sms_frequency: smsFrequency,
          auto_start_daily: autoStartDaily,
          loop_after_days: loopAfterDays,
          followup_enabled: followUpEnabled,
          followup_timing: followUpTiming,
          business_hours_only: businessHoursOnly,
          ai_personalization: aiPersonalization,
          ai_response_delay_min: aiResponseDelayMin,
          ai_response_delay_max: aiResponseDelayMax,
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
      {/* Email Settings Header */}
      <div className="pt-2 pb-5 border-b border-[#e5e5e5]">
        <h2 className="text-2xl font-bold text-[#1a1a1a] tracking-tight">Email Settings</h2>
        <p className="text-sm text-[#6b6b6b] mt-1">Configure email campaign automation</p>
      </div>

      {/* Daily Email Limit */}
      <div className="bg-white border border-[#e5e5e5] rounded-md p-6">
        <div className="mb-4">
          <h3 className="text-lg font-bold text-[#1a1a1a] mb-1 tracking-tight">
            Daily Email Limit
          </h3>
          <p className="text-sm text-[#6b6b6b]">
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
      <div className="bg-white border border-[#e5e5e5] rounded-md p-6">
        <div className="mb-4">
          <h3 className="text-lg font-bold text-[#1a1a1a] mb-1 tracking-tight">
            Email Sending Frequency
          </h3>
          <p className="text-sm text-[#6b6b6b]">
            How many minutes between each email send
          </p>
        </div>
        
        <select
          value={emailFrequency}
          onChange={(e) => handleFrequencyChange('email', e.target.value)}
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

      {/* SMS Settings Header */}
      <div className="pt-8 pb-5 border-b border-[#e5e5e5]">
        <h2 className="text-2xl font-bold text-[#1a1a1a] tracking-tight">SMS Settings</h2>
        <p className="text-sm text-[#6b6b6b] mt-1">Configure SMS campaign automation</p>
      </div>

      {/* Daily SMS Limit */}
      <div className="bg-white border border-[#e5e5e5] rounded-md p-6">
        <div className="mb-4">
          <h3 className="text-lg font-bold text-[#1a1a1a] mb-1 tracking-tight">
            Daily SMS Limit
          </h3>
          <p className="text-sm text-[#6b6b6b]">
            Maximum SMS messages to send per day
          </p>
        </div>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-2xl font-bold text-gray-900">{smsDailyLimit}</span>
            <span className="text-sm text-gray-500">SMS/day</span>
          </div>
          <input
            type="range"
            min="10"
            max="150"
            value={smsDailyLimit}
            onChange={(e) => setSmsDailyLimit(parseInt(e.target.value))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>10</span>
            <span>150</span>
          </div>
          <div className="mt-2 p-3 bg-purple-50 rounded-lg">
            <p className="text-xs text-purple-800">
              💡 SMS limits are typically lower than email due to carrier restrictions and best practices
            </p>
          </div>
        </div>
      </div>

      {/* SMS Frequency */}
      <div className="bg-white border border-[#e5e5e5] rounded-md p-6">
        <div className="mb-4">
          <h3 className="text-lg font-bold text-[#1a1a1a] mb-1 tracking-tight">
            SMS Sending Frequency
          </h3>
          <p className="text-sm text-[#6b6b6b]">
            How many minutes between each SMS send
          </p>
        </div>
        
        <select
          value={smsFrequency}
          onChange={(e) => handleFrequencyChange('sms', e.target.value)}
          className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-600 focus:border-transparent"
        >
          <option value="0.5-2">Very Fast (30s - 2min between SMS)</option>
          <option value="2-5">Fast (2-5min between SMS)</option>
          <option value="5-10">Moderate (5-10min between SMS)</option>
          <option value="10-20">Slow (10-20min between SMS)</option>
          <option value="20-40">Very Slow (20-40min between SMS)</option>
          <option value="40-60">Ultra Slow (40-60min between SMS)</option>
        </select>
        
        <div className="mt-3 p-3 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-600">
            {smsFrequency === '0.5-2' && '⚡ Fastest - Use cautiously, may look automated'}
            {smsFrequency === '2-5' && '🚀 Good pace for SMS campaigns'}
            {smsFrequency === '5-10' && '⚖️ Recommended - Most natural human texting pace'}
            {smsFrequency === '10-20' && '🐢 Conservative - Great for cold SMS'}
            {smsFrequency === '20-40' && '🔒 Very safe - Best for compliance'}
            {smsFrequency === '40-60' && '🛡️ Ultra safe - Maximum deliverability'}
          </p>
        </div>
      </div>

      {/* AI Response Delay */}
      <div className="bg-white border border-[#e5e5e5] rounded-md p-6">
        <div className="mb-4">
          <h3 className="text-lg font-bold text-[#1a1a1a] mb-1 tracking-tight">
            AI Response Delay
          </h3>
          <p className="text-sm text-[#6b6b6b]">
            How long AI waits before replying to SMS (makes it feel more human)
          </p>
        </div>
        
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">
                Minimum Delay (minutes)
              </label>
              <input
                type="number"
                min="0"
                max="30"
                value={aiResponseDelayMin}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  setAiResponseDelayMin(isNaN(val) ? 0 : val);
                }}
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-600 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">
                Maximum Delay (minutes)
              </label>
              <input
                type="number"
                min="1"
                max="60"
                value={aiResponseDelayMax}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  setAiResponseDelayMax(isNaN(val) ? 1 : val);
                }}
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-600 focus:border-transparent"
              />
            </div>
          </div>
          
          <div className="p-3 bg-purple-50 rounded-lg">
            <p className="text-xs text-purple-900">
              <strong>Example:</strong> With {aiResponseDelayMin}-{aiResponseDelayMax} minutes, AI will wait a random time between {aiResponseDelayMin} and {aiResponseDelayMax} minutes before replying. This makes responses feel natural, not instant/automated.
            </p>
          </div>

          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-700">
              💡 <strong>Recommended:</strong> 2-8 minutes (default). Instant replies look robotic. A few minutes delay makes conversations feel authentic.
            </p>
          </div>
        </div>
      </div>

      {/* General Settings Header */}
      <div className="pt-8 pb-4 border-b border-gray-200">
        <h2 className="text-2xl font-bold text-gray-900">General Settings</h2>
        <p className="text-sm text-gray-600 mt-1">Apply to both email and SMS campaigns</p>
      </div>

      {/* Auto-Start Daily at 9 AM */}
      <div className="bg-white border border-[#e5e5e5] rounded-md p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-[#1a1a1a] mb-1 tracking-tight">
              Auto-Start Daily at 9 AM
            </h3>
            <p className="text-sm text-[#6b6b6b]">
              Automatically queue next batch of emails & SMS every day at 9 AM
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
      <div className="bg-white border border-[#e5e5e5] rounded-md p-6">
        <div className="mb-4">
          <h3 className="text-lg font-bold text-[#1a1a1a] mb-1 tracking-tight">
            Loop Leads After
          </h3>
          <p className="text-sm text-[#6b6b6b]">
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
      <div className="bg-white border border-[#e5e5e5] rounded-md p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-[#1a1a1a] mb-1 tracking-tight">
              Auto Follow-ups
            </h3>
            <p className="text-sm text-[#6b6b6b]">
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
      <div className="bg-white border border-[#e5e5e5] rounded-md p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-[#1a1a1a] mb-1 tracking-tight">
              Business Hours Only
            </h3>
            <p className="text-sm text-[#6b6b6b]">
              Send emails & SMS only between 9 AM - 6 PM
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
      <div className="bg-white border border-[#e5e5e5] rounded-md p-6">
        <div className="mb-4">
          <h3 className="text-lg font-bold text-[#1a1a1a] mb-1 tracking-tight">
            AI Personalization Level
          </h3>
          <p className="text-sm text-[#6b6b6b]">
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
      <div className="bg-white border border-[#e5e5e5] rounded-md p-6">
        <div>
          <h3 className="text-lg font-bold text-[#1a1a1a] mb-1 tracking-tight">
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
      <div className="bg-white border border-[#e5e5e5] rounded-md p-6">
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
          className="w-full px-6 py-3 bg-[#1a1a1a] text-white rounded-md font-medium hover:bg-[#2a2a2a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      {/* Frequency Change Warning Modal */}
      {showWarning && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-md max-w-lg w-full p-8 shadow-xl">
            <div className="mb-5">
              <h3 className="text-xl font-bold text-[#1a1a1a] mb-3 tracking-tight">
                Sending Frequency Warning
              </h3>
              <p className="text-sm text-[#1a1a1a] mb-5">
                Changing from the <strong>Moderate (5-10min)</strong> recommended setting may increase your risk of being flagged by email providers or SMS carriers for spam-like behavior.
              </p>
              <div className="bg-[#fff9e5] border border-[#f0d58a] rounded-md p-4 mb-4">
                <p className="text-sm text-[#6b5a2a] mb-2 font-bold">
                  Risks include:
                </p>
                <ul className="text-sm text-[#6b5a2a] space-y-1 ml-4 list-disc">
                  <li>Email deliverability issues</li>
                  <li>Account suspension by email/SMS providers</li>
                  <li>Being marked as spam by recipients</li>
                  <li>Reduced reply rates and engagement</li>
                </ul>
              </div>
              <div className="bg-[#f5f5f5] border border-[#e5e5e5] rounded-md p-4">
                <p className="text-xs text-[#6b6b6b] leading-relaxed">
                  <strong className="text-[#1a1a1a]">Disclaimer:</strong> By changing this setting, you acknowledge that Gostwrk.io is not responsible for any account suspensions, deliverability issues, spam flags, or other consequences resulting from your sending patterns. Use at your own risk.
                </p>
              </div>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={cancelFrequencyChange}
                className="flex-1 px-4 py-2.5 border border-[#e5e5e5] text-[#6b6b6b] rounded-md hover:border-[#1a1a1a] hover:text-[#1a1a1a] transition-colors font-medium text-sm"
              >
                Cancel
              </button>
              <button
                onClick={confirmFrequencyChange}
                className="flex-1 px-4 py-2.5 bg-[#d17a3f] text-white rounded-md hover:bg-[#b86a35] transition-colors font-medium text-sm"
              >
                I Understand, Change Anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
