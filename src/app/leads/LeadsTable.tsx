'use client';

import { useState } from 'react';
import DeleteLeadButton from './DeleteLeadButton';
import BulkDeleteButton from './BulkDeleteButton';

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

interface LeadsTableProps {
  leads: Lead[];
  deleteLead: (formData: FormData) => Promise<void>;
  deleteMultipleLeads: (formData: FormData) => Promise<void>;
}

export default function LeadsTable({ leads, deleteLead, deleteMultipleLeads }: LeadsTableProps) {
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);

  const toggleSelectLead = (leadId: string) => {
    setSelectedLeads(prev =>
      prev.includes(leadId)
        ? prev.filter(id => id !== leadId)
        : [...prev, leadId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedLeads.length === leads.length) {
      setSelectedLeads([]);
    } else {
      setSelectedLeads(leads.map(lead => lead.id));
    }
  };

  const clearSelection = () => {
    setSelectedLeads([]);
  };

  const allSelected = leads.length > 0 && selectedLeads.length === leads.length;
  const someSelected = selectedLeads.length > 0 && selectedLeads.length < leads.length;

  if (!leads || leads.length === 0) {
    return (
      <div className="p-12 text-center text-gray-500">
        <p className="text-lg mb-2">No leads yet</p>
        <p className="text-sm">Upload a CSV file to get started</p>
      </div>
    );
  }

  return (
    <>
      <table className="w-full">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-6 py-4 text-left">
              <input
                type="checkbox"
                checked={allSelected}
                ref={input => {
                  if (input) input.indeterminate = someSelected;
                }}
                onChange={toggleSelectAll}
                className="w-4 h-4 text-gray-900 rounded cursor-pointer"
              />
            </th>
            <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Name
            </th>
            <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Email
            </th>
            <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Phone
            </th>
            <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Company
            </th>
            <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              List
            </th>
            <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {leads.map((lead) => (
            <tr
              key={lead.id}
              className={`hover:bg-gray-50 transition-colors ${
                selectedLeads.includes(lead.id) ? 'bg-blue-50' : ''
              }`}
            >
              <td className="px-6 py-4 whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={selectedLeads.includes(lead.id)}
                  onChange={() => toggleSelectLead(lead.id)}
                  className="w-4 h-4 text-gray-900 rounded cursor-pointer"
                />
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                {lead.name}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <span>{lead.email || '—'}</span>
                  {lead.email_status && lead.email_status !== 'unchecked' && (
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        lead.email_status === 'valid'
                          ? 'bg-green-100 text-green-800'
                          : lead.email_status === 'invalid'
                          ? 'bg-red-100 text-red-800'
                          : lead.email_status === 'missing'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                      title={lead.email_validation_notes || ''}
                    >
                      {lead.email_status === 'valid' && '✓'}
                      {lead.email_status === 'invalid' && '✗'}
                      {lead.email_status === 'missing' && '?'}
                      {lead.email_status === 'ai_suggested' && '🤖'}
                    </span>
                  )}
                </div>
                {lead.email_validation_notes && (
                  <div className="text-xs text-gray-500 mt-1">
                    {lead.email_validation_notes}
                  </div>
                )}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                {lead.phone || '—'}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                {lead.company || '—'}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                {(lead.lead_lists as any)?.name || '—'}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm">
                <DeleteLeadButton leadId={lead.id} deleteLead={deleteLead} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <BulkDeleteButton
        selectedLeads={selectedLeads}
        onClearSelection={clearSelection}
        deleteMultipleLeads={deleteMultipleLeads}
      />
    </>
  );
}
