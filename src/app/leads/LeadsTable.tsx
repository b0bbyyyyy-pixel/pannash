'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import BulkDeleteButton from './BulkDeleteButton';
import { getPhoneLocation, type PhoneLocationInfo } from '@/lib/phoneLocation';

interface Lead {
  id: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  notes?: string | null;
  last_contact?: string | null;
  created_at?: string | null;
  email_status?: string;
  email_validation_notes?: string;
  lead_lists?: { name: string };
}

interface ContextMenu {
  x: number;
  y: number;
  lead: Lead;
}

interface LeadsTableProps {
  leads: Lead[];
  deleteLead: (formData: FormData) => Promise<void>;
  deleteMultipleLeads: (formData: FormData) => Promise<void>;
  searchQuery?: string;
}

function fmt(date: string | null | undefined) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

export default function LeadsTable({ leads, deleteLead, deleteMultipleLeads, searchQuery = '' }: LeadsTableProps) {
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [editingCell, setEditingCell] = useState<{ leadId: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [promoting, setPromoting] = useState<string | null>(null);
  const [promoteConfirm, setPromoteConfirm] = useState<Lead | null>(null);
  const [promoteMonth, setPromoteMonth] = useState('');
  const [dashboardTabs, setDashboardTabs] = useState<{ month_key: string; custom_name: string }[]>([]);
  // Phone hover tooltip
  const [hoveredPhone, setHoveredPhone] = useState<string | null>(null);
  const [phoneLocationData, setPhoneLocationData] = useState<Record<string, PhoneLocationInfo | null>>({});
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const contextRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Close context menu on click outside
  useEffect(() => {
    function close(e: MouseEvent) {
      if (contextRef.current && !contextRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    }
    if (contextMenu) document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [contextMenu]);

  // Close context menu on scroll
  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener('scroll', close, true);
    return () => window.removeEventListener('scroll', close, true);
  }, []);

  const filteredLeads = leads.filter(lead => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      lead.name?.toLowerCase().includes(q) ||
      lead.email?.toLowerCase().includes(q) ||
      lead.phone?.toLowerCase().includes(q) ||
      lead.company?.toLowerCase().includes(q)
    );
  });

  const allSelected = filteredLeads.length > 0 && selectedLeads.length === filteredLeads.length;
  const someSelected = selectedLeads.length > 0 && selectedLeads.length < filteredLeads.length;

  const toggleSelect = (id: string) =>
    setSelectedLeads(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  const toggleAll = () =>
    setSelectedLeads(allSelected ? [] : filteredLeads.map(l => l.id));

  const startEdit = (leadId: string, field: string, val: string) => {
    setEditingCell({ leadId, field });
    setEditValue(val || '');
  };

  const cancelEdit = () => { setEditingCell(null); setEditValue(''); };

  const saveEdit = useCallback(async (leadId: string, field: string) => {
    try {
      const res = await fetch('/api/leads/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, field, value: editValue }),
      });
      if (res.ok) { setEditingCell(null); setEditValue(''); router.refresh(); }
      else { const d = await res.json(); alert(`Error: ${d.error}`); }
    } catch { alert('Failed to save'); }
  }, [editValue, router]);

  const handleContextMenu = (e: React.MouseEvent, lead: Lead) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, lead });
  };

  const handleDelete = async (lead: Lead) => {
    setContextMenu(null);
    if (!confirm(`Delete "${lead.name}"?`)) return;
    const fd = new FormData();
    fd.append('leadId', lead.id);
    await deleteLead(fd);
    router.refresh();
  };

  const handlePromote = async () => {
    if (!promoteConfirm) return;
    setPromoting(promoteConfirm.id);
    try {
      const res = await fetch('/api/leads/promote-to-crm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: promoteConfirm.id, monthKey: promoteMonth }),
      });
      if (res.ok) {
        setPromoteConfirm(null);
        router.refresh();
        router.push('/dashboard');
      } else {
        const d = await res.json();
        alert(`Error: ${d.error}`);
      }
    } finally {
      setPromoting(null);
    }
  };

  function EditableCell({ lead, field, value, type = 'text' }: { lead: Lead; field: string; value: string; type?: string }) {
    const isEditing = editingCell?.leadId === lead.id && editingCell?.field === field;
    if (isEditing) {
      return (
        <input
          type={type}
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={() => saveEdit(lead.id, field)}
          onKeyDown={e => { if (e.key === 'Enter') saveEdit(lead.id, field); if (e.key === 'Escape') cancelEdit(); }}
          autoFocus
          className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-900 text-sm"
        />
      );
    }
    return (
      <span
        onClick={() => startEdit(lead.id, field, value)}
        className="cursor-pointer hover:bg-gray-100 px-2 py-1 rounded block truncate max-w-[180px]"
        title={value || 'Click to edit'}
      >
        {value || '—'}
      </span>
    );
  }

  if (!leads || leads.length === 0) {
    return (
      <div className="p-12 text-center text-gray-500">
        <p className="text-lg mb-2">No leads yet</p>
        <p className="text-sm">Upload a CSV file or add leads manually</p>
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
      <table className="w-full min-w-[900px]">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-4 py-3 w-10">
              <input
                type="checkbox"
                checked={allSelected}
                ref={el => { if (el) el.indeterminate = someSelected; }}
                onChange={toggleAll}
                className="w-4 h-4 rounded cursor-pointer"
              />
            </th>
            {['DATE', 'LAST ATTEMPT', 'OPPORTUNITY', 'NAME', 'E-MAIL', 'PHONE', 'NOTES', 'LIST'].map(h => (
              <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-100">
          {filteredLeads.map(lead => (
            <tr
              key={lead.id}
              onContextMenu={e => handleContextMenu(e, lead)}
              className={`hover:bg-gray-50 transition-colors cursor-context-menu select-none ${
                selectedLeads.includes(lead.id) ? 'bg-blue-50' : ''
              }`}
            >
              <td className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={selectedLeads.includes(lead.id)}
                  onChange={() => toggleSelect(lead.id)}
                  className="w-4 h-4 rounded cursor-pointer"
                  onClick={e => e.stopPropagation()}
                />
              </td>

              {/* DATE — upload date, read-only */}
              <td className="px-4 py-3 text-sm text-gray-400 whitespace-nowrap">
                {fmt(lead.created_at)}
              </td>

              {/* LAST ATTEMPT — editable outreach date */}
              <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                {editingCell?.leadId === lead.id && editingCell?.field === 'last_contact' ? (
                  <input
                    type="datetime-local"
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    onBlur={() => saveEdit(lead.id, 'last_contact')}
                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(lead.id, 'last_contact'); if (e.key === 'Escape') cancelEdit(); }}
                    autoFocus
                    className="px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none"
                  />
                ) : (
                  <span
                    onClick={() => startEdit(lead.id, 'last_contact', lead.last_contact ? new Date(lead.last_contact).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16))}
                    className="cursor-pointer hover:bg-gray-100 px-2 py-1 rounded block"
                    title="Click to set last attempt date"
                  >
                    {fmt(lead.last_contact) || <span className="text-gray-300 italic">—</span>}
                  </span>
                )}
              </td>

              {/* OPPORTUNITY (Company) */}
              <td className="px-4 py-3 text-sm text-gray-700 font-medium">
                <EditableCell lead={lead} field="company" value={lead.company || ''} />
              </td>

              {/* NAME */}
              <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                <EditableCell lead={lead} field="name" value={lead.name} />
              </td>

              {/* EMAIL */}
              <td className="px-4 py-3 text-sm text-gray-600">
                <div className="flex items-center gap-1.5">
                  <EditableCell lead={lead} field="email" value={lead.email} type="email" />
                  {lead.email_status && lead.email_status !== 'unchecked' && (
                    <span className={`flex-shrink-0 text-xs px-1.5 py-0.5 rounded-full ${
                      lead.email_status === 'valid' ? 'bg-green-100 text-green-700' :
                      lead.email_status === 'invalid' ? 'bg-red-100 text-red-700' :
                      lead.email_status === 'missing' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                      {lead.email_status === 'valid' ? '✓' :
                       lead.email_status === 'invalid' ? '✗' :
                       lead.email_status === 'missing' ? '?' : '🤖'}
                    </span>
                  )}
                </div>
              </td>

              {/* PHONE — with location tooltip on hover */}
              <td className="px-4 py-3 text-sm text-gray-600 relative">
                {editingCell?.leadId === lead.id && editingCell?.field === 'phone' ? (
                  <EditableCell lead={lead} field="phone" value={lead.phone || ''} type="tel" />
                ) : (
                  <div className="relative inline-block">
                    <span
                      onMouseEnter={e => {
                        if (!lead.phone) return;
                        const key = lead.id;
                        if (!phoneLocationData[key]) {
                          const info = getPhoneLocation(lead.phone, Intl.DateTimeFormat().resolvedOptions().timeZone);
                          setPhoneLocationData(prev => ({ ...prev, [key]: info }));
                        }
                        const rect = (e.target as HTMLElement).getBoundingClientRect();
                        setTooltipPos({ x: rect.left + rect.width / 2, y: rect.bottom + 6 });
                        setHoveredPhone(key);
                      }}
                      onMouseLeave={() => { setHoveredPhone(null); setTooltipPos(null); }}
                      onClick={() => startEdit(lead.id, 'phone', lead.phone || '')}
                      className="cursor-pointer hover:bg-gray-100 px-2 py-1 rounded block whitespace-nowrap"
                    >
                      {lead.phone || <span className="text-gray-300">—</span>}
                    </span>
                    {hoveredPhone === lead.id && phoneLocationData[lead.id] && tooltipPos && (
                      <div
                        className="fixed z-[9999] bg-white border border-gray-200 rounded-lg shadow-xl p-3 whitespace-nowrap pointer-events-none"
                        style={{ left: tooltipPos.x, top: tooltipPos.y, transform: 'translateX(-50%)' }}
                      >
                        <div className="text-xs space-y-0.5">
                          <div className="font-semibold text-gray-900">
                            {phoneLocationData[lead.id]!.city}, {phoneLocationData[lead.id]!.state}
                          </div>
                          <div className="text-gray-500">
                            {phoneLocationData[lead.id]!.localTime} ({phoneLocationData[lead.id]!.timeOffset})
                          </div>
                        </div>
                        <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-l border-t border-gray-200 rotate-45" />
                      </div>
                    )}
                  </div>
                )}
              </td>

              {/* NOTES */}
              <td className="px-4 py-3 text-sm text-gray-600 max-w-[220px]">
                {editingCell?.leadId === lead.id && editingCell?.field === 'notes' ? (
                  <textarea
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    onBlur={() => saveEdit(lead.id, 'notes')}
                    onKeyDown={e => { if (e.key === 'Escape') cancelEdit(); if (e.key === 'Enter' && e.metaKey) saveEdit(lead.id, 'notes'); }}
                    autoFocus
                    rows={3}
                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
                  />
                ) : (
                  <span
                    onClick={() => startEdit(lead.id, 'notes', lead.notes || '')}
                    className="cursor-pointer hover:bg-gray-100 px-2 py-1 rounded block truncate"
                    title={lead.notes || 'Click to add notes'}
                  >
                    {lead.notes
                      ? <span className="text-gray-700">{lead.notes.length > 60 ? lead.notes.slice(0, 60) + '…' : lead.notes}</span>
                      : <span className="text-gray-300 italic">Add note…</span>
                    }
                  </span>
                )}
              </td>

              {/* LIST */}
              <td className="px-4 py-3 text-sm text-gray-400 whitespace-nowrap">
                {(lead.lead_lists as any)?.name || '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Right-click context menu */}
      {contextMenu && (
        <div
          ref={contextRef}
          style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, zIndex: 9999 }}
          className="bg-white border border-gray-200 rounded-xl shadow-2xl py-1 min-w-[210px]"
        >
          <div className="px-4 py-2 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-900 truncate">{contextMenu.lead.name}</p>
            <p className="text-xs text-gray-400 truncate">{contextMenu.lead.company || contextMenu.lead.email}</p>
          </div>
          <button
            onClick={async () => {
              setPromoteConfirm(contextMenu.lead);
              setContextMenu(null);
              // Fetch available dashboard tabs
              try {
                const res = await fetch('/api/dashboard/tabs');
                if (res.ok) {
                  const data = await res.json();
                  setDashboardTabs(data.tabs || []);
                  if (data.tabs?.length > 0) setPromoteMonth(data.tabs[0].month_key);
                }
              } catch {}
            }}
            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5"
          >
            <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            Move to Dashboard Leads
          </button>
          <button
            onClick={() => { startEdit(contextMenu.lead.id, 'last_contact', new Date().toISOString().slice(0, 16)); setContextMenu(null); }}
            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5"
          >
            <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Log Contact Attempt
          </button>
          <div className="border-t border-gray-100 mt-1" />
          <button
            onClick={() => handleDelete(contextMenu.lead)}
            className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete Lead
          </button>
        </div>
      )}

      {/* Move to Dashboard confirmation modal */}
      {promoteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <h3 className="text-base font-bold text-gray-900 mb-1">Move to Dashboard</h3>
            <p className="text-sm text-gray-500 mb-4">
              <span className="font-medium text-gray-800">{promoteConfirm.name}</span>
              {promoteConfirm.company ? ` · ${promoteConfirm.company}` : ''}
              {' '}will be added to your Dashboard pipeline with stage "Offers/Follow up".
            </p>
            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Dashboard Tab</label>
              {dashboardTabs.length > 0 ? (
                <select
                  value={promoteMonth}
                  onChange={e => setPromoteMonth(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                >
                  {dashboardTabs.map(tab => (
                    <option key={tab.month_key} value={tab.month_key}>
                      {tab.custom_name}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-xs text-gray-400 italic">No dashboard tabs found — create one in your Dashboard first.</p>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setPromoteConfirm(null)}
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handlePromote}
                disabled={!!promoting}
                className="flex-1 px-4 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-700 disabled:opacity-50"
              >
                {promoting ? 'Moving…' : 'Move to Dashboard'}
              </button>
            </div>
          </div>
        </div>
      )}

      <BulkDeleteButton
        selectedLeads={selectedLeads}
        onClearSelection={() => setSelectedLeads([])}
        deleteMultipleLeads={deleteMultipleLeads}
      />
    </>
  );
}
