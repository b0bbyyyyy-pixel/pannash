'use client';
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import FinancialsReport, { type BankSnap, type FinancialsReportProps } from '@/components/FinancialsReport';

export type { BankSnap };

type Props = FinancialsReportProps & {
  onClose: () => void;
};

function portalTarget(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  try {
    const topDoc = window.top?.document;
    if (topDoc?.body) return topDoc.body;
  } catch { /* cross-origin */ }
  return document.body;
}

export default function FinancialsModal({
  snap,
  ud,
  leadName,
  leadCompany,
  derivedTIB,
  onSaveField,
  onClose,
}: Props) {
  const displayName = leadCompany || leadName;
  const analyzedStr = snap?.analyzedAt
    ? new Date(snap.analyzedAt).toLocaleDateString('en-US')
    : '';
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);
  useEffect(() => { setPortalEl(portalTarget()); }, []);

  const ui = (
    <div className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => { e.stopPropagation(); }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#f0f0f0] flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-[#1a1a1a]">{displayName}</h2>
            <p className="text-xs text-[#9b9b9b]">
              {analyzedStr ? 'Financial Analysis · ' + analyzedStr : 'Financial Analysis'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#f5f5f5] text-[#9b9b9b] hover:text-[#1a1a1a] transition-colors"
          >
            &times;
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <FinancialsReport
            snap={snap}
            ud={ud}
            leadName={leadName}
            leadCompany={leadCompany}
            derivedTIB={derivedTIB}
            onSaveField={onSaveField}
            variant="modal"
          />
        </div>
      </div>
    </div>
  );

  if (!portalEl) return ui;
  return createPortal(ui, portalEl);
}
