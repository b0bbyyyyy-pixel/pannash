'use client';

/**
 * Run SMS — {campaign name}
 * Drip setup modal. Matches existing Gostwrk dialogs (NewCampaignModal styling).
 */
import { useState, useEffect } from 'react';
import { ALL_STATES } from '@/lib/smsDrip/timezones';

const PACE_PRESETS = [
  { label: '1–2 min', min: 60, max: 120 },
  { label: '2–4 min', min: 120, max: 240 },
  { label: '3–6 min', min: 180, max: 360 },
];

const WINDOW_PRESETS = [3, 5, 8];

const DEFAULT_TEMPLATES = ['', '', '', '', ''];

interface Props {
  listId: string;
  campaignName: string;
  leadCount: number;
  savedTemplates?: string[] | null;
  onClose: () => void;
  onStarted: () => void;
}

export default function RunSmsModal({ listId, campaignName, leadCount, savedTemplates, onClose, onStarted }: Props) {
  const [windowHours, setWindowHours] = useState(5);
  const [customWindow, setCustomWindow] = useState('');
  const [useCustomWindow, setUseCustomWindow] = useState(false);
  const [paceMin, setPaceMin] = useState(60);
  const [paceMax, setPaceMax] = useState(120);
  const [templates, setTemplates] = useState<string[]>(
    savedTemplates?.length ? savedTemplates : DEFAULT_TEMPLATES
  );
  const [quietStart, setQuietStart] = useState('09:00');
  const [quietEnd, setQuietEnd] = useState('20:00');
  const [skipStates, setSkipStates] = useState<string[]>([]);
  const [showSkipPicker, setShowSkipPicker] = useState(false);
  const [includeAlreadyTexted, setIncludeAlreadyTexted] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (savedTemplates?.length) setTemplates(savedTemplates);
  }, [savedTemplates]);

  const effectiveWindow = useCustomWindow ? Number(customWindow) || 0 : windowHours;
  const filledTemplates = templates.map(t => t.trim()).filter(Boolean);

  // Pace-vs-window estimate (spec #6)
  const avgPaceSec = (paceMin + paceMax) / 2;
  const neededHours = (leadCount * avgPaceSec) / 3600;
  const paceTooSlow = effectiveWindow > 0 && neededHours > effectiveWindow;

  const start = async () => {
    setError(null);
    if (filledTemplates.length < 1) { setError('Add at least one template.'); return; }
    if (paceMin < 30) { setError('Minimum pace is 30 seconds.'); return; }
    if (paceMax < paceMin) { setError('Max pace must be ≥ min pace.'); return; }
    setStarting(true);
    try {
      const res = await fetch('/api/sms/drip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listId,
          templates: filledTemplates,
          paceMinSeconds: paceMin,
          paceMaxSeconds: paceMax,
          windowHours: effectiveWindow || 5,
          quietStart,
          quietEnd,
          skipStates,
          includeAlreadyTexted,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Could not start drip'); return; }
      onStarted();
      onClose();
    } catch {
      setError('Network error');
    } finally {
      setStarting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#f0f0f0] flex items-center justify-between flex-shrink-0">
          <h3 className="font-bold text-[#1a1a1a]">Run SMS — {campaignName}</h3>
          <button onClick={onClose} className="text-[#9b9b9b] hover:text-[#1a1a1a] transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5 overflow-y-auto">
          {/* Window */}
          <div>
            <p className="text-xs font-bold text-[#6b6b6b] uppercase tracking-wider mb-2">Window</p>
            <div className="flex items-center gap-2">
              {WINDOW_PRESETS.map(h => (
                <button
                  key={h}
                  onClick={() => { setWindowHours(h); setUseCustomWindow(false); }}
                  className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                    !useCustomWindow && windowHours === h
                      ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]'
                      : 'border-[#e5e5e5] text-[#6b6b6b] hover:bg-[#f5f5f5]'
                  }`}
                >
                  {h}h
                </button>
              ))}
              <input
                type="number"
                min={1}
                max={24}
                placeholder="Custom"
                value={customWindow}
                onFocus={() => setUseCustomWindow(true)}
                onChange={e => { setCustomWindow(e.target.value); setUseCustomWindow(true); }}
                className={`w-20 px-2 py-1.5 text-sm border rounded-lg focus:outline-none focus:border-[#1a1a1a] ${
                  useCustomWindow ? 'border-[#1a1a1a]' : 'border-[#e5e5e5]'
                }`}
              />
              <span className="text-xs text-[#9b9b9b]">hours</span>
            </div>
            <p className="text-[11px] text-[#9b9b9b] mt-1.5">Stretch sends over this many hours.</p>
          </div>

          {/* Human pace */}
          <div>
            <p className="text-xs font-bold text-[#6b6b6b] uppercase tracking-wider mb-2">Human pace</p>
            <div className="flex items-center gap-2 mb-2">
              {PACE_PRESETS.map(p => (
                <button
                  key={p.label}
                  onClick={() => { setPaceMin(p.min); setPaceMax(p.max); }}
                  className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                    paceMin === p.min && paceMax === p.max
                      ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]'
                      : 'border-[#e5e5e5] text-[#6b6b6b] hover:bg-[#f5f5f5]'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 text-sm text-[#6b6b6b]">
              <input
                type="number" min={0.5} step={0.5}
                value={paceMin / 60}
                onChange={e => setPaceMin(Math.round((Number(e.target.value) || 1) * 60))}
                className="w-16 px-2 py-1 border border-[#e5e5e5] rounded-lg focus:outline-none focus:border-[#1a1a1a]"
              />
              <span>to</span>
              <input
                type="number" min={0.5} step={0.5}
                value={paceMax / 60}
                onChange={e => setPaceMax(Math.round((Number(e.target.value) || 2) * 60))}
                className="w-16 px-2 py-1 border border-[#e5e5e5] rounded-lg focus:outline-none focus:border-[#1a1a1a]"
              />
              <span>minutes between texts (randomized + jitter)</span>
            </div>
            {paceTooSlow && (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
                At {Math.round(paceMin / 60)}–{Math.round(paceMax / 60)} min this list needs ~{neededHours.toFixed(1)} hours.
                Stretch will be {neededHours.toFixed(1)} hours unless you raise pace.
              </p>
            )}
          </div>

          {/* Templates */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-[#6b6b6b] uppercase tracking-wider">Templates</p>
              <span className="text-[11px] text-[#9b9b9b]">
                {'{first_name} {company} {city} {state}'}
              </span>
            </div>
            <div className="space-y-2">
              {templates.map((t, i) => (
                <textarea
                  key={i}
                  value={t}
                  onChange={e => setTemplates(prev => prev.map((x, j) => (j === i ? e.target.value : x)))}
                  placeholder={`Template ${i + 1}${i === 0 ? ' — e.g. Hi {first_name}, quick question about {company}…' : ''}`}
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-[#e5e5e5] rounded-lg focus:outline-none focus:border-[#1a1a1a] resize-none"
                />
              ))}
            </div>
            <div className="flex items-center gap-3 mt-1.5">
              {templates.length < 8 && (
                <button
                  onClick={() => setTemplates(prev => [...prev, ''])}
                  className="text-[11px] text-[#6b6b6b] hover:text-[#1a1a1a] underline underline-offset-2"
                >
                  + Add template
                </button>
              )}
              {templates.length > 1 && (
                <button
                  onClick={() => setTemplates(prev => prev.slice(0, -1))}
                  className="text-[11px] text-[#9b9b9b] hover:text-[#1a1a1a] underline underline-offset-2"
                >
                  Remove last
                </button>
              )}
              <span className="text-[11px] text-[#9b9b9b] ml-auto">{filledTemplates.length} ready · each lead gets one at random</span>
            </div>
          </div>

          {/* Compliance window */}
          <div>
            <p className="text-xs font-bold text-[#6b6b6b] uppercase tracking-wider mb-2">Compliance window</p>
            <div className="flex items-center gap-2 text-sm text-[#6b6b6b]">
              <input
                type="time" value={quietStart}
                onChange={e => setQuietStart(e.target.value)}
                className="px-2 py-1 border border-[#e5e5e5] rounded-lg focus:outline-none focus:border-[#1a1a1a]"
              />
              <span>to</span>
              <input
                type="time" value={quietEnd}
                onChange={e => setQuietEnd(e.target.value)}
                className="px-2 py-1 border border-[#e5e5e5] rounded-lg focus:outline-none focus:border-[#1a1a1a]"
              />
              <span className="text-xs">lead local time · Mon–Sat</span>
            </div>
            <p className="text-[11px] text-[#9b9b9b] mt-1.5">
              Timezone comes from each lead&apos;s state. Outside the window a lead is queued for the next legal local start.
            </p>

            {/* Skip states */}
            <div className="mt-3">
              <button
                onClick={() => setShowSkipPicker(v => !v)}
                className="text-xs text-[#6b6b6b] hover:text-[#1a1a1a] flex items-center gap-1"
              >
                <svg className={`w-3 h-3 transition-transform ${showSkipPicker ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                Skip states {skipStates.length > 0 && `(${skipStates.join(', ')})`}
              </button>
              {showSkipPicker && (
                <div className="mt-2 grid grid-cols-10 gap-1 max-h-32 overflow-y-auto border border-[#f0f0f0] rounded-lg p-2">
                  {ALL_STATES.map(s => {
                    const on = skipStates.includes(s);
                    return (
                      <button
                        key={s}
                        onClick={() => setSkipStates(prev => on ? prev.filter(x => x !== s) : [...prev, s])}
                        className={`text-[10px] px-1 py-0.5 rounded transition-colors ${
                          on ? 'bg-[#1a1a1a] text-white' : 'text-[#6b6b6b] hover:bg-[#f0f0f0]'
                        }`}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Include already texted */}
            <label className="flex items-center gap-2 mt-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeAlreadyTexted}
                onChange={e => setIncludeAlreadyTexted(e.target.checked)}
                className="w-3.5 h-3.5 accent-[#1a1a1a]"
              />
              <span className="text-xs text-[#6b6b6b]">Include leads already marked SMS in this campaign</span>
            </label>
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#f0f0f0] flex items-center justify-end gap-2 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-[#6b6b6b] hover:text-[#1a1a1a] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={start}
            disabled={starting || filledTemplates.length < 1}
            className="px-5 py-2 text-sm font-medium text-white bg-[#1a1a1a] hover:bg-[#333] rounded-lg disabled:opacity-50 transition-colors"
          >
            {starting ? 'Starting…' : 'Start'}
          </button>
        </div>
      </div>
    </>
  );
}
