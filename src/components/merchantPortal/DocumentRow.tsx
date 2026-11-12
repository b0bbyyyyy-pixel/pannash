import type { PortalNeed } from '@/lib/merchantPortal/mask';
import { IconCheck, IconChevron, IconPdf, IconUpload } from './icons';
import { formatBytes, formatShortDate } from './status';

export type PortalFile = { name: string; at: string; size?: number | null };

export function UploadedFileRow({ file }: { file: PortalFile }) {
  const meta = [
    file.at ? `Uploaded on ${formatShortDate(file.at)}` : '',
    formatBytes(file.size),
  ].filter(Boolean).join(' · ');

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#e5e5e5] text-[#111113]">
        <IconPdf className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{file.name}</p>
        {meta && <p className="mt-0.5 text-xs text-[#6b6b6b]">{meta}</p>}
      </div>
      <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[#111113] text-[#111113]">
        <IconCheck className="h-3.5 w-3.5" />
      </span>
    </div>
  );
}

export function UploadNeedRow({
  need,
  uploading,
  disabled,
  onFile,
}: {
  need: PortalNeed;
  uploading?: boolean;
  disabled?: boolean;
  onFile: (file: File) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-[#fafafa]">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#e5e5e5] text-[#111113]">
        <IconUpload className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{uploading ? 'Uploading…' : need.done ? 'Replace file' : need.label}</p>
        <p className="mt-0.5 text-xs text-[#6b6b6b]">Accepted formats: PDF, JPG, PNG. Max size: 25 MB</p>
      </div>
      <IconChevron className="h-4 w-4 text-[#111113]" />
      <input
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.heic,.heif,application/pdf,image/jpeg,image/png,image/heic,image/heif"
        className="hidden"
        disabled={disabled || uploading}
        onChange={e => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onFile(file);
        }}
      />
    </label>
  );
}
