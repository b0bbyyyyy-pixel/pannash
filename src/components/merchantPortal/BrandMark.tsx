export default function BrandMark({
  name,
  logoUrl,
  size = 'md',
}: {
  name: string;
  logoUrl?: string | null;
  size?: 'sm' | 'md';
}) {
  const label = name.trim() || 'Application portal';
  const initials = label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() || '')
    .join('');
  const box = size === 'sm' ? 'h-7 w-7 text-[11px]' : 'h-8 w-8 text-xs';
  const text = size === 'sm' ? 'text-[15px]' : 'text-base';

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" className={`${size === 'sm' ? 'h-7' : 'h-8'} max-w-[140px] object-contain`} />
      ) : (
        <span className={`flex ${box} shrink-0 items-center justify-center rounded-md border border-[#111113] font-semibold tracking-tight`}>
          {initials || 'P'}
        </span>
      )}
      <span className={`${text} truncate font-semibold tracking-tight`}>{label}</span>
    </div>
  );
}
