'use client';

import { useState, useEffect } from 'react';

interface CampaignCountdownProps {
  queueItems: any[];
  campaignLeads: any[];
  loopAfterDays?: number;
}

export default function CampaignCountdown({ 
  queueItems, 
  campaignLeads,
  loopAfterDays = 14 
}: CampaignCountdownProps) {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Check if there are pending queue items
  const nextQueueItem = queueItems
    .filter(item => item.status === 'pending')
    .sort((a, b) => new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime())[0];

  // Check if all emails have been sent
  const allSent = campaignLeads.every(lead => 
    ['sent', 'opened', 'replied'].includes(lead.status)
  );

  // Get the most recent sent email with next_email_at
  const nextLoopLead = campaignLeads
    .filter(lead => lead.next_email_at)
    .sort((a, b) => new Date(a.next_email_at).getTime() - new Date(b.next_email_at).getTime())[0];

  const getCountdown = (targetDate: Date) => {
    const diff = targetDate.getTime() - currentTime.getTime();

    if (diff <= 0) return 'Starting now...';

    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    const minutes = Math.floor((diff % (60 * 60 * 1000)) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);

    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m ${seconds}s`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  };

  // Determine what to show
  if (allSent && nextLoopLead) {
    // All emails sent, show countdown to next loop
    const nextLoopDate = new Date(nextLoopLead.next_email_at);
    return (
      <p className="text-gray-500">
        Reloops in <span suppressHydrationWarning key={currentTime.getTime()}>{getCountdown(nextLoopDate)}</span>
      </p>
    );
  } else if (nextQueueItem) {
    // Show countdown to next queued email
    const nextEmailDate = new Date(nextQueueItem.scheduled_for);
    return (
      <p className="text-gray-500">
        Next email in <span suppressHydrationWarning key={currentTime.getTime()}>{getCountdown(nextEmailDate)}</span>
      </p>
    );
  } else if (allSent && !nextLoopLead) {
    // All sent but no loop configured
    return (
      <p className="text-gray-500">
        All emails sent
      </p>
    );
  } else {
    // Campaign paused or no queue items
    return (
      <p className="text-gray-500">
        Campaign paused
      </p>
    );
  }
}
