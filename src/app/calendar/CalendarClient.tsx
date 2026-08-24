'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface LeadTimer {
  leadId: string;
  label: string;
  timerType: string;
  timerEndDate: string;
}

interface CalendarEvent {
  id: string;
  date: string; // "YYYY-MM-DD"
  title: string;
  notes: string | null;
  alert_enabled: boolean;
  alert_at: string | null;
  alert_phone: string | null;
  alert_sent: boolean;
  color: string;
}

const COLOR_OPTIONS = [
  { id: 'blue', label: 'Blue', bg: 'bg-blue-500', dot: 'bg-blue-500', light: 'bg-blue-50 border-blue-200 text-blue-800' },
  { id: 'green', label: 'Green', bg: 'bg-green-500', dot: 'bg-green-500', light: 'bg-green-50 border-green-200 text-green-800' },
  { id: 'red', label: 'Red', bg: 'bg-red-500', dot: 'bg-red-500', light: 'bg-red-50 border-red-200 text-red-800' },
  { id: 'yellow', label: 'Yellow', bg: 'bg-yellow-400', dot: 'bg-yellow-400', light: 'bg-yellow-50 border-yellow-200 text-yellow-800' },
  { id: 'purple', label: 'Purple', bg: 'bg-purple-500', dot: 'bg-purple-500', light: 'bg-purple-50 border-purple-200 text-purple-800' },
  { id: 'orange', label: 'Orange', bg: 'bg-orange-500', dot: 'bg-orange-500', light: 'bg-orange-50 border-orange-200 text-orange-800' },
];

function getColor(colorId: string) {
  return COLOR_OPTIONS.find(c => c.id === colorId) ?? COLOR_OPTIONS[0];
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function toLocalDate(isoDate: string) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function fmtDate(isoDate: string) {
  return toLocalDate(isoDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function dateKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function todayKey() {
  const t = new Date();
  return dateKey(t.getFullYear(), t.getMonth(), t.getDate());
}

interface EventFormState {
  title: string;
  notes: string;
  color: string;
  alertEnabled: boolean;
  alertAt: string;
  alertPhone: string;
}

const blankForm = (): EventFormState => ({
  title: '', notes: '', color: 'blue',
  alertEnabled: false, alertAt: '', alertPhone: '',
});

export default function CalendarClient() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [timers, setTimers] = useState<LeadTimer[]>([]);
  const [loading, setLoading] = useState(true);

  // Selected day panel
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Day notes
  const [dayNotes, setDayNotes] = useState('');
  const [dayNotesSaved, setDayNotesSaved] = useState(true);
  const [dayNotesSaveError, setDayNotesSaveError] = useState(false);
  const dayNotesDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref so the debounce always has the correct date even if panel closes before it fires
  const editingDateRef = useRef<string | null>(null);

  // Event editor
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<EventFormState>(blankForm());
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [clearingTimer, setClearingTimer] = useState<string | null>(null);

  const alertIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchEvents = useCallback(async () => {
    const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
    const [evRes, timerRes] = await Promise.all([
      fetch(`/api/calendar/events?month=${monthStr}`),
      fetch('/api/calendar/timers'),
    ]);
    if (evRes.ok) { const d = await evRes.json(); setEvents(d.events ?? []); }
    if (timerRes.ok) { const d = await timerRes.json(); setTimers(d.timers ?? []); }
    setLoading(false);
  }, [year, month]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  // Poll for due alerts every 60s
  useEffect(() => {
    async function checkAlerts() {
      await fetch('/api/calendar/alerts', { method: 'POST' }).catch(() => {});
    }
    checkAlerts();
    alertIntervalRef.current = setInterval(checkAlerts, 60000);
    return () => { if (alertIntervalRef.current) clearInterval(alertIntervalRef.current); };
  }, []);

  // Load day notes when selected date changes
  useEffect(() => {
    if (!selectedDate) return;
    editingDateRef.current = selectedDate;
    setDayNotes('');
    setDayNotesSaved(true);
    setDayNotesSaveError(false);
    fetch(`/api/calendar/day-notes?date=${selectedDate}`)
      .then(async r => {
        const d = await r.json();
        if (r.ok) setDayNotes(d.notes ?? '');
      })
      .catch(() => {});
  }, [selectedDate]);

  function handleDayNotesChange(text: string) {
    const dateToSave = editingDateRef.current;
    setDayNotes(text);
    setDayNotesSaved(false);
    setDayNotesSaveError(false);
    if (dayNotesDebounce.current) clearTimeout(dayNotesDebounce.current);
    dayNotesDebounce.current = setTimeout(async () => {
      if (!dateToSave) return;
      try {
        const res = await fetch('/api/calendar/day-notes', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: dateToSave, notes: text }),
        });
        if (res.ok) {
          setDayNotesSaved(true);
          setDayNotesSaveError(false);
        } else {
          const err = await res.json().catch(() => ({}));
          console.error('[day-notes] save failed:', err);
          setDayNotesSaveError(true);
          setDayNotesSaved(true);
        }
      } catch {
        setDayNotesSaveError(true);
        setDayNotesSaved(true);
      }
    }, 800);
  }

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
    setSelectedDate(null);
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
    setSelectedDate(null);
  }

  // Build calendar grid
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const eventsByDate: Record<string, CalendarEvent[]> = {};
  events.forEach(e => {
    if (!eventsByDate[e.date]) eventsByDate[e.date] = [];
    eventsByDate[e.date].push(e);
  });

  // Group timers by LOCAL date key (computed client-side to respect user's timezone)
  const timersByDate: Record<string, LeadTimer[]> = {};
  timers.forEach(t => {
    const d = new Date(t.timerEndDate);
    // Build YYYY-MM-DD from LOCAL date parts so it matches the calendar grid
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!timersByDate[key]) timersByDate[key] = [];
    timersByDate[key].push(t);
  });

  const selectedEvents = selectedDate ? (eventsByDate[selectedDate] ?? []) : [];
  const tk = todayKey();

  function openAddForm(date: string) {
    setEditingEvent(null);
    // Pre-fill alert_at to 9am on that date
    const alertDefault = `${date}T09:00`;
    setForm({ ...blankForm(), alertAt: alertDefault });
    setShowForm(true);
  }

  function openEditForm(event: CalendarEvent) {
    setEditingEvent(event);
    setForm({
      title: event.title,
      notes: event.notes ?? '',
      color: event.color ?? 'blue',
      alertEnabled: event.alert_enabled,
      alertAt: event.alert_at ? event.alert_at.slice(0, 16) : '',
      alertPhone: event.alert_phone ?? '',
    });
    setShowForm(true);
  }

  async function saveEvent() {
    if (!form.title.trim() || !selectedDate) return;
    setSaving(true);
    try {
      const payload = {
        date: selectedDate,
        title: form.title.trim(),
        notes: form.notes.trim() || null,
        color: form.color,
        alertEnabled: form.alertEnabled,
        alertAt: form.alertEnabled && form.alertAt ? new Date(form.alertAt).toISOString() : null,
        alertPhone: form.alertEnabled ? form.alertPhone.trim() || null : null,
      };

      if (editingEvent) {
        const res = await fetch(`/api/calendar/events/${editingEvent.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) { const d = await res.json(); setEvents(prev => prev.map(e => e.id === editingEvent.id ? d.event : e)); }
      } else {
        const res = await fetch('/api/calendar/events', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) { const d = await res.json(); setEvents(prev => [...prev, d.event]); }
      }
      setShowForm(false);
      setEditingEvent(null);
      setForm(blankForm());
    } finally { setSaving(false); }
  }

  async function deleteEvent(id: string) {
    setDeleting(id);
    const res = await fetch(`/api/calendar/events/${id}`, { method: 'DELETE' });
    if (res.ok) setEvents(prev => prev.filter(e => e.id !== id));
    setDeleting(null);
  }

  return (
    <div className="flex h-[calc(100vh-80px)] bg-[#fafafa]">
      {/* Main calendar area */}
      <div className={`flex-1 flex flex-col overflow-hidden transition-all duration-300 ${selectedDate ? 'mr-0' : ''}`}>
        {/* Month navigation */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-[#e5e5e5] bg-white">
          <button
            onClick={prevMonth}
            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors text-gray-600"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="text-center">
            <h1 className="text-xl font-bold text-gray-900">{MONTHS[month]} {year}</h1>
            <button
              onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()); setSelectedDate(null); }}
              className="text-xs text-blue-600 hover:underline mt-0.5"
            >
              Today
            </button>
          </div>
          <button
            onClick={nextMonth}
            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors text-gray-600"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-[#e5e5e5] bg-white">
          {DAYS.map(d => (
            <div key={d} className="text-center py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-7 h-full" style={{ gridAutoRows: `${100 / Math.ceil(cells.length / 7)}%` }}>
              {cells.map((day, idx) => {
                const key = day ? dateKey(year, month, day) : null;
                const dayEvents = key ? (eventsByDate[key] ?? []) : [];
                const isToday = key === tk;
                const isSelected = key === selectedDate;

                return (
                  <div
                    key={idx}
                    onClick={() => day && setSelectedDate(key!)}
                    className={`border-b border-r border-[#e5e5e5] p-2 cursor-pointer transition-colors min-h-[100px]
                      ${!day ? 'bg-gray-50 cursor-default' : 'hover:bg-blue-50/40'}
                      ${isSelected ? 'bg-blue-50 ring-2 ring-inset ring-blue-400' : ''}
                    `}
                  >
                    {day && (
                      <>
                        <div className={`w-7 h-7 flex items-center justify-center rounded-full text-sm font-medium mb-1
                          ${isToday ? 'bg-blue-600 text-white' : 'text-gray-700'}`}
                        >
                          {day}
                        </div>
                        {/* Event + timer pills */}
                        <div className="space-y-0.5">
                          {dayEvents.slice(0, 2).map(ev => {
                            const c = getColor(ev.color);
                            return (
                              <div key={ev.id} className={`text-xs px-1.5 py-0.5 rounded font-medium truncate border ${c.light}`}>
                                {ev.alert_enabled && !ev.alert_sent && <span className="mr-1">🔔</span>}
                                {ev.title}
                              </div>
                            );
                          })}
                          {/* Lead timer pills */}
                          {(timersByDate[key!] ?? []).slice(0, 2).map(t => (
                            <div key={t.leadId} className="text-xs px-1.5 py-0.5 rounded font-medium truncate border bg-orange-50 border-orange-200 text-orange-700">
                              ⏱ {t.label}
                            </div>
                          ))}
                          {(dayEvents.length + (timersByDate[key!]?.length ?? 0)) > 4 && (
                            <div className="text-xs text-gray-400 pl-1">
                              +{dayEvents.length + (timersByDate[key!]?.length ?? 0) - 4} more
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Day Panel (slide in from right) */}
      <div className={`flex-shrink-0 bg-white border-l border-[#e5e5e5] flex flex-col transition-all duration-300 overflow-hidden
        ${selectedDate ? 'w-96' : 'w-0'}`}
      >
        {selectedDate && (
          <>
            {/* Panel header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Selected</p>
                <h2 className="text-sm font-bold text-gray-900 mt-0.5">{fmtDate(selectedDate)}</h2>
              </div>
              <button onClick={() => { setSelectedDate(null); setShowForm(false); }}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>

            {/* Day Notes */}
            <div className="px-4 pt-3 pb-2 border-b border-gray-100">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Day Notes</p>
                {dayNotesSaveError ? (
                  <span className="text-xs text-red-500">Save failed — check DB setup</span>
                ) : (
                  <span className={`text-xs transition-opacity ${dayNotesSaved ? 'opacity-0' : 'opacity-100 text-blue-500'}`}>
                    Saving…
                  </span>
                )}
              </div>
              <textarea
                value={dayNotes}
                onChange={e => handleDayNotesChange(e.target.value)}
                placeholder="Write anything for this day…"
                rows={4}
                className="w-full text-sm text-gray-700 placeholder-gray-300 resize-none focus:outline-none bg-transparent leading-relaxed"
              />
            </div>

            {/* Events list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {/* Lead timers expiring on this day */}
              {(timersByDate[selectedDate] ?? []).length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-orange-500 uppercase tracking-wide">Lead Timers Expiring</p>
                  {(timersByDate[selectedDate] ?? []).map(t => {
                    const expireTime = new Date(t.timerEndDate).toLocaleTimeString('en-US', {
                      hour: 'numeric', minute: '2-digit',
                    });
                    return (
                      <div key={t.leadId} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-orange-50 border border-orange-200">
                        <span className="text-lg">⏱</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-orange-800 truncate">{t.label}</p>
                          <p className="text-xs text-orange-500">Timer expires at {expireTime}</p>
                        </div>
                        <button
                          onClick={async () => {
                            setClearingTimer(t.leadId);
                            await fetch(`/api/calendar/timers?leadId=${t.leadId}`, { method: 'DELETE' });
                            setTimers(prev => prev.filter(x => x.leadId !== t.leadId));
                            setClearingTimer(null);
                          }}
                          disabled={clearingTimer === t.leadId}
                          className="text-xs text-orange-400 hover:text-red-500 underline flex-shrink-0"
                        >
                          {clearingTimer === t.leadId ? '…' : 'Clear'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {selectedEvents.length === 0 && (timersByDate[selectedDate] ?? []).length === 0 && !showForm && (
                <div className="text-center py-12">
                  <div className="text-4xl mb-3">📅</div>
                  <p className="text-sm text-gray-400">Nothing scheduled</p>
                  <p className="text-xs text-gray-300 mt-1">Click below to add something</p>
                </div>
              )}

              {selectedEvents.map(ev => {
                const c = getColor(ev.color);
                return (
                  <div key={ev.id} className={`rounded-xl border p-3 ${c.light}`}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold">{ev.title}</p>
                      <div className="flex gap-1 flex-shrink-0">
                        <button onClick={() => openEditForm(ev)}
                          className="text-xs text-gray-500 hover:text-gray-700 underline">Edit</button>
                        <button
                          onClick={() => deleteEvent(ev.id)}
                          disabled={deleting === ev.id}
                          className="text-xs text-red-400 hover:text-red-600 underline"
                        >
                          {deleting === ev.id ? '…' : 'Delete'}
                        </button>
                      </div>
                    </div>
                    {ev.notes && <p className="text-xs mt-1 opacity-75 whitespace-pre-wrap">{ev.notes}</p>}
                    {ev.alert_enabled && (
                      <div className="flex items-center gap-1 mt-2 text-xs opacity-70">
                        <span>{ev.alert_sent ? '✓' : '🔔'}</span>
                        <span>
                          {ev.alert_sent ? 'Alert sent' : `Alert: ${ev.alert_at ? new Date(ev.alert_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Set'}`}
                        </span>
                        {ev.alert_phone && <span>→ {ev.alert_phone}</span>}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Event form */}
              {showForm && (
                <div className="border border-gray-200 rounded-xl p-4 space-y-3 bg-gray-50">
                  <p className="text-xs font-semibold text-gray-500 uppercase">
                    {editingEvent ? 'Edit Event' : 'New Event'}
                  </p>

                  <input
                    autoFocus
                    value={form.title}
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="Event title"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />

                  <textarea
                    value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Notes (optional)"
                    rows={3}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />

                  {/* Color picker */}
                  <div>
                    <p className="text-xs text-gray-400 mb-1.5">Color</p>
                    <div className="flex gap-2">
                      {COLOR_OPTIONS.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setForm(f => ({ ...f, color: c.id }))}
                          className={`w-6 h-6 rounded-full ${c.bg} transition-transform ${form.color === c.id ? 'ring-2 ring-offset-1 ring-gray-600 scale-110' : 'opacity-60 hover:opacity-100'}`}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Alert toggle */}
                  <div className="border-t border-gray-200 pt-3 space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.alertEnabled}
                        onChange={e => setForm(f => ({ ...f, alertEnabled: e.target.checked }))}
                        className="w-4 h-4 accent-blue-600"
                      />
                      <span className="text-sm text-gray-700 font-medium">🔔 Text me an alert</span>
                    </label>

                    {form.alertEnabled && (
                      <div className="space-y-2 pl-6">
                        <div>
                          <p className="text-xs text-gray-400 mb-1">Alert date &amp; time</p>
                          <input
                            type="datetime-local"
                            value={form.alertAt}
                            onChange={e => setForm(f => ({ ...f, alertAt: e.target.value }))}
                            className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          {/* Quick presets */}
                          <div className="flex gap-1 flex-wrap mt-1">
                            {[
                              { label: 'Day before 9am', fn: () => { const d = new Date(selectedDate + 'T09:00:00'); d.setDate(d.getDate() - 1); return d.toISOString().slice(0,16); } },
                              { label: '1hr before', fn: () => { const d = new Date(selectedDate + 'T09:00:00'); d.setHours(d.getHours() - 1); return d.toISOString().slice(0,16); } },
                              { label: '9am', fn: () => `${selectedDate}T09:00` },
                            ].map(p => (
                              <button key={p.label} type="button"
                                onClick={() => setForm(f => ({ ...f, alertAt: p.fn() }))}
                                className="text-xs px-2 py-0.5 bg-white border border-gray-200 rounded-full hover:bg-blue-50 hover:border-blue-300 transition-colors">
                                {p.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400 mb-1">Phone number to text</p>
                          <input
                            type="tel"
                            value={form.alertPhone}
                            onChange={e => setForm(f => ({ ...f, alertPhone: e.target.value }))}
                            placeholder="+1 (555) 000-0000"
                            className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={saveEvent}
                      disabled={saving || !form.title.trim()}
                      className="flex-1 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      {saving ? 'Saving…' : editingEvent ? 'Update' : 'Save Event'}
                    </button>
                    <button
                      onClick={() => { setShowForm(false); setEditingEvent(null); setForm(blankForm()); }}
                      className="px-4 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Add event button */}
            {!showForm && (
              <div className="p-4 border-t border-gray-100">
                <button
                  onClick={() => openAddForm(selectedDate)}
                  className="w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Event
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
