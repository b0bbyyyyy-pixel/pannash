'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { JotPad, type JotPadHandle } from '@/components/JotPad';

interface LeadTimer {
  leadId: string;
  label: string;
  timerType: string;
  timerEndDate: string;
}

interface CalendarEvent {
  id: string;
  date: string;
  end_date: string | null;
  title: string;
  notes: string | null;
  alert_enabled: boolean;
  alert_at: string | null;
  alert_phone: string | null;
  alert_sent: boolean;
  color: string;
  start_time?: string | null;
}

interface Habit {
  id: string;
  name: string;
  marks: Record<string, boolean>;
}

interface WeekNotes {
  top_priorities: string;
  personal: string;
  work: string;
  coming_up: string;
}

interface EventFormState {
  title: string;
  notes: string;
  alertEnabled: boolean;
  alertAt: string;
  alertPhone: string;
  multiDay: boolean;
  endDate: string;
  startTime: string;
  color: string;
}

type View = 'month' | 'week' | 'trackers';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_SHORT = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
const HOURS = Array.from({ length: 18 }, (_, i) => i + 5); // 5am–10pm
const PAGE_NOTES_KEY = '_notes';

interface DayTask {
  id: string;
  text: string;
  done: boolean;
}

function newTaskId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const EVENT_COLORS = [
  { id: 'black',  label: 'Black',  hex: '#1a1a1a' },
  { id: 'gray',   label: 'Gray',   hex: '#6b6b6b' },
  { id: 'blue',   label: 'Blue',   hex: '#2563eb' },
  { id: 'green',  label: 'Green',  hex: '#15803d' },
  { id: 'red',    label: 'Red',    hex: '#b91c1c' },
  { id: 'amber',  label: 'Amber',  hex: '#b45309' },
  { id: 'purple', label: 'Purple', hex: '#6d28d9' },
];

function eventTextColor(colorId: string | null | undefined): string {
  return EVENT_COLORS.find(c => c.id === colorId)?.hex ?? '#1a1a1a';
}

const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function weekdayLetter(year: number, month: number, day: number): string {
  const dow = new Date(year, month, day).getDay();
  return WEEKDAY_LETTERS[dow === 0 ? 6 : dow - 1];
}

function dayHabitsComplete(habits: Habit[], day: number): boolean {
  if (habits.length === 0) return false;
  const key = String(day);
  return habits.every(h => !!h.marks[key]);
}

const blankForm = (): EventFormState => ({
  title: '', notes: '',
  alertEnabled: false, alertAt: '', alertPhone: '',
  multiDay: false, endDate: '', startTime: '', color: 'black',
});

const blankWeek = (): WeekNotes => ({
  top_priorities: '', personal: '', work: '', coming_up: '',
});

function dateKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function todayKey() {
  const t = new Date();
  return dateKey(t.getFullYear(), t.getMonth(), t.getDate());
}

function parseKey(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function mondayOf(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = x.getDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  x.setDate(x.getDate() + offset);
  return x;
}

function isoWeek(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil((((t.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function fmtHour(h: number) {
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return h >= 12 ? `${hour12}:00 pm` : `${hour12}:00`;
}

/** "19:15" → "7:15 pm"  |  "09:00" → "9:00" */
function fmtClock(t: string | null | undefined): string {
  if (!t) return '';
  const [hs, ms] = t.split(':');
  const h = parseInt(hs, 10);
  const m = parseInt(ms ?? '0', 10);
  if (!Number.isFinite(h)) return t;
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const mm = String(Number.isFinite(m) ? m : 0).padStart(2, '0');
  return h >= 12 ? `${hour12}:${mm} pm` : `${hour12}:${mm}`;
}

function hourFromTime(t: string | null | undefined): number | null {
  if (!t) return null;
  const h = parseInt(t.split(':')[0], 10);
  return Number.isFinite(h) ? h : null;
}

export default function CalendarClient() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [view, setView] = useState<View>('month');
  const [weekStart, setWeekStart] = useState<string | null>(null);

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [timers, setTimers] = useState<LeadTimer[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const [dayNotes, setDayNotes] = useState('');
  const [dayFinished, setDayFinished] = useState(false);
  const [daySlots, setDaySlots] = useState<Record<string, string>>({});
  const [dayTasks, setDayTasks] = useState<DayTask[]>([]);
  const [dayJot, setDayJot] = useState<string | null>(null);
  const [dayNotesSaved, setDayNotesSaved] = useState(true);
  const dayNotesDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editingDateRef = useRef<string | null>(null);

  const [monthNotes, setMonthNotes] = useState('');
  const [habits, setHabits] = useState<Habit[]>([]);
  const [newHabit, setNewHabit] = useState('');
  const plannerDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [weekNotes, setWeekNotes] = useState<WeekNotes>(blankWeek());
  const weekDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<EventFormState>(blankForm());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [clearingTimer, setClearingTimer] = useState<string | null>(null);

  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const tk = todayKey();

  const fetchEvents = useCallback(async () => {
    const [evRes, timerRes] = await Promise.all([
      fetch(`/api/calendar/events?month=${monthKey}`),
      fetch('/api/calendar/timers'),
    ]);
    if (evRes.ok) { const d = await evRes.json(); setEvents(d.events ?? []); }
    if (timerRes.ok) { const d = await timerRes.json(); setTimers(d.timers ?? []); }
    setLoading(false);
  }, [monthKey]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  useEffect(() => {
    fetch(`/api/calendar/planner?month=${monthKey}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return;
        setMonthNotes(d.month_notes ?? '');
        setHabits(Array.isArray(d.habits) ? d.habits : []);
      })
      .catch(() => {});
  }, [monthKey]);

  useEffect(() => {
    const id = setInterval(() => {
      fetch('/api/calendar/alerts', { method: 'POST' }).catch(() => {});
    }, 60000);
    fetch('/api/calendar/alerts', { method: 'POST' }).catch(() => {});
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!selectedDate) return;
    editingDateRef.current = selectedDate;
    setDayNotes('');
    setDayFinished(false);
    setDaySlots({});
    setDayTasks([]);
    setDayJot(null);
    setDayNotesSaved(true);
    fetch(`/api/calendar/day-notes?date=${selectedDate}`)
      .then(r => r.json())
      .then(d => {
        setDayNotes(d.notes ?? '');
        setDayFinished(!!d.finished);
        setDaySlots(d.slots && typeof d.slots === 'object' ? d.slots : {});
        setDayTasks(Array.isArray(d.tasks) ? d.tasks : []);
      })
      .catch(() => {});
    fetch(`/api/calendar/jot?date=${selectedDate}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.image) setDayJot(d.image); })
      .catch(() => {});
  }, [selectedDate]);

  useEffect(() => {
    if (!weekStart) return;
    fetch(`/api/calendar/week?start=${weekStart}`)
      .then(r => r.ok ? r.json() : blankWeek())
      .then(d => setWeekNotes({
        top_priorities: d.top_priorities ?? '',
        personal: d.personal ?? '',
        work: d.work ?? '',
        coming_up: d.coming_up ?? '',
      }))
      .catch(() => setWeekNotes(blankWeek()));
  }, [weekStart]);

  function persistDay(next: { notes: string; finished: boolean; slots: Record<string, string>; tasks: DayTask[] }) {
    const dateToSave = editingDateRef.current;
    if (!dateToSave) return;
    setDayNotesSaved(false);
    if (dayNotesDebounce.current) clearTimeout(dayNotesDebounce.current);
    dayNotesDebounce.current = setTimeout(async () => {
      await fetch('/api/calendar/day-notes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: dateToSave, ...next }),
      }).catch(() => {});
      setDayNotesSaved(true);
    }, 500);
  }

  function persistPlanner(nextNotes: string, nextHabits: Habit[]) {
    if (plannerDebounce.current) clearTimeout(plannerDebounce.current);
    plannerDebounce.current = setTimeout(() => {
      fetch('/api/calendar/planner', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: monthKey, month_notes: nextNotes, habits: nextHabits }),
      }).catch(() => {});
    }, 500);
  }

  function persistWeek(next: WeekNotes) {
    if (!weekStart) return;
    if (weekDebounce.current) clearTimeout(weekDebounce.current);
    weekDebounce.current = setTimeout(() => {
      fetch('/api/calendar/week', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start: weekStart, ...next }),
      }).catch(() => {});
    }, 500);
  }

  const eventsByDate: Record<string, CalendarEvent[]> = {};
  events.forEach(e => {
    const start = e.date;
    const end = (e.end_date && e.end_date >= start) ? e.end_date : start;
    const cursor = new Date(start + 'T00:00:00');
    const endDate = new Date(end + 'T00:00:00');
    while (cursor <= endDate) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
      if (!eventsByDate[key]) eventsByDate[key] = [];
      eventsByDate[key].push(e);
      cursor.setDate(cursor.getDate() + 1);
    }
  });

  const timersByDate: Record<string, LeadTimer[]> = {};
  timers.forEach(t => {
    const d = new Date(t.timerEndDate);
    const key = dateKey(d.getFullYear(), d.getMonth(), d.getDate());
    if (!timersByDate[key]) timersByDate[key] = [];
    timersByDate[key].push(t);
  });

  // Monday-start grid including adjacent-month days
  const gridStart = mondayOf(new Date(year, month, 1));
  const weeks: Date[][] = [];
  const cursor = new Date(gridStart);
  while (true) {
    const row: Date[] = [];
    for (let i = 0; i < 7; i++) {
      row.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(row);
    if (cursor.getMonth() !== month && cursor.getDay() === 1 && weeks.length >= 4) break;
    if (weeks.length >= 6) break;
  }

  function openWeek(monday: Date) {
    setWeekStart(dateKey(monday.getFullYear(), monday.getMonth(), monday.getDate()));
    setView('week');
    setSelectedDate(null);
    setShowForm(false);
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

  function openAddForm(date: string, hour?: number) {
    setEditingEvent(null);
    const hh = hour != null ? `${String(hour).padStart(2, '0')}:00` : '';
    setForm({
      ...blankForm(),
      alertAt: `${date}T${hh || '09:00'}`,
      endDate: date,
      startTime: hh,
    });
    setShowForm(true);
  }

  function openEditForm(event: CalendarEvent) {
    setEditingEvent(event);
    const hasEndDate = !!event.end_date && event.end_date !== event.date;
    setForm({
      title: event.title,
      notes: event.notes ?? '',
      alertEnabled: event.alert_enabled,
      alertAt: event.alert_at ? event.alert_at.slice(0, 16) : '',
      alertPhone: event.alert_phone ?? '',
      multiDay: hasEndDate,
      endDate: event.end_date ?? event.date,
      startTime: event.start_time ?? '',
      color: event.color && EVENT_COLORS.some(c => c.id === event.color) ? event.color : 'black',
    });
    setShowForm(true);
  }

  async function saveEvent() {
    if (!form.title.trim() || !selectedDate) return;
    setSaving(true);
    setSaveError('');
    try {
      const payload = {
        date: selectedDate,
        end_date: form.multiDay && form.endDate && form.endDate >= selectedDate ? form.endDate : null,
        title: form.title.trim(),
        notes: form.notes.trim() || null,
        color: form.color || 'black',
        start_time: form.startTime || null,
        alertEnabled: form.alertEnabled,
        alertAt: form.alertEnabled && form.alertAt ? new Date(form.alertAt).toISOString() : null,
        alertPhone: form.alertEnabled ? form.alertPhone.trim() || null : null,
      };
      if (editingEvent) {
        const res = await fetch(`/api/calendar/events/${editingEvent.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const d = await res.json();
          setEvents(prev => prev.map(e => e.id === editingEvent.id ? d.event : e));
          setShowForm(false); setEditingEvent(null); setForm(blankForm());
        } else {
          const err = await res.json().catch(() => ({}));
          setSaveError(err.error || 'Save failed');
        }
      } else {
        const res = await fetch('/api/calendar/events', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const d = await res.json();
          setEvents(prev => [...prev, d.event]);
          setShowForm(false); setEditingEvent(null); setForm(blankForm());
        } else {
          const err = await res.json().catch(() => ({}));
          setSaveError(err.error || 'Save failed — run add-calendar.sql / add-calendar-planner.sql in Supabase.');
        }
      }
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setSaving(false);
    }
  }

  async function deleteEvent(id: string) {
    setDeleting(id);
    const res = await fetch(`/api/calendar/events/${id}`, { method: 'DELETE' });
    if (res.ok) setEvents(prev => prev.filter(e => e.id !== id));
    setDeleting(null);
  }

  const selectedEvents = selectedDate ? (eventsByDate[selectedDate] ?? []) : [];
  const untimed = selectedEvents.filter(e => hourFromTime(e.start_time) == null);

  const weekDates = weekStart
    ? Array.from({ length: 7 }, (_, i) => {
        const d = parseKey(weekStart);
        d.setDate(d.getDate() + i);
        return d;
      })
    : [];

  return (
    <div className="flex h-[calc(100vh-80px)] bg-white text-[#1a1a1a]">
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5e5e5]">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-[#d4d4d4] select-none">|</span>
            {view === 'week' && weekStart ? (
              <h1 className="text-sm font-semibold tracking-wide uppercase truncate">
                Week {isoWeek(parseKey(weekStart))}:{' '}
                {weekDates[0]?.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
                {' – '}
                {weekDates[6]?.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
              </h1>
            ) : view === 'trackers' ? (
              <h1 className="text-sm font-semibold tracking-wide uppercase">
                {MONTHS[month]} {year} | Trackers
              </h1>
            ) : (
              <h1 className="text-sm font-semibold tracking-wide uppercase">
                {MONTHS[month]} {year}
              </h1>
            )}
          </div>
          <div className="flex items-center gap-4 text-xs tracking-wide uppercase shrink-0">
            <button
              onClick={() => { setView('month'); setSelectedDate(null); }}
              className={view === 'month' ? 'font-semibold text-[#1a1a1a]' : 'text-[#9b9b9b] hover:text-[#1a1a1a]'}
            >
              Calendar
            </button>
            <span className="text-[#d4d4d4]">|</span>
            <button
              onClick={() => { setView('trackers'); setSelectedDate(null); }}
              className={view === 'trackers' ? 'font-semibold text-[#1a1a1a]' : 'text-[#9b9b9b] hover:text-[#1a1a1a]'}
            >
              Trackers
            </button>
            <span className="text-[#d4d4d4]">|</span>
            <button onClick={prevMonth} className="text-[#9b9b9b] hover:text-[#1a1a1a] px-1">‹</button>
            <button onClick={nextMonth} className="text-[#9b9b9b] hover:text-[#1a1a1a] px-1">›</button>
          </div>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-[#e5e5e5] border-t-[#1a1a1a] rounded-full animate-spin" />
          </div>
        ) : view === 'trackers' ? (
          <HabitTracker
            year={year}
            month={month}
            daysInMonth={daysInMonth}
            habits={habits}
            onChange={(next) => { setHabits(next); persistPlanner(monthNotes, next); }}
            newHabit={newHabit}
            setNewHabit={setNewHabit}
          />
        ) : view === 'week' && weekStart ? (
          <WeekView
            dates={weekDates}
            eventsByDate={eventsByDate}
            weekNotes={weekNotes}
            onNotes={(next) => { setWeekNotes(next); persistWeek(next); }}
            onOpenDay={(key) => { setSelectedDate(key); }}
            selectedDate={selectedDate}
          />
        ) : (
          <MonthView
            year={year}
            month={month}
            weeks={weeks}
            eventsByDate={eventsByDate}
            timersByDate={timersByDate}
            todayKey={tk}
            selectedDate={selectedDate}
            monthNotes={monthNotes}
            habits={habits}
            onMonthNotes={(t) => { setMonthNotes(t); persistPlanner(t, habits); }}
            onOpenDay={(key) => { setSelectedDate(key); setView('month'); }}
            onOpenWeek={openWeek}
          />
        )}
      </div>

      {/* Day side panel */}
      <div className={`shrink-0 bg-white border-l border-[#e5e5e5] flex flex-col overflow-hidden transition-all duration-300 ${selectedDate ? 'w-[440px]' : 'w-0'}`}>
        {selectedDate && (
          <DayPanel
            date={selectedDate}
            events={selectedEvents}
            untimed={untimed}
            timers={timersByDate[selectedDate] ?? []}
            dayNotes={dayNotes}
            dayFinished={dayFinished}
            daySlots={daySlots}
            jotImage={dayJot}
            dayNotesSaved={dayNotesSaved}
            showForm={showForm}
            form={form}
            setForm={setForm}
            editingEvent={editingEvent}
            saving={saving}
            saveError={saveError}
            deleting={deleting}
            clearingTimer={clearingTimer}
            onClose={() => { setSelectedDate(null); setShowForm(false); }}
            onNotes={(t) => { setDayNotes(t); persistDay({ notes: t, finished: dayFinished, slots: daySlots, tasks: dayTasks }); }}
            onFinished={() => {
              const next = !dayFinished;
              setDayFinished(next);
              persistDay({ notes: dayNotes, finished: next, slots: daySlots, tasks: dayTasks });
            }}
            onSlotChange={(h, text) => {
              const next = { ...daySlots, [String(h)]: text };
              if (!text.trim()) delete next[String(h)];
              setDaySlots(next);
              persistDay({ notes: dayNotes, finished: dayFinished, slots: next, tasks: dayTasks });
            }}
            onPageNotes={(t) => {
              const next = { ...daySlots };
              if (t.trim()) next[PAGE_NOTES_KEY] = t;
              else delete next[PAGE_NOTES_KEY];
              setDaySlots(next);
              persistDay({ notes: dayNotes, finished: dayFinished, slots: next, tasks: dayTasks });
            }}
            dayTasks={dayTasks}
            onTasks={(next) => {
              setDayTasks(next);
              persistDay({ notes: dayNotes, finished: dayFinished, slots: daySlots, tasks: next });
            }}
            onJotSave={async (image) => {
              if (!selectedDate) return;
              const res = await fetch('/api/calendar/jot', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date: selectedDate, image: image || '', text: '' }),
              });
              if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                throw new Error(d.error || 'Could not save jot');
              }
              setDayJot(image || null);
            }}
            onMakeEvent={async (h) => {
              const title = (daySlots[String(h)] ?? '').trim();
              if (!title || !selectedDate) return;
              const start_time = `${String(h).padStart(2, '0')}:00`;
              const res = await fetch('/api/calendar/events', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  date: selectedDate,
                  title,
                  start_time,
                  color: 'black',
                }),
              });
              if (!res.ok) return;
              const d = await res.json();
              setEvents(prev => [...prev, d.event]);
              const next = { ...daySlots };
              delete next[String(h)];
              setDaySlots(next);
              persistDay({ notes: dayNotes, finished: dayFinished, slots: next, tasks: dayTasks });
            }}
            onAdd={() => openAddForm(selectedDate)}
            onEdit={openEditForm}
            onDelete={deleteEvent}
            onSave={saveEvent}
            onCancelForm={() => { setShowForm(false); setEditingEvent(null); setForm(blankForm()); setSaveError(''); }}
            onClearTimer={async (leadId) => {
              setClearingTimer(leadId);
              await fetch(`/api/calendar/timers?leadId=${leadId}`, { method: 'DELETE' });
              setTimers(prev => prev.filter(x => x.leadId !== leadId));
              setClearingTimer(null);
            }}
          />
        )}
      </div>
    </div>
  );
}

function MonthView({
  year, month, weeks, eventsByDate, timersByDate, todayKey, selectedDate,
  monthNotes, habits, onMonthNotes, onOpenDay, onOpenWeek,
}: {
  year: number;
  month: number;
  weeks: Date[][];
  eventsByDate: Record<string, CalendarEvent[]>;
  timersByDate: Record<string, LeadTimer[]>;
  todayKey: string;
  selectedDate: string | null;
  monthNotes: string;
  habits: Habit[];
  onMonthNotes: (t: string) => void;
  onOpenDay: (key: string) => void;
  onOpenWeek: (monday: Date) => void;
}) {
  return (
    <div className="flex-1 flex min-h-0">
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <div className="grid border-b border-[#e5e5e5]" style={{ gridTemplateColumns: '44px repeat(7, 1fr)' }}>
          <div />
          {DAYS.map(d => (
            <div key={d} className="py-2.5 text-center text-[10px] font-medium uppercase tracking-wider text-[#9b9b9b]">
              {d}
            </div>
          ))}
        </div>
        <div className="flex-1 min-h-0 grid" style={{ gridTemplateRows: `repeat(${weeks.length}, 1fr)` }}>
          {weeks.map((row, wi) => {
            const monday = row[0];
            const wnum = isoWeek(monday);
            return (
              <div
                key={wi}
                className="grid border-b border-[#e5e5e5] last:border-b-0 min-h-0"
                style={{ gridTemplateColumns: '44px repeat(7, 1fr)' }}
              >
                <div className="flex flex-col items-center justify-start pt-2 gap-1.5 border-r border-[#f0f0f0]">
                  <span className="text-[9px] text-[#c4c4c4]">W{wnum}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); onOpenWeek(monday); }}
                    title="Weekly overview"
                    className="w-2.5 h-2.5 rounded-full border border-[#1a1a1a] hover:bg-[#1a1a1a] transition-colors"
                  />
                </div>
                {row.map((d) => {
                  const key = dateKey(d.getFullYear(), d.getMonth(), d.getDate());
                  const inMonth = d.getMonth() === month && d.getFullYear() === year;
                  const dayEvents = eventsByDate[key] ?? [];
                  const dayTimers = timersByDate[key] ?? [];
                  const isToday = key === todayKey;
                  const isSelected = key === selectedDate;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => onOpenDay(key)}
                      className={`relative text-left p-1.5 border-r border-[#f0f0f0] last:border-r-0 min-h-0 overflow-hidden hover:bg-[#fafafa] ${
                        isSelected ? 'bg-[#f5f5f5]' : ''
                      } ${!inMonth ? 'opacity-30' : ''}`}
                    >
                      {inMonth && habits.length > 0 && key <= todayKey && (
                        <span
                          className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full"
                          style={{ background: dayHabitsComplete(habits, d.getDate()) ? '#16a34a' : '#dc2626' }}
                        />
                      )}
                      <div className={`w-6 h-6 flex items-center justify-center text-xs mb-1 ${
                        isToday ? 'bg-[#1a1a1a] text-white rounded-full font-medium' : 'text-[#1a1a1a]'
                      }`}>
                        {d.getDate()}
                      </div>
                      <div className="space-y-px">
                        {dayEvents.slice(0, 3).map(ev => (
                          <div
                            key={ev.id}
                            className="text-[10px] leading-[13px] truncate font-medium"
                            style={{ color: eventTextColor(ev.color) }}
                          >
                            {ev.title}
                          </div>
                        ))}
                        {dayTimers.slice(0, Math.max(0, 3 - dayEvents.length)).map(t => (
                          <div key={t.leadId} className="text-[10px] leading-[13px] truncate text-[#888]">
                            {t.label}
                          </div>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      <div className="w-40 shrink-0 border-l border-[#e5e5e5] flex flex-col bg-white">
        <p className="py-2.5 text-center text-[10px] font-medium uppercase tracking-wider text-[#9b9b9b] border-b border-[#e5e5e5]">
          Notes
        </p>
        <textarea
          value={monthNotes}
          onChange={e => onMonthNotes(e.target.value)}
          className="flex-1 p-2 text-xs text-[#1a1a1a] resize-none focus:outline-none bg-white"
        />
      </div>
    </div>
  );
}

function WeekView({
  dates, eventsByDate, weekNotes, onNotes, onOpenDay, selectedDate,
}: {
  dates: Date[];
  eventsByDate: Record<string, CalendarEvent[]>;
  weekNotes: WeekNotes;
  onNotes: (n: WeekNotes) => void;
  onOpenDay: (key: string) => void;
  selectedDate: string | null;
}) {
  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <div className="grid grid-cols-7 border-b border-[#e5e5e5] min-h-[220px]">
        {dates.map(d => {
          const key = dateKey(d.getFullYear(), d.getMonth(), d.getDate());
          const list = eventsByDate[key] ?? [];
          return (
            <button
              key={key}
              type="button"
              onClick={() => onOpenDay(key)}
              className={`text-left p-3 border-r border-[#e5e5e5] last:border-r-0 hover:bg-[#fafafa] ${
                selectedDate === key ? 'bg-[#f5f5f5]' : ''
              }`}
            >
              <p className="text-[10px] uppercase tracking-wider text-[#9b9b9b] mb-2">
                {d.getDate()} {DAYS_SHORT[d.getDay() === 0 ? 6 : d.getDay() - 1]}
              </p>
              <div className="space-y-1">
                {list.map(ev => (
                  <p
                    key={ev.id}
                    className="text-xs truncate font-medium"
                    style={{ color: eventTextColor(ev.color) }}
                  >
                    {ev.start_time ? <span className="text-[#9b9b9b]">{fmtClock(ev.start_time)} </span> : null}
                    {ev.title}
                  </p>
                ))}
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-0 flex-1 min-h-[240px]">
        <div className="border-r border-[#e5e5e5] p-4">
          <p className="text-[10px] uppercase tracking-wider text-[#9b9b9b] mb-2">Top priorities</p>
          <textarea
            value={weekNotes.top_priorities}
            onChange={e => onNotes({ ...weekNotes, top_priorities: e.target.value })}
            className="w-full h-20 mb-4 text-sm resize-none focus:outline-none bg-[#fafafa] p-2"
          />
          <p className="text-[10px] uppercase tracking-wider text-[#9b9b9b] mb-2">Personal</p>
          <textarea
            value={weekNotes.personal}
            onChange={e => onNotes({ ...weekNotes, personal: e.target.value })}
            className="w-full flex-1 min-h-[80px] text-sm resize-none focus:outline-none border-t border-[#e5e5e5] pt-2"
          />
        </div>
        <div className="border-r border-[#e5e5e5] p-4">
          <p className="text-[10px] uppercase tracking-wider text-[#9b9b9b] mb-2">Work</p>
          <textarea
            value={weekNotes.work}
            onChange={e => onNotes({ ...weekNotes, work: e.target.value })}
            className="w-full h-full min-h-[160px] text-sm resize-none focus:outline-none"
          />
        </div>
        <div className="p-4">
          <p className="text-[10px] uppercase tracking-wider text-[#9b9b9b] mb-2">Next week / coming up</p>
          <textarea
            value={weekNotes.coming_up}
            onChange={e => onNotes({ ...weekNotes, coming_up: e.target.value })}
            className="w-full h-full min-h-[160px] text-sm resize-none focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
}

function HabitTracker({
  year, month, daysInMonth, habits, onChange, newHabit, setNewHabit,
}: {
  year: number;
  month: number;
  daysInMonth: number;
  habits: Habit[];
  onChange: (h: Habit[]) => void;
  newHabit: string;
  setNewHabit: (s: string) => void;
}) {
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="flex items-center gap-3 mb-6 text-[10px] uppercase tracking-wider text-[#9b9b9b]">
        {MONTHS_SHORT.map((m, i) => (
          <span key={m} className={i === month ? 'text-[#1a1a1a] font-semibold underline' : ''}>{m}</span>
        ))}
      </div>
      <p className="text-[10px] uppercase tracking-wider text-[#9b9b9b] mb-1">Habit tracker</p>
      <p className="text-xs text-[#9b9b9b] mb-4">Track a habit or daily activity for this month.</p>

      <div className="overflow-x-auto">
        <table className="border-collapse text-[10px]">
          <thead>
            <tr>
              <th className="w-40 text-left font-medium text-[#9b9b9b] pr-3 sticky left-0 bg-white" />
              {days.map(d => (
                <th key={d} className="w-7 pt-1 pb-0.5 text-center font-normal text-[#9b9b9b] leading-none">
                  <div>{d}</div>
                  <div className="text-[8px] text-[#c4c4c4] mt-0.5">{weekdayLetter(year, month, d)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {habits.map(h => (
              <tr key={h.id}>
                <td className="pr-3 py-1 sticky left-0 bg-white">
                  <div className="flex items-center gap-2">
                    <input
                      value={h.name}
                      onChange={e => onChange(habits.map(x => x.id === h.id ? { ...x, name: e.target.value } : x))}
                      className="w-36 text-xs text-[#1a1a1a] focus:outline-none border-b border-transparent focus:border-[#e5e5e5] bg-transparent"
                    />
                    <button
                      onClick={() => onChange(habits.filter(x => x.id !== h.id))}
                      className="text-[#c4c4c4] hover:text-[#1a1a1a]"
                    >
                      ×
                    </button>
                  </div>
                </td>
                {days.map(d => {
                  const on = !!h.marks[String(d)];
                  return (
                    <td key={d} className="p-0">
                      <button
                        type="button"
                        onClick={() => onChange(habits.map(x => {
                          if (x.id !== h.id) return x;
                          const marks = { ...x.marks, [String(d)]: !on };
                          return { ...x, marks };
                        }))}
                        className={`w-7 h-7 border border-[#e5e5e5] ${on ? 'bg-[#1a1a1a]' : 'bg-white hover:bg-[#f5f5f5]'}`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form
        className="mt-4 flex gap-2 max-w-sm"
        onSubmit={e => {
          e.preventDefault();
          const name = newHabit.trim();
          if (!name) return;
          onChange([...habits, { id: crypto.randomUUID(), name, marks: {} }]);
          setNewHabit('');
        }}
      >
        <input
          value={newHabit}
          onChange={e => setNewHabit(e.target.value)}
          placeholder="Add a habit"
          className="flex-1 text-sm border-b border-[#e5e5e5] py-1 focus:outline-none focus:border-[#1a1a1a]"
        />
        <button type="submit" className="text-xs font-medium text-[#1a1a1a]">Add</button>
      </form>
    </div>
  );
}

function DayPanel(props: {
  date: string;
  events: CalendarEvent[];
  untimed: CalendarEvent[];
  timers: LeadTimer[];
  dayNotes: string;
  dayFinished: boolean;
  daySlots: Record<string, string>;
  dayTasks: DayTask[];
  jotImage: string | null;
  dayNotesSaved: boolean;
  showForm: boolean;
  form: EventFormState;
  setForm: React.Dispatch<React.SetStateAction<EventFormState>>;
  editingEvent: CalendarEvent | null;
  saving: boolean;
  saveError: string;
  deleting: string | null;
  clearingTimer: string | null;
  onClose: () => void;
  onNotes: (t: string) => void;
  onFinished: () => void;
  onSlotChange: (h: number, text: string) => void;
  onPageNotes: (t: string) => void;
  onTasks: (tasks: DayTask[]) => void;
  onJotSave: (image: string) => Promise<void>;
  onMakeEvent: (h: number) => void;
  onAdd: () => void;
  onEdit: (e: CalendarEvent) => void;
  onDelete: (id: string) => void;
  onSave: () => void;
  onCancelForm: () => void;
  onClearTimer: (leadId: string) => void;
}) {
  const [hoursOpen, setHoursOpen] = useState(false);
  const [localTasks, setLocalTasks] = useState<DayTask[]>(props.dayTasks);
  const [taskDraft, setTaskDraft] = useState('');
  const [showJot, setShowJot] = useState(false);
  const [jotSaving, setJotSaving] = useState(false);
  const [jotError, setJotError] = useState('');
  const jotRef = useRef<JotPadHandle>(null);
  const taskDraftRef = useRef(taskDraft);
  taskDraftRef.current = taskDraft;
  const localTasksRef = useRef(localTasks);
  localTasksRef.current = localTasks;
  const onTasksRef = useRef(props.onTasks);
  onTasksRef.current = props.onTasks;

  useEffect(() => {
    setHoursOpen(false);
    setShowJot(false);
    setJotError('');
    const leftover = taskDraftRef.current.trim();
    if (leftover) {
      onTasksRef.current([...localTasksRef.current, { id: newTaskId(), text: leftover, done: false }]);
    }
    setTaskDraft('');
    setLocalTasks(props.dayTasks);
  }, [props.date]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (taskDraftRef.current) return;
    setLocalTasks(props.dayTasks);
  }, [props.dayTasks]);

  function writeTasks(next: DayTask[]) {
    setLocalTasks(next);
    props.onTasks(next);
  }
  useEffect(() => {
    if (!showJot) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setShowJot(false); setJotError(''); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showJot]);
  const d = parseKey(props.date);
  const eventsByHour: Record<number, CalendarEvent[]> = {};
  props.events.forEach(e => {
    const h = hourFromTime(e.start_time);
    if (h != null) {
      if (!eventsByHour[h]) eventsByHour[h] = [];
      eventsByHour[h].push(e);
    }
  });

  const visibleHours = hoursOpen
    ? HOURS
    : HOURS.filter(h => {
        const written = (props.daySlots[String(h)] ?? '').trim();
        return written.length > 0 || (eventsByHour[h] ?? []).length > 0;
      });

  async function saveJot() {
    if (jotSaving) return;
    setJotSaving(true);
    setJotError('');
    try {
      const image = jotRef.current?.isBlank() ? '' : (jotRef.current?.toDataURL() ?? '');
      await props.onJotSave(image);
      setShowJot(false);
    } catch (err) {
      setJotError(err instanceof Error ? err.message : 'Could not save jot');
    } finally {
      setJotSaving(false);
    }
  }

  return (
    <div className="relative flex flex-col h-full min-h-0">
      <div className="px-5 py-4 border-b border-[#e5e5e5] flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide">
            {d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
          <p className="text-[11px] text-[#9b9b9b] mt-0.5">
            {d.toLocaleDateString('en-US', { weekday: 'long' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={props.onFinished}
            className={`text-[11px] uppercase tracking-wide px-2.5 py-1 border transition-colors ${
              props.dayFinished
                ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]'
                : 'border-[#e5e5e5] text-[#1a1a1a] hover:border-[#1a1a1a]'
            }`}
          >
            {props.dayFinished ? 'Finished' : 'Finish'}
          </button>
          <button onClick={props.onClose} className="text-[#9b9b9b] hover:text-[#1a1a1a] text-lg leading-none">×</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 flex flex-col">
        <div className="px-5 py-3 border-b border-[#e5e5e5] shrink-0">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[10px] uppercase tracking-wider text-[#9b9b9b]">Today&apos;s focus</p>
            {!props.dayNotesSaved && <span className="text-[10px] text-[#9b9b9b]">Saving…</span>}
          </div>
          <textarea
            value={props.dayNotes}
            onChange={e => props.onNotes(e.target.value)}
            placeholder="What matters today"
            rows={3}
            className="w-full text-sm resize-none focus:outline-none bg-transparent border-b border-[#e5e5e5] py-1"
          />
        </div>

        <div className="border-b border-[#e5e5e5] shrink-0">
          <button
            type="button"
            onClick={() => setHoursOpen(o => !o)}
            className="w-full flex items-center justify-between px-5 py-2.5 text-left hover:bg-[#fafafa]"
          >
            <p className="text-[10px] uppercase tracking-wider text-[#9b9b9b]">Hours</p>
            <span className="text-[10px] uppercase tracking-wide text-[#9b9b9b]">
              {hoursOpen ? 'Close' : 'Open'}
            </span>
          </button>
          {visibleHours.map(h => {
            const hourEvents = eventsByHour[h] ?? [];
            const slotText = props.daySlots[String(h)] ?? '';
            return (
              <div key={h} className="flex items-stretch border-b border-[#f0f0f0]">
                <span className="w-16 shrink-0 py-2 pr-2 text-right text-[10px] text-[#9b9b9b] border-r border-[#e5e5e5]">
                  {fmtHour(h)}
                </span>
                <div className="flex-1 min-h-[36px] px-2 py-1 flex flex-col justify-center gap-0.5">
                  {hourEvents.map(ev => (
                    <div key={ev.id} className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-[#1a1a1a] truncate">
                        {(ev.start_time ?? '').split(':')[1] && (ev.start_time ?? '').split(':')[1] !== '00'
                          ? `${fmtClock(ev.start_time)} `
                          : ''}
                        {ev.title}
                      </span>
                      <div className="flex gap-1.5 shrink-0">
                        <button type="button" onClick={() => props.onEdit(ev)} className="text-[10px] text-[#9b9b9b] hover:text-[#1a1a1a]">Edit</button>
                        <button type="button" onClick={() => props.onDelete(ev.id)} className="text-[10px] text-[#9b9b9b] hover:text-[#1a1a1a]">Delete</button>
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center gap-2">
                    <input
                      value={slotText}
                      onChange={e => props.onSlotChange(h, e.target.value)}
                      placeholder=""
                      className="flex-1 min-w-0 text-xs text-[#1a1a1a] bg-transparent focus:outline-none py-0.5"
                    />
                    {slotText.trim() ? (
                      <button
                        type="button"
                        onClick={() => props.onMakeEvent(h)}
                        className="shrink-0 text-[10px] uppercase tracking-wide text-[#9b9b9b] hover:text-[#1a1a1a]"
                        title="Add to monthly calendar as an event"
                      >
                        Event
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-5 py-3 border-b border-[#e5e5e5] shrink-0">
          <p className="text-[10px] uppercase tracking-wider text-[#9b9b9b] mb-1.5">Tasks</p>
          {localTasks.map((task) => (
            <div key={task.id} className="flex items-center gap-3 py-1">
              <input
                value={task.text}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                onChange={e => {
                  writeTasks(localTasks.map(t => t.id === task.id ? { ...t, text: e.target.value } : t));
                }}
                onBlur={() => {
                  if (!task.text.trim()) {
                    writeTasks(localTasks.filter(t => t.id !== task.id));
                  }
                }}
                className="flex-1 min-w-0 text-sm text-[#1a1a1a] bg-transparent focus:outline-none py-0.5"
              />
              <button
                type="button"
                onClick={() => {
                  writeTasks(localTasks.map(t => t.id === task.id ? { ...t, done: !t.done } : t));
                }}
                title={task.done ? 'Completed' : 'Mark complete'}
                className={`w-3.5 h-3.5 rounded-full border shrink-0 ${
                  task.done
                    ? 'bg-[#1a1a1a] border-[#1a1a1a]'
                    : 'border-[#9b9b9b] bg-transparent'
                }`}
              />
            </div>
          ))}
          <div className="flex items-center gap-3 py-1">
            <input
              value={taskDraft}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              onChange={e => setTaskDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                e.stopPropagation();
                const text = taskDraft.trim();
                if (!text) return;
                writeTasks([...localTasks, { id: newTaskId(), text, done: false }]);
                setTaskDraft('');
              }}
              className="flex-1 min-w-0 text-sm text-[#1a1a1a] bg-transparent focus:outline-none py-0.5"
            />
            <span className="w-3.5 h-3.5 rounded-full border border-[#9b9b9b] shrink-0 opacity-30" />
          </div>
        </div>

        {props.untimed.length > 0 && (
          <div className="px-5 py-3 border-b border-[#e5e5e5]">
            <p className="text-[10px] uppercase tracking-wider text-[#9b9b9b] mb-2">All day</p>
            {props.untimed.map(ev => (
              <div key={ev.id} className="flex items-start justify-between gap-2 py-1">
                <p className="text-xs font-medium">{ev.title}</p>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => props.onEdit(ev)} className="text-[10px] text-[#9b9b9b] hover:text-[#1a1a1a]">Edit</button>
                  <button onClick={() => props.onDelete(ev.id)} className="text-[10px] text-[#9b9b9b] hover:text-[#1a1a1a]">
                    {props.deleting === ev.id ? '…' : 'Delete'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {props.timers.length > 0 && (
          <div className="px-5 py-3 border-b border-[#e5e5e5]">
            <p className="text-[10px] uppercase tracking-wider text-[#9b9b9b] mb-2">Lead timers</p>
            {props.timers.map(t => (
              <div key={t.leadId} className="flex items-center justify-between py-1">
                <p className="text-xs truncate">{t.label}</p>
                <button
                  onClick={() => props.onClearTimer(t.leadId)}
                  className="text-[10px] text-[#9b9b9b] hover:text-[#1a1a1a]"
                >
                  {props.clearingTimer === t.leadId ? '…' : 'Clear'}
                </button>
              </div>
            ))}
          </div>
        )}

        {props.showForm && (
          <div className="px-5 py-4 space-y-3 border-t border-[#e5e5e5]">
            <p className="text-[10px] uppercase tracking-wider text-[#9b9b9b]">
              {props.editingEvent ? 'Edit event' : 'New event'}
            </p>
            <input
              autoFocus
              value={props.form.title}
              onChange={e => props.setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Title"
              className="w-full text-sm border-b border-[#e5e5e5] py-1.5 focus:outline-none focus:border-[#1a1a1a]"
            />
            <div className="flex items-center gap-3">
              <label className="text-[11px] text-[#9b9b9b] w-12">Time</label>
              <input
                type="time"
                value={props.form.startTime}
                onChange={e => props.setForm(f => ({ ...f, startTime: e.target.value }))}
                className="text-sm focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => props.setForm(f => ({ ...f, multiDay: !f.multiDay }))}
                className={`text-[11px] uppercase tracking-wide ${props.form.multiDay ? 'font-semibold text-[#1a1a1a]' : 'text-[#9b9b9b]'}`}
              >
                Multi-day
              </button>
              {props.form.multiDay && (
                <input
                  type="date"
                  value={props.form.endDate}
                  min={props.date}
                  onChange={e => props.setForm(f => ({ ...f, endDate: e.target.value }))}
                  className="text-xs focus:outline-none"
                />
              )}
            </div>
            <textarea
              value={props.form.notes}
              onChange={e => props.setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Notes"
              rows={2}
              className="w-full text-sm resize-none focus:outline-none border-b border-[#e5e5e5] py-1"
            />
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[#9b9b9b] mb-1.5">Color</p>
              <div className="flex gap-2">
                {EVENT_COLORS.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    title={c.label}
                    onClick={() => props.setForm(f => ({ ...f, color: c.id }))}
                    className={`w-5 h-5 rounded-full border ${
                      props.form.color === c.id ? 'border-[#1a1a1a] ring-1 ring-[#1a1a1a] ring-offset-1' : 'border-[#e5e5e5]'
                    }`}
                    style={{ background: c.hex }}
                  />
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs text-[#555]">
              <input
                type="checkbox"
                checked={props.form.alertEnabled}
                onChange={e => props.setForm(f => ({ ...f, alertEnabled: e.target.checked }))}
                className="accent-[#1a1a1a]"
              />
              Text alert
            </label>
            {props.form.alertEnabled && (
              <div className="space-y-2">
                <input
                  type="datetime-local"
                  value={props.form.alertAt}
                  onChange={e => props.setForm(f => ({ ...f, alertAt: e.target.value }))}
                  className="w-full text-xs border-b border-[#e5e5e5] py-1 focus:outline-none"
                />
                <input
                  type="tel"
                  value={props.form.alertPhone}
                  onChange={e => props.setForm(f => ({ ...f, alertPhone: e.target.value }))}
                  placeholder="Phone"
                  className="w-full text-xs border-b border-[#e5e5e5] py-1 focus:outline-none"
                />
              </div>
            )}
            {props.saveError && <p className="text-xs text-red-600">{props.saveError}</p>}
            <div className="flex gap-3">
              <button
                onClick={props.onSave}
                disabled={props.saving || !props.form.title.trim()}
                className="text-xs font-medium text-[#1a1a1a] disabled:opacity-40"
              >
                {props.saving ? 'Saving…' : props.editingEvent ? 'Update' : 'Save'}
              </button>
              <button onClick={props.onCancelForm} className="text-xs text-[#9b9b9b]">Cancel</button>
            </div>
          </div>
        )}

        <div className="flex-1 min-h-[160px] flex flex-col px-5 py-3">
          <div className="flex items-center gap-1.5 mb-1.5 shrink-0">
            <p className="text-[10px] uppercase tracking-wider text-[#9b9b9b]">Notes</p>
            <button
              type="button"
              title="Handwritten jot"
              onClick={() => { setJotError(''); setShowJot(true); }}
              className="inline-flex items-center justify-center w-8 h-8 -my-2 text-[#9b9b9b] hover:text-[#1a1a1a]"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                <path d="M12 3c1.2 2.4 4 5.2 4 8.2A4 4 0 0 1 8 11.2C8 8.2 10.8 5.4 12 3Z" />
                <circle cx="12" cy="11" r="1" fill="currentColor" stroke="none" />
                <path d="M12 15.2V21" />
                <path d="M9 21h6" />
              </svg>
            </button>
            {props.jotImage ? (
              <>
                <img src={props.jotImage} alt="" className="w-5 h-4 object-cover border border-[#e5e5e5]" />
                <span className="text-[10px] uppercase tracking-wider text-[#9b9b9b]">1 jot</span>
              </>
            ) : null}
          </div>
          <textarea
            value={props.daySlots[PAGE_NOTES_KEY] ?? ''}
            onChange={e => props.onPageNotes(e.target.value)}
            placeholder=""
            className="flex-1 w-full min-h-[140px] text-sm resize-none focus:outline-none bg-transparent"
          />
        </div>
      </div>

      {!props.showForm && (
        <div className="p-4 border-t border-[#e5e5e5]">
          <button
            onClick={props.onAdd}
            className="w-full py-2 text-xs font-medium uppercase tracking-wide border border-[#e5e5e5] hover:border-[#1a1a1a] transition-colors"
          >
            Add event
          </button>
        </div>
      )}

      {showJot && (
        <div
          className="absolute inset-0 z-20 bg-white flex flex-col select-none"
          style={{ overscrollBehavior: 'none', touchAction: 'none', WebkitUserSelect: 'none' }}
        >
          <div className="px-5 py-4 border-b border-[#e5e5e5] flex items-start justify-between gap-3 shrink-0">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide">
                {d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
              <p className="text-[11px] text-[#9b9b9b] mt-0.5">Jot</p>
            </div>
            <button
              type="button"
              onClick={() => { setShowJot(false); setJotError(''); }}
              className="text-[#9b9b9b] hover:text-[#1a1a1a] text-lg leading-none"
            >
              ×
            </button>
          </div>
          <JotPad ref={jotRef} initialImage={props.jotImage} />
          <div className="p-4 border-t border-[#e5e5e5] flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={saveJot}
              disabled={jotSaving}
              className="text-xs font-medium uppercase tracking-wide text-[#1a1a1a] disabled:opacity-40"
            >
              {jotSaving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => { setShowJot(false); setJotError(''); }}
              className="text-xs uppercase tracking-wide text-[#9b9b9b]"
            >
              Cancel
            </button>
            {jotError ? <p className="text-xs text-red-600 ml-auto">{jotError}</p> : null}
          </div>
        </div>
      )}
    </div>
  );
}
