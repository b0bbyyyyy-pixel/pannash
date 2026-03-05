'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import EngagementStats from './EngagementStats';

// Component to show meaningful lead status
function LeadStatus({ 
  status, 
  campaignLeadId, 
  openedAt, 
  repliedAt,
  bouncedAt,
  bounceReason,
  errorMessage
}: { 
  status: string; 
  campaignLeadId: string;
  openedAt?: string;
  repliedAt?: string;
  bouncedAt?: string;
  bounceReason?: string;
  errorMessage?: string;
}) {
  const [engagement, setEngagement] = useState<{ opens: number; clicks: number } | null>(null);

  useEffect(() => {
    fetch(`/api/leads/engagement?campaignLeadId=${campaignLeadId}`)
      .then(res => res.json())
      .then(data => {
        if (data.opens !== undefined && data.clicks !== undefined) {
          setEngagement({ opens: data.opens, clicks: data.clicks });
        }
      })
      .catch(err => console.error('Error fetching engagement:', err));
  }, [campaignLeadId]);

  // Determine the most meaningful status to show
  let displayStatus = '';
  let statusColor = '';
  let icon = '';
  let tooltip = '';

  if (status === 'replied' || repliedAt) {
    displayStatus = 'Replied';
    statusColor = 'bg-green-100 text-green-800 border border-green-200';
    icon = '';
  } else if (engagement && engagement.clicks > 0) {
    displayStatus = `Clicked (${engagement.clicks})`;
    statusColor = 'bg-[#722F37] text-white border border-[#722F37]';
    icon = '';
  } else if (status === 'opened' || openedAt) {
    const openCount = engagement?.opens || 0;
    displayStatus = openCount > 0 ? `Opened (${openCount})` : 'Opened';
    statusColor = 'bg-blue-100 text-blue-800 border border-blue-200';
    icon = '';
  } else if (status === 'delivered') {
    displayStatus = 'Delivered';
    statusColor = 'bg-green-50 text-green-700 border border-green-200';
    icon = '';
    tooltip = 'Email successfully delivered to recipient mailbox';
  } else if (status === 'sent') {
    displayStatus = 'Sent';
    statusColor = 'bg-gray-100 text-gray-700 border border-gray-200';
    icon = '';
    tooltip = 'Email sent to provider, awaiting delivery confirmation';
  } else if (status === 'bounced') {
    displayStatus = 'Bounced';
    statusColor = 'bg-red-100 text-red-800 border border-red-200';
    icon = '';
    tooltip = bounceReason || errorMessage || 'Email permanently failed (invalid address or rejected)';
  } else if (status === 'failed') {
    displayStatus = 'Failed';
    statusColor = 'bg-orange-100 text-orange-800 border border-orange-200';
    icon = '';
    tooltip = errorMessage || 'Temporary failure (connection issue or rate limit)';
  } else if (status === 'complained') {
    displayStatus = 'Spam';
    statusColor = 'bg-red-50 text-red-700 border border-red-200';
    icon = '';
    tooltip = 'Recipient marked as spam';
  } else if (status === 'pending') {
    displayStatus = 'Pending';
    statusColor = 'bg-yellow-50 text-yellow-800 border border-yellow-200';
    icon = '';
  } else {
    displayStatus = status.charAt(0).toUpperCase() + status.slice(1);
    statusColor = 'bg-gray-50 text-gray-600 border border-gray-200';
    icon = '';
  }

  return (
    <span 
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full ${statusColor} ${tooltip ? 'cursor-help' : ''}`}
      title={tooltip}
    >
      {icon && <span>{icon}</span>}
      {displayStatus}
    </span>
  );
}

interface Lead {
  id: string;
  status: string;
  sent_at?: string;
  opened_at?: string;
  replied_at?: string;
  bounced_at?: string;
  bounce_reason?: string;
  error_message?: string;
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
  campaignId: string;
  campaignStatus: string;
  leads: Lead[];
  queueItems: any[];
}

export default function CampaignLeadsTable({ campaignId, campaignStatus, leads, queueItems }: CampaignLeadsTableProps) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [orderedLeads, setOrderedLeads] = useState(leads);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Update leads when prop changes
  useEffect(() => {
    setOrderedLeads(leads);
  }, [leads]);

  // Update time every second for live countdown
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = orderedLeads.findIndex(lead => lead.id === active.id);
    const newIndex = orderedLeads.findIndex(lead => lead.id === over.id);

    const newOrder = arrayMove(orderedLeads, oldIndex, newIndex);
    setOrderedLeads(newOrder);

    // Save to database
    setSaving(true);
    try {
      const res = await fetch('/api/campaigns/reorder-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId,
          leadOrder: newOrder.map(lead => lead.id),
        }),
      });

      if (!res.ok) {
        alert('Failed to save new order');
        setOrderedLeads(leads); // Revert
      } else {
        router.refresh();
      }
    } catch (error) {
      console.error('Error saving order:', error);
      alert('Failed to save new order');
      setOrderedLeads(leads); // Revert
    } finally {
      setSaving(false);
    }
  };

  const getCountdown = (scheduledFor: string) => {
    if (campaignStatus !== 'active') {
      return 'PAUSED';
    }

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

  // Map queue items to leads and sort by next send time
  const leadsWithQueue = orderedLeads.map(lead => {
    const queueItem = queueItems.find(q => q.campaign_lead_id === lead.id);
    return {
      ...lead,
      scheduledFor: queueItem?.scheduled_for,
      queueStatus: queueItem?.status,
    };
  }).sort((a, b) => {
    // Pending/queued leads with schedule time come first, sorted by time
    if (a.scheduledFor && !b.scheduledFor) return -1;
    if (!a.scheduledFor && b.scheduledFor) return 1;
    if (a.scheduledFor && b.scheduledFor) {
      return new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime();
    }
    
    // Sent leads sorted by sent_at
    if (a.sent_at && b.sent_at) {
      return new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime(); // Most recent first
    }
    if (a.sent_at) return 1;
    if (b.sent_at) return -1;
    
    // Fallback to position
    return (a.position || 0) - (b.position || 0);
  });

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {saving && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 text-sm text-blue-700">
          Saving new order...
        </div>
      )}
      
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                
              </th>
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
            <SortableContext
              items={leadsWithQueue.map(l => l.id)}
              strategy={verticalListSortingStrategy}
            >
              {leadsWithQueue.map((lead: any) => (
                <SortableRow
                  key={lead.id}
                  lead={lead}
                  getCountdown={getCountdown}
                  campaignStatus={campaignStatus}
                />
              ))}
            </SortableContext>
          </tbody>
        </table>
      </DndContext>
      
      {leads.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          No leads in this campaign yet
        </div>
      )}
    </div>
  );
}

function SortableRow({ lead, getCountdown, campaignStatus }: { lead: any; getCountdown: (scheduledFor: string) => string; campaignStatus: string }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: lead.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className="hover:bg-gray-50"
    >
      <td className="px-2 py-4 cursor-grab active:cursor-grabbing" {...attributes} {...listeners}>
        <div className="text-gray-400 hover:text-gray-600">
          ☰
        </div>
      </td>
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
            <div className={`font-mono font-semibold ${campaignStatus === 'active' ? 'text-green-600' : 'text-gray-400'}`}>
              {getCountdown(lead.scheduledFor)}
            </div>
            <div className="text-xs text-gray-400">
              {campaignStatus === 'active' && new Date(lead.scheduledFor).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              {campaignStatus !== 'active' && '—'}
            </div>
          </div>
        ) : (
          <LeadStatus 
            status={lead.status}
            campaignLeadId={lead.id}
            openedAt={lead.opened_at}
            repliedAt={lead.replied_at}
            bouncedAt={lead.bounced_at}
            bounceReason={lead.bounce_reason}
            errorMessage={lead.error_message}
          />
        )}
      </td>
    </tr>
  );
}
