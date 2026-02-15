'use client';

import { useState } from 'react';
import DeleteLeadButton from './DeleteLeadButton';
import BulkDeleteButton from './BulkDeleteButton';
import { useRouter } from 'next/navigation';

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
  searchQuery?: string;
}

export default function LeadsTable({ leads, deleteLead, deleteMultipleLeads, searchQuery = '' }: LeadsTableProps) {
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [editingCell, setEditingCell] = useState<{ leadId: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const router = useRouter();

  const toggleSelectLead = (leadId: string) => {
    setSelectedLeads(prev =>
      prev.includes(leadId)
        ? prev.filter(id => id !== leadId)
        : [...prev, leadId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedLeads.length === filteredLeads.length) {
      setSelectedLeads([]);
    } else {
      setSelectedLeads(filteredLeads.map(lead => lead.id));
    }
  };

  const clearSelection = () => {
    setSelectedLeads([]);
  };

  const startEdit = (leadId: string, field: string, currentValue: string) => {
    setEditingCell({ leadId, field });
    setEditValue(currentValue || '');
  };

  const cancelEdit = () => {
    setEditingCell(null);
    setEditValue('');
  };

  const saveEdit = async (leadId: string, field: string) => {
    try {
      const res = await fetch('/api/leads/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, field, value: editValue }),
      });

      if (res.ok) {
        setEditingCell(null);
        setEditValue('');
        router.refresh();
      } else {
        const data = await res.json();
        alert(`Error: ${data.error}`);
      }
    } catch (error: any) {
      console.error('Error saving edit:', error);
      alert(`Error: ${error.message}`);
    }
  };

  // Filter leads based on search query
  const filteredLeads = leads.filter(lead => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      lead.name?.toLowerCase().includes(query) ||
      lead.email?.toLowerCase().includes(query) ||
      lead.phone?.toLowerCase().includes(query) ||
      lead.company?.toLowerCase().includes(query)
    );
  });

  const allSelected = filteredLeads.length > 0 && selectedLeads.length === filteredLeads.length;
  const someSelected = selectedLeads.length > 0 && selectedLeads.length < filteredLeads.length;

  if (!leads || leads.length === 0) {
    return (
      <div className="p-12 text-center text-gray-500">
        <p className="text-lg mb-2">No leads yet</p>
        <p className="text-sm">Upload a CSV file to get started</p>
      </div>
    );
  }

  if (filteredLeads.length === 0 && searchQuery) {
    return (
      <div className="p-12 text-center text-gray-500">
        <p className="text-lg mb-2">No matches found</p>
        <p className="text-sm">Try a different search term</p>
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
          {filteredLeads.map((lead) => (
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
              
              {/* Editable Name */}
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                {editingCell?.leadId === lead.id && editingCell?.field === 'name' ? (
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={() => saveEdit(lead.id, 'name')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveEdit(lead.id, 'name');
                      if (e.key === 'Escape') cancelEdit();
                    }}
                    autoFocus
                    className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                ) : (
                  <span
                    onClick={() => startEdit(lead.id, 'name', lead.name)}
                    className="cursor-pointer hover:bg-gray-100 px-2 py-1 rounded block"
                    title="Click to edit"
                  >
                    {lead.name}
                  </span>
                )}
              </td>
              
              {/* Editable Email */}
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                {editingCell?.leadId === lead.id && editingCell?.field === 'email' ? (
                  <input
                    type="email"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={() => saveEdit(lead.id, 'email')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveEdit(lead.id, 'email');
                      if (e.key === 'Escape') cancelEdit();
                    }}
                    autoFocus
                    className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <span
                      onClick={() => startEdit(lead.id, 'email', lead.email)}
                      className="cursor-pointer hover:bg-gray-100 px-2 py-1 rounded block"
                      title="Click to edit"
                    >
                      {lead.email || '—'}
                    </span>
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
                )}
                {lead.email_validation_notes && !editingCell && (
                  <div className="text-xs text-gray-500 mt-1">
                    {lead.email_validation_notes}
                  </div>
                )}
              </td>
              
              {/* Editable Phone */}
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                {editingCell?.leadId === lead.id && editingCell?.field === 'phone' ? (
                  <input
                    type="tel"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={() => saveEdit(lead.id, 'phone')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveEdit(lead.id, 'phone');
                      if (e.key === 'Escape') cancelEdit();
                    }}
                    autoFocus
                    className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                ) : (
                  <span
                    onClick={() => startEdit(lead.id, 'phone', lead.phone || '')}
                    className="cursor-pointer hover:bg-gray-100 px-2 py-1 rounded block"
                    title="Click to edit"
                  >
                    {lead.phone || '—'}
                  </span>
                )}
              </td>
              
              {/* Editable Company */}
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                {editingCell?.leadId === lead.id && editingCell?.field === 'company' ? (
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={() => saveEdit(lead.id, 'company')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveEdit(lead.id, 'company');
                      if (e.key === 'Escape') cancelEdit();
                    }}
                    autoFocus
                    className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                ) : (
                  <span
                    onClick={() => startEdit(lead.id, 'company', lead.company || '')}
                    className="cursor-pointer hover:bg-gray-100 px-2 py-1 rounded block"
                    title="Click to edit"
                  >
                    {lead.company || '—'}
                  </span>
                )}
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
