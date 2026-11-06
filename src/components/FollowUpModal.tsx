'use client';

import { useEffect, useState } from 'react';
import { kickSyncWorker } from '@/lib/sync/kick';
import { createPortal } from 'react-dom';
import {
  CALLBACK_ALARM_EVENT,
  CALLBACK_TIMERS,
  DEFAULT_FOLLOW_UP_SMS,
  FOLLOW_UP_TIMERS,
  followUpKindFromUd,
  localDateKey,
  localTimeHm,
  resolveFollowUpDue,
  type FollowUpKind,
} from '@/lib/lead-follow-up';

type SavedTpl = { id: string; name: string; body: string };

export default function FollowUpModal({
  leadId,
  leadName,
  currentDueAt,
  currentAutoText,
  currentSmsBody,
  intent,
  onClose,
  onSaved,
  onCleared,
}: {
  leadId: string;
  leadName: string;
  currentDueAt?: string | null;
  currentAutoText?: boolean;
  currentSmsBody?: string | null;
  intent?: FollowUpKind;
  onClose: () => void;
  onSaved?: (next: {
    follow_up_at: string;
    follow_up_due_at: string;
    follow_up_auto_text: boolean;
    follow_up_sms_body: string | null;
  }) => void;
  onCleared?: () => void;
}) {
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    try {
      setPortalEl(window.top?.document?.body ?? document.body);
    } catch {
      setPortalEl(document.body);
    }
  }, []);
  const [kind, setKind] = useState<FollowUpKind>(intent === 'followup' ? 'followup' : 'callback');
  const [timerId, setTimerId] = useState<string>(intent === 'followup' ? '3_days' : '1_hour');
  const [customDate, setCustomDate] = useState('');
  const [customTime, setCustomTime] = useState('10:00');
  const [smsBody, setSmsBody] = useState(DEFAULT_FOLLOW_UP_SMS);
  const [tpls, setTpls] = useState<SavedTpl[]>([]);
  const [tplId, setTplId] = useState('');
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const applyCurrent = (dueAt?: string | null, auto?: boolean, body?: string | null, savedKind?: FollowUpKind | null) => {
      if (intent === 'callback' || intent === 'followup') {
        setKind(intent);
        setTimerId(intent === 'callback' ? '1_hour' : '3_days');
      } else if (savedKind) {
        setKind(savedKind);
        setTimerId(savedKind === 'callback' ? '1_hour' : '3_days');
      } else if (auto) {
        setKind('followup');
        setTimerId('3_days');
      } else {
        setKind('callback');
        setTimerId('1_hour');
      }
      if (dueAt) {
        const d = new Date(dueAt);
        if (!Number.isNaN(d.getTime())) {
          setTimerId('custom');
          setCustomDate(localDateKey(d));
          setCustomTime(localTimeHm(d));
        }
      } else {
        const d = resolveFollowUpDue({
          timerId: intent === 'followup' ? '3_days' : '1_hour',
        });
        if (d) {
          setCustomDate(localDateKey(d));
          setCustomTime(localTimeHm(d));
        }
      }
      if (body) setSmsBody(body);
    };
    if (currentDueAt !== undefined) {
      applyCurrent(currentDueAt, currentAutoText, currentSmsBody, currentAutoText ? 'followup' : null);
      return;
    }
    fetch(`/api/leads/${leadId}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => applyCurrent(
        d.lead?.follow_up_due_at,
        d.lead?.follow_up_auto_text,
        d.lead?.follow_up_sms_body,
        followUpKindFromUd(d.lead?.underwriting_data),
      ))
      .catch(() => applyCurrent(null, false, null, null));
  }, [leadId, currentDueAt, currentAutoText, currentSmsBody, intent]);

  useEffect(() => {
    fetch('/api/text-templates', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setTpls(d.templates || []))
      .catch(() => {});
  }, []);

  const switchKind = (next: FollowUpKind) => {
    setKind(next);
    setTimerId(next === 'callback' ? '1_hour' : '3_days');
    const d = resolveFollowUpDue({ timerId: next === 'callback' ? '1_hour' : '3_days' });
    if (d) {
      setCustomDate(localDateKey(d));
      setCustomTime(localTimeHm(d));
    }
  };

  const timers = kind === 'callback' ? CALLBACK_TIMERS : FOLLOW_UP_TIMERS;
  const due = resolveFollowUpDue({ timerId, customDate, customTime });
  const dueLabel = due
    ? due.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '';

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/leads/follow-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          leadId,
          kind,
          timerId,
          customDate,
          customTime,
          autoText: kind === 'followup',
          smsBody,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Could not save follow-up');
        return;
      }
      kickSyncWorker();
      if (kind === 'callback' && data.follow_up_due_at) {
        try {
          if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
            void Notification.requestPermission();
          }
        } catch { /* ignore */ }
        try {
          const detail = { leadId, name: leadName, company: null, phone: null, dueAt: data.follow_up_due_at };
          window.dispatchEvent(new CustomEvent(CALLBACK_ALARM_EVENT, { detail }));
          window.top?.dispatchEvent(new CustomEvent(CALLBACK_ALARM_EVENT, { detail }));
        } catch { /* ignore */ }
      }
      onSaved?.({
        follow_up_at: data.follow_up_at,
        follow_up_due_at: data.follow_up_due_at,
        follow_up_auto_text: data.follow_up_auto_text,
        follow_up_sms_body: data.follow_up_sms_body,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    setClearing(true);
    setError(null);
    try {
      const res = await fetch(`/api/leads/follow-up?leadId=${leadId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Could not clear follow-up');
        return;
      }
      onCleared?.();
      onClose();
    } finally {
      setClearing(false);
    }
  };

  if (!portalEl) return null;
  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200] p-4" onClick={onClose}>
      <div
        className="bg-white rounded-lg p-5 max-w-md w-full max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-base font-bold text-[#1a1a1a] mb-1">Follow-up</h2>
        <p className="text-xs text-[#6b6b6b] mb-4 truncate">{leadName}</p>

        <div className="grid grid-cols-2 gap-1.5 mb-4 p-1 bg-[#f5f5f5] rounded-lg">
          <button
            type="button"
            onClick={() => switchKind('callback')}
            className={`px-3 py-2 text-xs font-medium rounded-md transition-colors ${
              kind === 'callback' ? 'bg-white text-[#1a1a1a] shadow-sm' : 'text-[#6b6b6b] hover:text-[#1a1a1a]'
            }`}
          >
            Call back
          </button>
          <button
            type="button"
            onClick={() => switchKind('followup')}
            className={`px-3 py-2 text-xs font-medium rounded-md transition-colors ${
              kind === 'followup' ? 'bg-white text-[#1a1a1a] shadow-sm' : 'text-[#6b6b6b] hover:text-[#1a1a1a]'
            }`}
          >
            Auto-text
          </button>
        </div>

        <p className="text-[10px] uppercase tracking-wider text-[#9b9b9b] mb-2">Timer</p>
        <div className="grid grid-cols-2 gap-1.5 mb-3">
          {timers.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTimerId(t.id)}
              className={`px-3 py-2 text-xs font-medium rounded-md border transition-colors text-center ${
                timerId === t.id
                  ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]'
                  : 'border-[#e5e5e5] text-[#1a1a1a] hover:bg-[#f5f5f5]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {timerId === 'custom' && (
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div>
              <label className="block text-[11px] text-[#9b9b9b] mb-1">Date</label>
              <input
                type="date"
                value={customDate}
                onChange={e => setCustomDate(e.target.value)}
                className="w-full px-2.5 py-1.5 text-sm border border-[#e5e5e5] rounded-md focus:outline-none focus:ring-1 focus:ring-[#1a1a1a]"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#9b9b9b] mb-1">Time</label>
              <input
                type="time"
                value={customTime}
                onChange={e => setCustomTime(e.target.value)}
                className="w-full px-2.5 py-1.5 text-sm border border-[#e5e5e5] rounded-md focus:outline-none focus:ring-1 focus:ring-[#1a1a1a]"
              />
            </div>
          </div>
        )}

        {dueLabel && (
          <p className="text-[11px] text-[#6b6b6b] mb-4">
            Due <span className="font-medium text-[#1a1a1a]">{dueLabel}</span>
            {kind === 'callback'
              ? ' · alarm + ping when it is time to call'
              : ' · lands on your calendar that day'}
          </p>
        )}

        {kind === 'followup' && (
          <div className="py-2 border-t border-[#f0f0f0]">
            <p className="text-sm font-medium text-[#1a1a1a]">Auto-text when timer ends</p>
            <p className="text-[11px] text-[#9b9b9b] mb-2">Sends this message at the due time</p>
            {tpls.length > 0 && (
              <select
                value={tplId}
                onChange={e => {
                  setTplId(e.target.value);
                  const t = tpls.find(x => x.id === e.target.value);
                  if (t) setSmsBody(t.body);
                }}
                className="w-full px-2.5 py-1.5 text-sm border border-[#e5e5e5] rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-[#1a1a1a]"
              >
                <option value="">Text template…</option>
                {tpls.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}
            <textarea
              value={smsBody}
              onChange={e => setSmsBody(e.target.value)}
              rows={4}
              placeholder="Message to send when the timer ends"
              className="mt-2 w-full px-2.5 py-2 text-sm border border-[#e5e5e5] rounded-md resize-none focus:outline-none focus:ring-1 focus:ring-[#1a1a1a]"
            />
            <p className="text-[10px] text-[#9b9b9b] mt-1">{smsBody.length} characters · {'{first_name}'} {'{company}'}</p>
          </div>
        )}

        {error && <p className="text-[11px] text-red-600 mt-3">{error}</p>}

        <div className="flex gap-2 mt-5">
          {currentDueAt && (
            <button
              type="button"
              onClick={clear}
              disabled={clearing || saving}
              className="px-3 py-2 border border-[#e5e5e5] text-[#6b6b6b] rounded-md text-sm hover:bg-[#f5f5f5] disabled:opacity-50"
            >
              {clearing ? '…' : 'Clear'}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-3 py-2 border border-[#e5e5e5] text-[#1a1a1a] rounded-md text-sm hover:bg-[#f5f5f5]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !due}
            className="flex-1 px-3 py-2 bg-[#1a1a1a] text-white rounded-md text-sm font-medium hover:bg-[#333] disabled:opacity-50"
          >
            {saving ? 'Saving…' : kind === 'callback' ? 'Set callback' : 'Set follow-up'}
          </button>
        </div>
      </div>
    </div>,
    portalEl,
  );
}
