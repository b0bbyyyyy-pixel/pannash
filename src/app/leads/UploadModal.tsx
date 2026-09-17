'use client';

import { useState } from 'react';
import UploadForm from './UploadForm';

interface Props {
  selectedListId?: string;
}

export default function UploadModal({ selectedListId }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-sm font-medium text-[#1a1a1a] hover:text-[#555] transition-colors"
      >
        Upload Leads
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="bg-white rounded-xl p-8 max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-[#1a1a1a] tracking-tight">Upload Leads</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-[#9b9b9b] hover:text-[#1a1a1a] transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <UploadForm selectedListId={selectedListId} />
          </div>
        </div>
      )}
    </>
  );
}
