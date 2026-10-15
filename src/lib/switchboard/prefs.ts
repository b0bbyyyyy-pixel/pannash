export const FLASH_INTENSITIES = ['off', 'soft', 'normal', 'strong'] as const;
export type FlashIntensity = (typeof FLASH_INTENSITIES)[number];

export const DEFAULT_FLASH_INTENSITY: FlashIntensity = 'normal';
export const SWITCHBOARD_PREFS_KEY = 'gostwrk-switchboard';
export const SWITCHBOARD_PREFS_EVENT = 'gostwrk-switchboard-prefs';

export function parseFlashIntensity(raw: unknown): FlashIntensity {
  if (typeof raw === 'string') {
    const v = raw.trim().toLowerCase();
    if (v === 'off' || v === 'soft' || v === 'normal' || v === 'strong') return v;
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    return parseFlashIntensity(obj.switchboard_flash_intensity ?? obj.flash_intensity ?? obj.intensity);
  }
  return DEFAULT_FLASH_INTENSITY;
}

export function readFlashIntensity(): FlashIntensity {
  if (typeof window === 'undefined') return DEFAULT_FLASH_INTENSITY;
  try {
    const raw = window.localStorage.getItem(SWITCHBOARD_PREFS_KEY);
    if (!raw) return DEFAULT_FLASH_INTENSITY;
    const parsed = JSON.parse(raw) as unknown;
    return parseFlashIntensity(parsed);
  } catch {
    return DEFAULT_FLASH_INTENSITY;
  }
}

export function writeFlashIntensity(intensity: FlashIntensity) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SWITCHBOARD_PREFS_KEY, JSON.stringify({ intensity }));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(SWITCHBOARD_PREFS_EVENT, { detail: { intensity } }));
}
