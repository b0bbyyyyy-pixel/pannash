'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Lead {
  id: string;
  status: string;
  sent_at?: string;
  opened_at?: string;
  replied_at?: string;
  scheduledFor?: string;
  queueStatus?: string;
  leads: {
    name: string;
    email: string;
    phone?: string;
    company?: string;
  };
}

interface LeadsTableProps {
  leads: Lead[];
  campaignId: string;
}

export default function LeadsTable({ leads, campaignId }: LeadsTableProps) {
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update time every second for live countdown
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const getCountdown = (scheduledFor: string) => {
    const scheduled = new Date(scheduledFor);
    const diff = scheduled.getTime() - currentTime.getTime();

    if (diff <= 0) {
      return 'Sending now...';
    }

    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);

    if (minutes > 60) {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      return `${hours}h ${remainingMinutes}m`;
    }

    return `${minutes}m ${seconds}s`;
  };

  const getStatusBadge = (lead: Lead) => {
    if (lead.status === 'replied') {
      return (
        <span className="inline-flex px-3 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
          Replied
        </span>
      );
    }
    if (lead.status === 'opened') {
      return (
        <span className="inline-flex px-3 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
          Opened
        </span>
      );
    }
    if (lead.status === 'sent') {
      return (
        <span className="inline-flex px-3 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800">
          Sent
        </span>
      );
    }
    if (lead.status === 'queued' || lead.queueStatus === 'pending') {
      return (
        <span className="inline-flex px-3 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">
          Queued
        </span>
      );
    }
    return (
      <span className="inline-flex px-3 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600">
        Pending
      </span>
    );
  };

  // Check if this lead is hot
  const [hotLeads, setHotLeads] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Fetch hot leads
    fetch('/api/leads/check-hot')
      .then(res => res.json())
      .then(data => {
        if (data.hotLeadIds) {
          setHotLeads(new Set(data.hotLeadIds));
        }
      })
      .catch(err => console.error('Error fetching hot leads:', err));
  }, []);

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Lead Name
            </th>
            <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Phone
            </th>
            <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Scheduled For
            </th>
            <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Action
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {leads.slice(0, 50).map((lead) => {
            const isHot = hotLeads.has(lead.id);
            
            return (
              <tr 
                key={lead.id} 
                className={`hover:bg-gray-50 transition-colors ${isHot ? 'bg-red-50 border-l-4 border-red-500' : ''}`}
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    {isHot && (
                      <span className="mr-2 text-red-600 font-bold">🔥</span>
                    )}
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {lead.leads.name}
                      </div>
                      {lead.leads.company && (
                        <div className="text-xs text-gray-500">
                          {lead.leads.company}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                  {lead.leads.phone || '—'}
                </td>
                
                <td className="px-6 py-4 whitespace-nowrap">
                  {lead.scheduledFor ? (
                    <div className="text-sm">
                      <div className="font-mono font-medium text-gray-900">
                        {getCountdown(lead.scheduledFor)}
                      </div>
                      <div className="text-xs text-gray-500">
                        {new Date(lead.scheduledFor).toLocaleTimeString([], { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </div>
                    </div>
                  ) : lead.sent_at ? (
                    <div className="text-sm text-gray-500">
                      Sent {new Date(lead.sent_at).toLocaleDateString()}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-400">—</div>
                  )}
                </td>
                
                <td className="px-6 py-4 whitespace-nowrap">
                  {getStatusBadge(lead)}
                </td>
                
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <Link 
                    href={`/campaigns/${campaignId}`}
                    className="text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    View
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      
      {leads.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          No leads in this campaign yet
        </div>
      )}
      
      {leads.length > 50 && (
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 text-center text-sm text-gray-600">
          Showing 50 of {leads.length} leads
        </div>
      )}
    </div>
  );
}
