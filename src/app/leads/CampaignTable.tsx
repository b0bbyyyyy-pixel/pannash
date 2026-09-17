'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

export interface Campaign {
  id: string;
  name: string;
  created_at: string;
  total: number;
  smsCount: number;
  callCount: number;
  touchedCount: number;
}

interface Props {
  campaigns: Campaign[];
  onRename: (id: string, newName: string) => void;
  onDelete: (id: string) => Promise<void>;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function CampaignTable({ campaigns, onRename, onDelete }: Props) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = (e: React.MouseEvent, campaign: Campaign) => {
    e.stopPropagation();
    setEditingId(campaign.id);
    setEditingName(campaign.name);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const commitRename = (id: string) => {
    const trimmed = editingName.trim();
    if (trimmed) {
      onRename(id, trimmed);
    }
    setEditingId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter') commitRename(id);
    if (e.key === 'Escape') setEditingId(null);
  };

  if (campaigns.length === 0) {
    return (
      <div className="bg-white border border-[#ebebeb] rounded-xl p-16 text-center">
        <div className="text-4xl mb-4">📋</div>
        <p className="text-[#1a1a1a] font-semibold text-base mb-1">No campaigns yet.</p>
        <p className="text-[#9b9b9b] text-sm">Upload leads to create your first campaign.</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#ebebeb] rounded-xl overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-[#f5f5f5]">
            <th className="text-[11px] font-bold text-[#9b9b9b] uppercase tracking-wider px-4 py-2 text-left">Campaign</th>
            <th className="text-[11px] font-bold text-[#9b9b9b] uppercase tracking-wider px-4 py-2 text-left">Total</th>
            <th className="text-[11px] font-bold text-[#9b9b9b] uppercase tracking-wider px-4 py-2 text-left">Outreach</th>
            <th className="text-[11px] font-bold text-[#9b9b9b] uppercase tracking-wider px-4 py-2 text-left">Progress</th>
            <th className="text-[11px] font-bold text-[#9b9b9b] uppercase tracking-wider px-4 py-2 text-left">Created</th>
            <th className="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((campaign) => {
            const progressPct = campaign.total > 0 ? (campaign.touchedCount / campaign.total) * 100 : 0;
            return (
              <tr
                key={campaign.id}
                onClick={() => router.push(`/leads?list=${campaign.id}`)}
                className="border-b border-[#f5f5f5] hover:bg-[#fafafa] cursor-pointer transition-colors last:border-b-0"
              >
                {/* Campaign name */}
                <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-2">
                    {editingId === campaign.id ? (
                      <input
                        ref={inputRef}
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onBlur={() => commitRename(campaign.id)}
                        onKeyDown={(e) => handleKeyDown(e, campaign.id)}
                        className="text-sm font-semibold text-[#1a1a1a] border-b border-[#1a1a1a] outline-none bg-transparent w-48 pb-0.5"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span
                        className="text-sm font-semibold text-[#1a1a1a] cursor-pointer"
                        onClick={() => router.push(`/leads?list=${campaign.id}`)}
                      >
                        {campaign.name}
                      </span>
                    )}
                    <button
                      onClick={(e) => startEdit(e, campaign)}
                      className="opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity text-[#9b9b9b] hover:text-[#1a1a1a]"
                      title="Rename"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                  </div>
                </td>

                {/* Total */}
                <td className="px-4 py-2">
                  <span className="text-sm text-[#1a1a1a] font-medium">{campaign.total}</span>
                </td>

                {/* Outreach badges */}
                <td className="px-4 py-2">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-[#1a1a1a] font-medium">SMS {campaign.smsCount}</span>
                    <span className="text-xs text-[#9b9b9b] font-medium">Call {campaign.callCount}</span>
                  </div>
                </td>

                {/* Progress bar */}
                <td className="px-4 py-2 min-w-[120px]">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-gray-100">
                      <div
                        className="h-1.5 rounded-full bg-gradient-to-r from-gray-300 to-gray-800 transition-all"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                    <span className="text-[11px] text-[#9b9b9b] font-medium whitespace-nowrap">
                      {campaign.touchedCount}/{campaign.total}
                    </span>
                  </div>
                </td>

                {/* Created date */}
                <td className="px-4 py-2">
                  <span className="text-sm text-[#9b9b9b]">{formatDate(campaign.created_at)}</span>
                </td>

                {/* Actions */}
                <td className="px-4 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-3">
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(campaign.id); }}
                      className="text-[#c4c4c4] hover:text-red-500 transition-colors"
                      title="Delete campaign"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                    <svg className="w-4 h-4 text-[#c4c4c4]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Delete confirm dialog */}
      {confirmDeleteId && (
        <>
          <div className="fixed inset-0 bg-black/40 z-[50]" onClick={() => setConfirmDeleteId(null)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[51] bg-white rounded-2xl shadow-2xl p-6 w-80">
            <h3 className="text-sm font-bold text-[#1a1a1a] mb-2">Delete campaign?</h3>
            <p className="text-xs text-[#9b9b9b] mb-5">This will permanently delete the campaign and all its leads. This cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="px-4 py-2 text-sm text-[#6b6b6b] hover:text-[#1a1a1a] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => { setConfirmDeleteId(null); await onDelete(confirmDeleteId); }}
                className="px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
