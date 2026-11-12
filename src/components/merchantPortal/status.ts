import type { MerchantStage } from '@/lib/merchantPortal/stages';

export const TRACKER_STAGES = [
  'Received',
  'Reviewing',
  'Docs needed',
  'Submitted to partners',
  'Approved',
  'Funded',
] as const;

export type TrackerStage = (typeof TRACKER_STAGES)[number];

export function stageLabel(stage: string): string {
  if (stage === 'Submitted to partners') return 'In underwriting';
  if (stage === 'Offers ready') return 'Approved';
  return stage;
}

export function trackerIndex(stage: MerchantStage): number {
  if (stage === 'Closed') return -1;
  if (stage === 'Received') return 0;
  if (stage === 'Reviewing') return 1;
  if (stage === 'Docs needed') return 2;
  if (stage === 'Submitted to partners') return 3;
  if (stage === 'Offers ready' || stage === 'Finalizing') return 4;
  if (stage === 'Funded') return 5;
  return 1;
}

export function stageCaption(stage: MerchantStage): string {
  if (stage === 'Received') return 'We received your application.';
  if (stage === 'Reviewing') return 'Your application is in review.';
  if (stage === 'Docs needed') return 'Please upload the requested documents so we can continue reviewing your request.';
  if (stage === 'Submitted to partners') return 'Your application is in underwriting.';
  if (stage === 'Offers ready') return 'An approval is ready for you to review.';
  if (stage === 'Finalizing') return 'Your file is being finalized.';
  if (stage === 'Funded') return 'This file has been funded.';
  if (stage === 'Closed') return "We weren't able to find a match right now. Contact us to talk about options.";
  return "Here's the status of your funding application.";
}

export function formatShortDate(raw: string | null | undefined): string {
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatLongDate(raw: string | null | undefined): string {
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
