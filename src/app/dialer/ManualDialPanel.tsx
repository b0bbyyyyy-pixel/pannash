'use client';

/**
 * Manual phone — call ANY number from the Dialer page.
 * Dials through the in-app WebRTC phone (Twilio Voice JS):
 * audio runs through your computer headset. The floating call bar
 * (mute / keypad / hangup) appears once the call starts.
 */
import { useState, useRef } from 'react';
import { toE164, formatDisplay } from '@/lib/dialer/e164';
import { useWebPhone } from '@/components/webphone/WebPhone';

const KEYPAD: { d: string; letters: string }[] = [
  { d: '1', letters: '' },     { d: '2', letters: 'ABC' }, { d: '3', letters: 'DEF' },
  { d: '4', letters: 'GHI' },  { d: '5', letters: 'JKL' }, { d: '6', letters: 'MNO' },
  { d: '7', letters: 'PQRS' }, { d: '8', letters: 'TUV' }, { d: '9', letters: 'WXYZ' },
  { d: '*', letters: '' },     { d: '0', letters: '+' },   { d: '#', letters: '' },
];

export default function ManualDialPanel() {
  const [number, setNumber] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const webphone = useWebPhone();

  const e164 = toE164(number);
  const busy = webphone.status === 'connecting' || webphone.status === 'ringing' || webphone.status === 'in-call';

  const press = (d: string) => {
    if (busy) return;
    setNumber((n) => n + d);
    setError(null);
  };

  const backspace = () => setNumber((n) => n.slice(0, -1));

  const startCall = async () => {
    if (!e164 || busy) return;
    setError(null);
    try {
      await webphone.connect(e164);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Call failed');
    }
  };

  const display = e164 ? formatDisplay(e164) : number;

  return (
    <div className="bg-white border border-[#e5e5e5] rounded-2xl shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-[#1a1a1a]">Phone</h3>
        <span
          className={`inline-block w-2 h-2 rounded-full ${webphone.ready ? 'bg-green-500' : 'bg-[#d4d4d4]'}`}
          title={webphone.ready ? 'Phone ready' : 'Phone offline'}
        />
      </div>

      {/* Number display / input */}
      <input
        ref={inputRef}
        type="tel"
        value={display}
        onChange={(e) => {
          if (busy) return;
          setNumber(e.target.value.replace(/[^\d+*#]/g, ''));
          setError(null);
        }}
        onKeyDown={(e) => { if (e.key === 'Enter') startCall(); }}
        placeholder="(555) 123-4567"
        disabled={busy}
        className="w-full text-center text-xl font-medium text-[#1a1a1a] tracking-wide border-b border-[#e5e5e5] pb-2 mb-4 focus:outline-none focus:border-[#1a1a1a] placeholder:text-[#d4d4d4] disabled:bg-transparent"
      />

      {/* Error */}
      {error && <p className="text-xs text-red-600 text-center mb-3">{error}</p>}

      {/* Keypad */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {KEYPAD.map(({ d, letters }) => (
          <button
            key={d}
            onClick={() => press(d)}
            disabled={busy}
            className="py-2.5 rounded-xl border border-[#f0f0f0] hover:bg-[#f7f7f7] active:bg-[#efefef] transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <span className="block text-base font-medium text-[#1a1a1a] leading-none">{d}</span>
            <span className="block text-[8px] text-[#b0b0b0] tracking-widest mt-0.5 h-2">{letters}</span>
          </button>
        ))}
      </div>

      {/* Call / backspace row */}
      <div className="flex items-center gap-2">
        {busy ? (
          <button
            onClick={webphone.hangup}
            className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors"
          >
            Hang Up
          </button>
        ) : (
          <button
            onClick={startCall}
            disabled={!e164 || !webphone.ready}
            className="flex-1 py-2.5 rounded-xl bg-[#1a1a1a] text-white text-sm font-medium hover:bg-[#333] disabled:opacity-40 transition-colors"
          >
            Call
          </button>
        )}
        <button
          onClick={backspace}
          disabled={busy || !number}
          aria-label="Delete digit"
          className="px-3.5 py-2.5 rounded-xl border border-[#e5e5e5] text-[#6b7280] hover:bg-[#f7f7f7] disabled:opacity-40 transition-colors"
        >
          ⌫
        </button>
      </div>

      <p className="text-[10px] text-[#b0b0b0] mt-3 text-center">
        Calls run in the browser — audio through your headset.
      </p>
    </div>
  );
}
