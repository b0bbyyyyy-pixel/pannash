'use client';

/**
 * Run SMS — {campaign name}
 * Drip setup modal. Matches existing Gostwrk dialogs (NewCampaignModal styling).
 */
import { useState, useEffect, useRef } from 'react';
import { ALL_STATES } from '@/lib/smsDrip/timezones';

const PACE_PRESETS = [
  { label: '1–2 min', min: 60, max: 120 },
  { label: '2–4 min', min: 120, max: 240 },
  { label: '3–6 min', min: 180, max: 360 },
];

const WINDOW_PRESETS = [3, 5, 8];

const DEFAULT_TEMPLATES = ['', '', '', '', ''];

type TemplatePack = { id: string; name: string; templates: string[] };

function newPack(name: string, templates: string[] = DEFAULT_TEMPLATES): TemplatePack {
  return { id: crypto.randomUUID(), name, templates: [...templates] };
}

export type ExistingDripJob = {
  id: string;
  status: string;
  templates?: string[] | null;
  window_hours?: number | null;
  pace_min_seconds?: number | null;
  pace_max_seconds?: number | null;
  quiet_start?: string | null;
  quiet_end?: string | null;
  skip_states?: string[] | null;
};

interface Props {
  listId: string;
  campaignName: string;
  leadCount: number;
  savedTemplates?: string[] | null;
  existingJob?: ExistingDripJob | null;
  onClose: () => void;
  onStarted: () => void;
}

const WINDOW_PRESET_HOURS = [3, 5, 8];

function windowParts(hours: number | null | undefined) {
  const h = Number(hours);
  if (!Number.isFinite(h) || h <= 0) return { hours: 5, mins: 0, custom: false };
  if (WINDOW_PRESET_HOURS.includes(h)) return { hours: h, mins: 0, custom: false };
  const total = Math.round(h * 60);
  return { hours: Math.floor(total / 60), mins: total % 60, custom: true };
}

export default function RunSmsModal({ listId, campaignName, leadCount, savedTemplates, existingJob, onClose, onStarted }: Props) {
  const initialWindow = windowParts(existingJob?.window_hours);
  const [windowHours, setWindowHours] = useState(initialWindow.custom ? 5 : initialWindow.hours);
  const [customHours, setCustomHours] = useState(initialWindow.custom ? String(initialWindow.hours || '') : '');
  const [customMins, setCustomMins] = useState(initialWindow.custom ? String(initialWindow.mins || '') : '');
  const [useCustomWindow, setUseCustomWindow] = useState(initialWindow.custom);
  const [paceMin, setPaceMin] = useState(existingJob?.pace_min_seconds || 60);
  const [paceMax, setPaceMax] = useState(existingJob?.pace_max_seconds || 120);
  const [packs, setPacks] = useState<TemplatePack[]>(() => [
    newPack(
      'Set 1',
      existingJob?.templates?.length
        ? existingJob.templates
        : savedTemplates?.length
          ? savedTemplates
          : DEFAULT_TEMPLATES
    ),
  ]);
  const [activePackId, setActivePackId] = useState(() => packs[0].id);
  const userEdited = useRef(false);
  const hydrated = useRef(false);
  const [namingNew, setNamingNew] = useState(false);
  const [newPackName, setNewPackName] = useState('');
  const [quietStart, setQuietStart] = useState(existingJob?.quiet_start || '09:00');
  const [quietEnd, setQuietEnd] = useState(existingJob?.quiet_end || '20:00');
  const [skipStates, setSkipStates] = useState<string[]>(existingJob?.skip_states ?? []);
  const [showSkipPicker, setShowSkipPicker] = useState(false);
  const [includeAlreadyTexted, setIncludeAlreadyTexted] = useState(false);
  const [starting, setStarting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activePack = packs.find(p => p.id === activePackId) ?? packs[0];
  const templates = activePack?.templates ?? DEFAULT_TEMPLATES;

  const persistPacks = async (next: TemplatePack[]): Promise<boolean> => {
    try {
      localStorage.setItem('sms_template_packs', JSON.stringify(next));
    } catch { /* ignore quota */ }
    try {
      const res = await fetch('/api/sms/template-packs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packs: next }),
      });
      return res.ok;
    } catch {
      return false;
    }
  };

  const jobPayload = () => ({
    templates: filledTemplates,
    paceMinSeconds: paceMin,
    paceMaxSeconds: paceMax,
    windowHours: effectiveWindow > 0 ? effectiveWindow : 5,
    quietStart,
    quietEnd,
    skipStates,
  });

  const saveSets = async () => {
    setSaving(true);
    setSavedMsg(null);
    setError(null);
    const ok = await persistPacks(packs);
    if (existingJob?.id) {
      const res = await fetch('/api/sms/drip', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: existingJob.id, action: 'update', ...jobPayload() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSaving(false);
        setError(data.error || 'Could not save drip');
        return;
      }
    }
    setSaving(false);
    setSavedMsg(ok ? 'Saved' : 'Saved on this device');
    setTimeout(() => setSavedMsg(null), 2000);
  };

  useEffect(() => {
    let cancelled = false;
    fetch('/api/sms/template-packs')
      .then(r => r.json())
      .then(data => {
        if (cancelled || userEdited.current || hydrated.current) return;
        let loaded: TemplatePack[] = Array.isArray(data.packs) ? data.packs : [];
        if (!loaded.length) {
          try {
            const raw = localStorage.getItem('sms_template_packs');
            if (raw) loaded = JSON.parse(raw);
          } catch { /* ignore */ }
        }
        hydrated.current = true;
        if (loaded.length) {
          setPacks(loaded);
          const seed = existingJob?.templates?.length ? existingJob.templates : savedTemplates;
          const match = seed?.length
            ? loaded.find(p => JSON.stringify(p.templates.filter(Boolean)) === JSON.stringify(seed.filter(Boolean)))
            : null;
          setActivePackId(match?.id ?? loaded[0].id);
        }
      })
      .catch(() => { hydrated.current = true; });
    return () => { cancelled = true; };
    // Load saved sets once. Campaign drip polling must not rewrite in-progress edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const effectiveWindow = useCustomWindow
    ? (Number(customHours) || 0) + (Number(customMins) || 0) / 60
    : windowHours;
  const setTemplates = (updater: (prev: string[]) => string[]) => {
    userEdited.current = true;
    setPacks(prev => prev.map(p => p.id === activePackId ? { ...p, templates: updater(p.templates) } : p));
  };

  const selectPack = (id: string) => {
    setActivePackId(id);
    persistPacks(packs);
  };

  const addPack = () => {
    const name = newPackName.trim() || `Set ${packs.length + 1}`;
    const pack = newPack(name);
    const next = [...packs, pack];
    setPacks(next);
    setActivePackId(pack.id);
    setNewPackName('');
    setNamingNew(false);
    persistPacks(next);
  };

  const removeActivePack = () => {
    if (packs.length < 2) return;
    const next = packs.filter(p => p.id !== activePackId);
    setPacks(next);
    setActivePackId(next[0].id);
    persistPacks(next);
  };

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
    if (useCustomWindow && effectiveWindow <= 0) { setError('Set custom hours or minutes.'); return; }
    setStarting(true);
    persistPacks(packs);
    try {
      const res = existingJob?.id
        ? await fetch('/api/sms/drip', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobId: existingJob.id, action: 'resume', ...jobPayload() }),
          })
        : await fetch('/api/sms/drip', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              listId,
              ...jobPayload(),
              includeAlreadyTexted,
            }),
          });
      const data = await res.json();
      if (!res.ok) { setError(data.error || (existingJob ? 'Could not resume drip' : 'Could not start drip')); return; }
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
          <h3 className="font-bold text-[#1a1a1a]">
            {existingJob ? 'Edit SMS' : 'Run SMS'} — {campaignName}
          </h3>
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
                min={0}
                max={24}
                placeholder="0"
                value={customHours}
                onFocus={() => setUseCustomWindow(true)}
                onChange={e => { setCustomHours(e.target.value); setUseCustomWindow(true); }}
                className={`w-14 px-2 py-1.5 text-sm border rounded-lg focus:outline-none focus:border-[#1a1a1a] ${
                  useCustomWindow ? 'border-[#1a1a1a]' : 'border-[#e5e5e5]'
                }`}
              />
              <span className="text-xs text-[#9b9b9b]">h</span>
              <input
                type="number"
                min={0}
                max={59}
                placeholder="0"
                value={customMins}
                onFocus={() => setUseCustomWindow(true)}
                onChange={e => { setCustomMins(e.target.value); setUseCustomWindow(true); }}
                className={`w-14 px-2 py-1.5 text-sm border rounded-lg focus:outline-none focus:border-[#1a1a1a] ${
                  useCustomWindow ? 'border-[#1a1a1a]' : 'border-[#e5e5e5]'
                }`}
              />
              <span className="text-xs text-[#9b9b9b]">min</span>
            </div>
            <p className="text-[11px] text-[#9b9b9b] mt-1.5">Stretch sends over this window. Use minutes for small lists.</p>
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
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {packs.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => selectPack(p.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                    p.id === activePackId
                      ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]'
                      : 'border-[#e5e5e5] text-[#6b6b6b] hover:bg-[#f5f5f5]'
                  }`}
                >
                  {p.name}
                </button>
              ))}
              {namingNew ? (
                <form
                  onSubmit={e => { e.preventDefault(); addPack(); }}
                  className="flex items-center gap-1.5"
                >
                  <input
                    autoFocus
                    value={newPackName}
                    onChange={e => setNewPackName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Escape') { setNamingNew(false); setNewPackName(''); } }}
                    placeholder="Set name"
                    className="w-28 px-2 py-1.5 text-sm border border-[#1a1a1a] rounded-lg focus:outline-none"
                  />
                  <button type="submit" className="text-[11px] text-[#1a1a1a] font-medium">Add</button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setNamingNew(true)}
                  className="px-3 py-1.5 rounded-lg text-sm border border-dashed border-[#e5e5e5] text-[#6b6b6b] hover:bg-[#f5f5f5] transition-colors"
                >
                  + New set
                </button>
              )}
            </div>
            <div className="space-y-2">
              {templates.map((t, i) => (
                <textarea
                  key={`${activePackId}-${i}`}
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
              {packs.length > 1 && (
                <button
                  onClick={removeActivePack}
                  className="text-[11px] text-[#9b9b9b] hover:text-[#1a1a1a] underline underline-offset-2"
                >
                  Delete set
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

            {!existingJob && (
              <label className="flex items-center gap-2 mt-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeAlreadyTexted}
                  onChange={e => setIncludeAlreadyTexted(e.target.checked)}
                  className="w-3.5 h-3.5 accent-[#1a1a1a]"
                />
                <span className="text-xs text-[#6b6b6b]">Include leads already marked SMS in this campaign</span>
              </label>
            )}
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#f0f0f0] flex items-center justify-end gap-2 flex-shrink-0">
          {savedMsg && (
            <span className="text-xs text-[#6b6b6b] mr-auto">{savedMsg}</span>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-[#6b6b6b] hover:text-[#1a1a1a] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={saveSets}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium border border-[#e5e5e5] text-[#1a1a1a] rounded-lg hover:bg-[#f5f5f5] disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={start}
            disabled={starting || filledTemplates.length < 1}
            className="px-5 py-2 text-sm font-medium text-white bg-[#1a1a1a] hover:bg-[#333] rounded-lg disabled:opacity-50 transition-colors"
          >
            {starting ? (existingJob ? 'Resuming…' : 'Starting…') : (existingJob ? 'Resume' : 'Start')}
          </button>
        </div>
      </div>
    </>
  );
}
