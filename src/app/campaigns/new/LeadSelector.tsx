'use client';

import { useState } from 'react';

interface Lead {
  id: string;
  name: string;
  email: string;
  company?: string;
  list_id?: string;
  lead_lists?: {
    name: string;
  };
}

interface LeadList {
  id: string;
  name: string;
}

export default function LeadSelector({ 
  leads, 
  leadLists 
}: { 
  leads: Lead[];
  leadLists: LeadList[];
}) {
  const [selectedListFilter, setSelectedListFilter] = useState<string>('all');

  // Filter leads based on selected list
  const filteredLeads = selectedListFilter === 'all' 
    ? leads 
    : selectedListFilter === 'unlisted'
    ? leads.filter(l => !l.list_id)
    : leads.filter(l => l.list_id === selectedListFilter);

  return (
    <div className="space-y-4">
      {/* List Filter */}
      {leadLists && leadLists.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Filter by List
          </label>
          <select
            value={selectedListFilter}
            onChange={(e) => setSelectedListFilter(e.target.value)}
            className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
          >
            <option value="all">All Lists ({leads.length} leads)</option>
            <option value="unlisted">
              Uncategorized ({leads.filter(l => !l.list_id).length} leads)
            </option>
            {leadLists.map(list => (
              <option key={list.id} value={list.id}>
                {list.name} ({leads.filter(l => l.list_id === list.id).length} leads)
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Select All */}
      <div className="space-y-2 max-h-96 overflow-y-auto">
        <div className="mb-4">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <input
              type="checkbox"
              className="w-4 h-4 text-gray-900 rounded"
              onChange={(e) => {
                const checkboxes = document.querySelectorAll('input[name="leads[]"]');
                checkboxes.forEach((checkbox: any) => {
                  checkbox.checked = e.currentTarget.checked;
                });
              }}
            />
            Select All ({filteredLeads.length} leads)
          </label>
        </div>
        {filteredLeads.map((lead) => (
          <label
            key={lead.id}
            className="flex items-center gap-2 p-3 border border-gray-200 rounded-md hover:bg-gray-50 cursor-pointer transition-colors"
          >
            <input
              type="checkbox"
              name="leads[]"
              value={lead.id}
              className="w-4 h-4 text-gray-900 rounded"
            />
            <div className="flex-1">
              <div className="font-medium text-gray-900">{lead.name}</div>
              <div className="text-sm text-gray-600">
                {lead.email}
                {lead.company && ` • ${lead.company}`}
                {lead.lead_lists?.name && (
                  <span className="ml-2 text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                    {lead.lead_lists.name}
                  </span>
                )}
              </div>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}
