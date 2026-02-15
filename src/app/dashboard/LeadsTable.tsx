'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Lead {
  id: string;
  status: string;
  sent_at?: string;
  opened_at?: string;
  clicked_at?: string;
  replied_at?: string;
  error_message?: string;
  scheduledFor?: string;
  queueStatus?: string;
  next_email_at?: string;
  loop_count?: number;
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

  const getLoopCountdown = (nextEmailAt: string) => {
    const nextEmail = new Date(nextEmailAt);
    const diff = nextEmail.getTime() - currentTime.getTime();

    if (diff <= 0) {
      return 'Ready to loop';
    }

    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));

    if (days > 0) {
      return `${days}d until next`;
    }

    return `${hours}h until next`;
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

  const getNextEmailTime = () => {
    // Find the next queued email to send
    const queuedLeads = leads.filter(l => 
      (l.status === 'queued' || l.queueStatus === 'pending') && l.scheduledFor
    );
    
    if (queuedLeads.length === 0) return null;
    
    const nextLead = queuedLeads.reduce((earliest, current) => {
      if (!earliest.scheduledFor) return current;
      if (!current.scheduledFor) return earliest;
      return new Date(current.scheduledFor) < new Date(earliest.scheduledFor) ? current : earliest;
    });
    
    return nextLead.scheduledFor;
  };

  const nextEmailTime = getNextEmailTime();

  // Calculate progress stats for addictive feedback
  const queuedCount = leads.filter(l => 
    l.scheduledFor && l.status !== 'sent' && l.status !== 'opened' && l.status !== 'replied' && l.status !== 'failed' && l.status !== 'bounced'
  ).length;
  const sentCount = leads.filter(l => 
    (l.status === 'sent' || l.status === 'opened' || l.status === 'replied') && 
    l.status !== 'failed' && l.status !== 'bounced'
  ).length;
  const totalCount = leads.length;
  const progressPercent = totalCount > 0 ? Math.round((sentCount / totalCount) * 100) : 0;

  return (
    <div className="overflow-x-auto">
      {/* Next Email Countdown Banner */}
      {nextEmailTime && (
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-b-2 border-green-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl animate-pulse">⏱️</span>
              <div>
                <div className="text-sm font-medium text-gray-700">Next email sends in:</div>
                <div className="text-2xl font-bold text-gray-900 font-mono" suppressHydrationWarning>
                  {getCountdown(nextEmailTime)}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-600">
                at {new Date(nextEmailTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {queuedCount} queued • {sentCount}/{totalCount} sent ({progressPercent}%)
              </div>
            </div>
          </div>
          {/* Progress bar */}
          <div className="mt-3 w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <div 
              className="bg-gradient-to-r from-green-500 to-emerald-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      <table className="w-full">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
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
              Countdown / Status
            </th>
            <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
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
                  {lead.leads.email}
                </td>
                
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                  {lead.leads.phone || '—'}
                </td>
                
                <td className="px-6 py-4 whitespace-nowrap">
                  {lead.scheduledFor && lead.status !== 'sent' && lead.status !== 'opened' && lead.status !== 'replied' ? (
                    <div className="text-sm">
                      <div className="font-mono font-bold text-green-600 text-base" suppressHydrationWarning>
                        {getCountdown(lead.scheduledFor)}
                      </div>
                      <div className="text-xs text-gray-500">
                        {new Date(lead.scheduledFor).toLocaleTimeString([], { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </div>
                    </div>
                  ) : (lead.status === 'sent' || lead.status === 'opened') && lead.next_email_at ? (
                    <div className="text-sm">
                      <div className="flex items-center gap-1 mb-1">
                        {getStatusBadge(lead)}
                      </div>
                      <div className="font-mono text-xs text-[#722F37] font-semibold" suppressHydrationWarning>
                        📧 {getLoopCountdown(lead.next_email_at)}
                      </div>
                      {lead.loop_count && lead.loop_count > 0 && (
                        <div className="text-xs text-gray-400 mt-0.5">
                          Loop #{lead.loop_count}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>{getStatusBadge(lead)}</div>
                  )}
                </td>
                
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {lead.status === 'failed' || lead.status === 'bounced' ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xl">❌</span>
                      <div>
                        <div className="font-semibold text-red-600">Failed</div>
                        <div className="text-xs text-red-500" title={lead.error_message}>
                          {lead.error_message ? 
                            (lead.error_message.length > 30 ? 
                              lead.error_message.substring(0, 30) + '...' : 
                              lead.error_message
                            ) : 
                            'Delivery failed'
                          }
                        </div>
                      </div>
                    </div>
                  ) : isHot && lead.status === 'replied' ? (
                    <div className="flex items-center gap-2 animate-pulse">
                      <span className="text-2xl">🔥</span>
                      <div>
                        <div className="font-bold text-red-600">HOT LEAD!</div>
                        <div className="text-xs text-red-500">
                          Replied - Take Action
                        </div>
                      </div>
                    </div>
                  ) : lead.status === 'replied' || lead.replied_at ? (
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">💬</span>
                      <div>
                        <div className="font-semibold text-green-700">Replied!</div>
                        <div className="text-xs text-gray-500">
                          {lead.replied_at && new Date(lead.replied_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  ) : lead.clicked_at ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xl">🖱️</span>
                      <div>
                        <div className="font-semibold text-[#722F37]">Clicked Link!</div>
                        <div className="text-xs text-gray-500">
                          {new Date(lead.clicked_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  ) : lead.status === 'opened' || lead.opened_at ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xl">👁️</span>
                      <div>
                        <div className="font-semibold text-blue-700">Opened</div>
                        <div className="text-xs text-gray-500">
                          {lead.opened_at && new Date(lead.opened_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  ) : lead.status === 'sent' || lead.sent_at ? (
                    <div className="flex items-center gap-2">
                      <div>
                        <div className="font-semibold text-green-600">Delivered</div>
                        <div className="text-xs text-gray-500">
                          {lead.sent_at && new Date(lead.sent_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  ) : lead.scheduledFor ? (
                    <div className="flex items-center gap-2">
                      <div>
                        <div className="font-semibold text-yellow-700">Queued</div>
                        <div className="text-xs text-gray-500">
                          Sending soon
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-xl">⏸️</span>
                      <div>
                        <div className="font-semibold text-gray-500">Pending</div>
                        <div className="text-xs text-gray-400">
                          Not scheduled
                        </div>
                      </div>
                    </div>
                  )}
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
