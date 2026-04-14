'use client';

import { useEffect } from 'react';

interface TrackLastViewedProps {
  campaignId: string;
}

export default function TrackLastViewed({ campaignId }: TrackLastViewedProps) {
  useEffect(() => {
    // Store this campaign as last viewed in localStorage
    localStorage.setItem('lastViewedCampaign', campaignId);
    
    // Also store in cookie so server can access it
    document.cookie = `lastViewedCampaign=${campaignId}; path=/; max-age=31536000`; // 1 year
  }, [campaignId]);

  return null; // This component doesn't render anything
}
