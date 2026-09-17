'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';

export interface CampaignLead {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  notes?: string | null;
  sms_sent_at?: string | null;
  call_made_at?: string | null;
  last_contact?: string | null;
  created_at?: string | null;
}

interface Props {
  leads: CampaignLead[];
  campaignName: string;
  listId: string;
}

function relativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function mostRecent(...dates: (string | null | undefined)[]): string | null {
  const valid = dates.filter(Boolean) as string[];
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => (new Date(a) > new Date(b) ? a : b));
}

export default function CampaignLeadsView({ leads: initialLeads, campaignName, listId }: Props) {
  const router = useRouter();
  const [leads, setLeads] = useState<CampaignLead[]>(initialLeads);
  const [search, setSearch] = useState('');
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return leads;
    const q = search.toLowerCase();
    return leads.filter(
      (l) =>
        l.name?.toLowerCase().includes(q) ||
        l.email?.toLowerCase().includes(q) ||
        l.phone?.includes(q) ||
        l.company?.toLowerCase().includes(q)
    );
  }, [leads, search]);

  const smsCount = leads.filter((l) => l.sms_sent_at).length;
  const callCount = leads.filter((l) => l.call_made_at).length;

  const handleOutreach = async (leadId: string, type: 'sms' | 'call') => {
    setLoadingId(leadId);

    // Optimistic update
    setLeads((prev) =>
      prev.map((l) => {
        if (l.id !== leadId) return l;
        const col = type === 'sms' ? 'sms_sent_at' : 'call_made_at';
        const current = l[col];
        return { ...l, [col]: current ? null : new Date().toISOString() };
      })
    );

    try {
      const res = await fetch('/api/leads/outreach', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, type }),
      });
      const json = await res.json();
      if (res.ok && json.lead) {
        // Sync with server value
        setLeads((prev) =>
          prev.map((l) => (l.id === leadId ? { ...l, ...json.lead } : l))
        );
      } else {
        // Revert optimistic update on error
        setLeads((prev) =>
          prev.map((l) => {
            if (l.id !== leadId) return l;
            const col = type === 'sms' ? 'sms_sent_at' : 'call_made_at';
            const current = l[col];
            return { ...l, [col]: current ? null : new Date().toISOString() };
          })
        );
      }
    } catch {
      // revert on network failure
      setLeads((prev) =>
        prev.map((l) => {
          if (l.id !== leadId) return l;
          const col = type === 'sms' ? 'sms_sent_at' : 'call_made_at';
          const current = l[col];
          return { ...l, [col]: current ? null : new Date().toISOString() };
        })
      );
    }

    setLoadingId(null);
  };

  return (
    <div className="space-y-6">
      {/* Back navigation */}
      <button
        onClick={() => router.push('/leads')}
        className="flex items-center gap-1.5 text-sm text-[#6b6b6b] hover:text-[#1a1a1a] transition-colors font-medium"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        All Campaigns
      </button>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-[#1a1a1a]">{campaignName}</h2>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-[11px] text-[#6b6b6b] font-medium bg-gray-100 px-2 py-0.5 rounded-full">
              {leads.length} lead{leads.length !== 1 ? 's' : ''}
            </span>
            <span className="bg-blue-50 text-blue-600 text-[10px] font-semibold px-2 py-0.5 rounded-full">
              SMS {smsCount}
            </span>
            <span className="bg-green-50 text-green-600 text-[10px] font-semibold px-2 py-0.5 rounded-full">
              Calls {callCount}
            </span>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9b9b9b]"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder="Search leads…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 border border-[#e5e5e5] rounded-lg text-sm text-[#1a1a1a] focus:outline-none focus:ring-1 focus:ring-[#1a1a1a] focus:border-[#1a1a1a] bg-white"
        />
      </div>

      {/* Table */}
      <div className="bg-white border border-[#ebebeb] rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#f5f5f5]">
              <th className="text-[11px] font-bold text-[#9b9b9b] uppercase tracking-wider px-4 py-3 text-left">Lead</th>
              <th className="text-[11px] font-bold text-[#9b9b9b] uppercase tracking-wider px-4 py-3 text-left">Contact</th>
              <th className="text-[11px] font-bold text-[#9b9b9b] uppercase tracking-wider px-4 py-3 text-left">SMS</th>
              <th className="text-[11px] font-bold text-[#9b9b9b] uppercase tracking-wider px-4 py-3 text-left">Call</th>
              <th className="text-[11px] font-bold text-[#9b9b9b] uppercase tracking-wider px-4 py-3 text-left">Last Activity</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-[#9b9b9b] text-sm">
                  {search ? 'No leads match your search.' : 'No leads in this campaign yet.'}
                </td>
              </tr>
            )}
            {filtered.map((lead) => {
              const lastActivity = mostRecent(lead.last_contact, lead.sms_sent_at, lead.call_made_at);
              const isLoading = loadingId === lead.id;

              return (
                <tr key={lead.id} className="border-b border-[#f5f5f5] hover:bg-[#fafafa] transition-colors last:border-b-0">
                  {/* Lead name + company */}
                  <td className="px-4 py-3.5">
                    <div className="font-semibold text-sm text-[#1a1a1a]">{lead.name || '—'}</div>
                    {lead.company && (
                      <div className="text-xs text-[#9b9b9b] mt-0.5">{lead.company}</div>
                    )}
                  </td>

                  {/* Contact info */}
                  <td className="px-4 py-3.5">
                    {lead.phone && (
                      <div className="text-xs text-[#6b6b6b]">{lead.phone}</div>
                    )}
                    {lead.email && (
                      <div className="text-xs text-[#9b9b9b] mt-0.5">{lead.email}</div>
                    )}
                    {!lead.phone && !lead.email && (
                      <span className="text-xs text-[#c4c4c4]">—</span>
                    )}
                  </td>

                  {/* SMS badge */}
                  <td className="px-4 py-3.5">
                    <button
                      disabled={isLoading}
                      onClick={() => handleOutreach(lead.id, 'sms')}
                      className={`transition-colors disabled:opacity-50 ${
                        lead.sms_sent_at
                          ? 'bg-blue-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full cursor-pointer'
                          : 'border border-[#e5e5e5] text-[#9b9b9b] text-[10px] px-2 py-0.5 rounded-full cursor-pointer hover:border-blue-300'
                      }`}
                      title={lead.sms_sent_at ? 'SMS sent — click to unmark' : 'Mark SMS sent'}
                    >
                      SMS
                    </button>
                  </td>

                  {/* Call badge */}
                  <td className="px-4 py-3.5">
                    <button
                      disabled={isLoading}
                      onClick={() => handleOutreach(lead.id, 'call')}
                      className={`transition-colors disabled:opacity-50 ${
                        lead.call_made_at
                          ? 'bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full cursor-pointer'
                          : 'border border-[#e5e5e5] text-[#9b9b9b] text-[10px] px-2 py-0.5 rounded-full cursor-pointer hover:border-green-300'
                      }`}
                      title={lead.call_made_at ? 'Call made — click to unmark' : 'Mark call made'}
                    >
                      Call
                    </button>
                  </td>

                  {/* Last activity */}
                  <td className="px-4 py-3.5">
                    <span className="text-xs text-[#9b9b9b]">{relativeTime(lastActivity)}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
