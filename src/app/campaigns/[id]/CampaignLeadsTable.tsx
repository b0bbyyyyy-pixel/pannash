'use client';

import { useState, useEffect } from 'react';
import EngagementStats from './EngagementStats';

interface Lead {
  id: string;
  status: string;
  sent_at?: string;
  next_email_at?: string;
  loop_count?: number;
  leads: {
    name: string;
    email: string;
    phone?: string;
    company?: string;
  };
}

interface CampaignLeadsTableProps {
  leads: Lead[];
  queueItems: any[];
}

export default function CampaignLeadsTable({ leads, queueItems }: CampaignLeadsTableProps) {
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

    if (diff <= 0) return 'Sending...';

    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);

    if (minutes > 60) {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      return `${hours}h ${remainingMinutes}m`;
    }

    return `${minutes}m ${seconds}s`;
  };

  // Map queue items to leads
  const leadsWithQueue = leads.map(lead => {
    const queueItem = queueItems.find(q => q.campaign_lead_id === lead.id);
    return {
      ...lead,
      scheduledFor: queueItem?.scheduled_for,
      queueStatus: queueItem?.status,
    };
  });

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Name
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Email
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Phone
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Company
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Sent
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {leadsWithQueue.map((lead: any) => (
            <tr key={lead.id} className="hover:bg-gray-50">
              <td className="px-6 py-4">
                <div className="font-medium text-gray-900 text-sm">{lead.leads?.name}</div>
                <EngagementStats campaignLeadId={lead.id} />
              </td>
              <td className="px-6 py-4 text-sm text-gray-600">
                {lead.leads?.email}
              </td>
              <td className="px-6 py-4 text-sm text-gray-600">
                {lead.leads?.phone || '—'}
              </td>
              <td className="px-6 py-4 text-sm text-gray-600">
                {lead.leads?.company || '—'}
              </td>
              <td className="px-6 py-4 text-sm text-gray-600">
                {lead.sent_at ? (
                  <div>
                    <div>{new Date(lead.sent_at).toLocaleDateString()}</div>
                    <div className="text-xs text-gray-400">
                      {new Date(lead.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </td>
              <td className="px-6 py-4">
                {lead.scheduledFor && lead.status !== 'sent' && lead.status !== 'opened' && lead.status !== 'replied' ? (
                  <div suppressHydrationWarning>
                    <div className="font-mono font-semibold text-green-600">
                      {getCountdown(lead.scheduledFor)}
                    </div>
                    <div className="text-xs text-gray-400">
                      {new Date(lead.scheduledFor).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                ) : (
                  <span className={`inline-flex px-3 py-1 text-xs font-medium rounded-full ${
                    lead.status === 'replied' ? 'bg-green-100 text-green-800' :
                    lead.status === 'opened' ? 'bg-blue-100 text-blue-800' :
                    lead.status === 'sent' ? 'bg-gray-100 text-gray-800' :
                    lead.status === 'queued' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-gray-50 text-gray-600'
                  }`}>
                    {lead.status}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      
      {leads.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          No leads in this campaign yet
        </div>
      )}
    </div>
  );
}
