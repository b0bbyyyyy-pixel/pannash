export default function SmsEmailCheck({ title = 'Saved from text' }: { title?: string }) {
  return (
    <svg
      className="w-3 h-3 text-black shrink-0"
      viewBox="0 0 16 16"
      fill="none"
      aria-label={title}
    >
      <title>{title}</title>
      <path
        d="M3.2 8.4l3.1 3.2 6.5-7.2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
