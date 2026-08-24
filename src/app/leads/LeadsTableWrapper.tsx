'use client';

import { useState, useRef, useEffect } from 'react';
import SearchBar from './SearchBar';
import LeadsTable from './LeadsTable';
import UploadForm from './UploadForm';

interface Lead {
  id: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  email_status?: string;
  email_validation_notes?: string;
  lead_lists?: {
    name: string;
  };
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
  const uploadRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (uploadRef.current && !uploadRef.current.contains(e.target as Node)) {
        setShowUpload(false);
      }
    }
    if (showUpload) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showUpload]);

  return (
    <div className="bg-white border border-gray-200 rounded-lg">
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            {selectedListName}
          </h2>
          {selectedListDescription && (
            <p className="text-sm text-gray-500 mt-1">{selectedListDescription}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* Upload dropdown — only shown when a specific list is selected */}
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
          <div className="text-sm text-gray-500">
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
