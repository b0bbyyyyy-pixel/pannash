'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import SearchBar from './SearchBar';
import LeadsTable from './LeadsTable';
import UploadForm from './UploadForm';

interface Lead {
  id: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  last_contact?: string | null;
  email_status?: string;
  email_validation_notes?: string;
  lead_lists?: { name: string };
}

interface LeadsTableWrapperProps {
  leads: Lead[];
  selectedListName: string;
  selectedListDescription?: string;
  totalLeads: number;
  selectedListId?: string;
  deleteLead: (formData: FormData) => Promise<void>;
  deleteMultipleLeads: (formData: FormData) => Promise<void>;
}

export default function LeadsTableWrapper({
  leads,
  selectedListName,
  selectedListDescription,
  totalLeads,
  selectedListId,
  deleteLead,
  deleteMultipleLeads,
}: LeadsTableWrapperProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [validating, setValidating] = useState(false);
  const [finding, setFinding] = useState(false);
  const uploadRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (uploadRef.current && !uploadRef.current.contains(e.target as Node)) {
        setShowUpload(false);
      }
    }
    if (showUpload) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showUpload]);

  const handleValidate = async () => {
    if (!confirm(`Validate emails for ${selectedListId ? 'this list' : 'all leads'}?`)) return;
    setValidating(true);
    try {
      const res = await fetch('/api/leads/validate-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listId: selectedListId }),
      });
      const data = await res.json();
      if (res.ok) {
        alert(`Validation done!\n✅ Valid: ${data.valid}  ❌ Invalid: ${data.invalid}  🚫 Blocked: ${data.blocked}  ❓ Missing: ${data.missing}`);
        router.refresh();
      } else {
        alert(`Error: ${data.error}`);
      }
    } finally { setValidating(false); }
  };

  const handleFind = async () => {
    setFinding(true);
    try {
      const res = await fetch('/api/leads/find-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listId: selectedListId }),
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.suggestions?.length > 0
          ? `AI found emails for ${data.suggestions.length} lead(s).`
          : 'All leads already have valid emails.');
        router.refresh();
      } else {
        alert(`Error: ${data.error}`);
      }
    } finally { setFinding(false); }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg">
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{selectedListName}</h2>
          {selectedListDescription && (
            <p className="text-sm text-gray-500 mt-1">{selectedListDescription}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Validate button */}
          <button
            onClick={handleValidate}
            disabled={validating}
            className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {validating ? 'Validating…' : 'Validate'}
          </button>

          {/* Find emails button */}
          <button
            onClick={handleFind}
            disabled={finding}
            className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {finding ? 'Finding…' : 'Find'}
          </button>

          {/* Upload dropdown — only for specific lists */}
          {selectedListId && selectedListId !== 'unlisted' && (
            <div className="relative" ref={uploadRef}>
              <button
                onClick={() => setShowUpload(v => !v)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Upload
              </button>

              {showUpload && (
                <div className="absolute right-0 top-full mt-2 w-96 bg-white border border-gray-200 rounded-xl shadow-xl z-50 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-gray-900">Upload Leads to {selectedListName}</h3>
                    <button onClick={() => setShowUpload(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
                  </div>
                  <UploadForm selectedListId={selectedListId} />
                </div>
              )}
            </div>
          )}

          <SearchBar onSearch={setSearchQuery} />
          <div className="text-sm text-gray-500 whitespace-nowrap">
            {totalLeads} lead{totalLeads !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <LeadsTable
          leads={leads}
          deleteLead={deleteLead}
          deleteMultipleLeads={deleteMultipleLeads}
          searchQuery={searchQuery}
        />
      </div>
    </div>
  );
}
