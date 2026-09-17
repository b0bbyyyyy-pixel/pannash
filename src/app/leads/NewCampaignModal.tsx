'use client';

import { useState } from 'react';
import UploadForm from './UploadForm';

interface Props {
  createCampaign: (name: string) => Promise<string | null>; // returns new list id
}

function todayLabel() {
  return new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

type Step = 'name' | 'upload';

export default function NewCampaignModal({ createCampaign }: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('name');
  const [name, setName] = useState(todayLabel());
  const [listId, setListId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const handleOpen = () => {
    setStep('name');
    setName(todayLabel());
    setListId(null);
    setError('');
    setOpen(true);
  };

  const handleCreate = async () => {
    if (!name.trim()) { setError('Please enter a name.'); return; }
    setCreating(true);
    setError('');
    try {
      const id = await createCampaign(name.trim());
      if (!id) throw new Error('Failed to create campaign');
      setListId(id);
      setStep('upload');
    } catch {
      setError('Could not create campaign. Try again.');
    } finally {
      setCreating(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    // Refresh to show newly created campaign
    window.location.reload();
  };

  return (
    <>
      <button
        onClick={handleOpen}
        className="text-sm font-medium text-[#1a1a1a] hover:text-[#555] transition-colors"
      >
        New Campaign
      </button>

      {open && (
        <>
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={handleClose} />
          <div
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#f0f0f0]">
              <h2 className="text-base font-bold text-[#1a1a1a]">
                {step === 'name' ? 'New Campaign' : `Upload leads · ${name}`}
              </h2>
              <button onClick={handleClose} className="text-[#9b9b9b] hover:text-[#1a1a1a] transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Step 1 — name */}
            {step === 'name' && (
              <div className="px-6 py-6 space-y-5">
                <div>
                  <label className="block text-xs font-semibold text-[#6b6b6b] uppercase tracking-wide mb-2">
                    Campaign name
                  </label>
                  <input
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                    className="w-full border border-[#e5e5e5] rounded-lg px-4 py-2.5 text-sm text-[#1a1a1a] focus:outline-none focus:border-[#1a1a1a] transition-colors"
                    placeholder="e.g. Sep 17, 2026"
                  />
                  {error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}
                </div>
                <div className="flex justify-end gap-3">
                  <button onClick={handleClose} className="px-4 py-2 text-sm text-[#6b6b6b] hover:text-[#1a1a1a] transition-colors">
                    Cancel
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={creating}
                    className="px-5 py-2 text-sm font-medium text-white bg-[#1a1a1a] hover:bg-[#333] rounded-lg transition-colors disabled:opacity-50"
                  >
                    {creating ? 'Creating…' : 'Create & Upload Leads →'}
                  </button>
                </div>
              </div>
            )}

            {/* Step 2 — upload */}
            {step === 'upload' && listId && (
              <div className="px-6 py-4 max-h-[70vh] overflow-y-auto">
                <UploadForm selectedListId={listId} onSuccess={handleClose} />
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
