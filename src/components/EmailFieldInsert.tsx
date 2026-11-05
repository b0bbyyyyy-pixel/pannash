'use client';

export const EMAIL_SUBJECT_FIELDS: { key: string; label: string }[] = [
  { key: 'company', label: 'Company' },
  { key: 'firstName', label: 'First Name' },
  { key: 'name', label: 'Full Name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
];

export function insertFieldToken(
  current: string,
  key: string,
  el: HTMLInputElement | HTMLTextAreaElement | null,
  set: (v: string) => void,
) {
  const token = `{{${key}}}`;
  const start = el?.selectionStart ?? current.length;
  const end = el?.selectionEnd ?? start;
  const next = current.slice(0, start) + token + current.slice(end);
  set(next);
  setTimeout(() => {
    if (!el) return;
    el.focus();
    const pos = start + token.length;
    el.setSelectionRange(pos, pos);
  }, 0);
}

export default function EmailFieldInsert({
  onInsert,
  align = 'right',
}: {
  onInsert: (key: string) => void;
  align?: 'left' | 'right';
}) {
  return (
    <div className="relative group">
      <button
        type="button"
        className="text-[11px] font-medium text-[#5a7fc7] hover:text-[#4a6fb7]"
        title="Insert a field"
      >
        + Field
      </button>
      <div
        className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} mt-1 bg-white border border-[#e5e5e5] rounded-md shadow-lg z-20 hidden group-hover:block min-w-[150px]`}
      >
        {EMAIL_SUBJECT_FIELDS.map(f => (
          <button
            key={f.key}
            type="button"
            onClick={() => onInsert(f.key)}
            className="block w-full text-left px-3 py-1.5 text-xs hover:bg-[#f5f5f5]"
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );
}
