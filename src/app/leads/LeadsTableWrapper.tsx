'use client';

import { useState } from 'react';
import SearchBar from './SearchBar';
import LeadsTable from './LeadsTable';

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
  deleteLead: (formData: FormData) => Promise<void>;
  deleteMultipleLeads: (formData: FormData) => Promise<void>;
}

export default function LeadsTableWrapper({
  leads,
  selectedListName,
  selectedListDescription,
  totalLeads,
  deleteLead,
  deleteMultipleLeads,
}: LeadsTableWrapperProps) {
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            {selectedListName}
          </h2>
          {selectedListDescription && (
            <p className="text-sm text-gray-500 mt-1">{selectedListDescription}</p>
          )}
        </div>
        <div className="flex items-center gap-4">
          <SearchBar onSearch={setSearchQuery} />
          <div className="text-sm text-gray-500">
            {totalLeads} lead{totalLeads !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      <LeadsTable
        leads={leads}
        deleteLead={deleteLead}
        deleteMultipleLeads={deleteMultipleLeads}
        searchQuery={searchQuery}
      />
    </div>
  );
}
