/**
 * Follow-up scheduling logic
 */

export type FollowUpTiming = '3_days' | '1_week' | '2_weeks' | 'custom';

export interface FollowUpRule {
  timing: FollowUpTiming;
  customDays?: number;
  minEngagementScore: number; // Only follow up if score >= this
  maxEngagementScore: number; // Don't follow up if score > this (they're hot)
}

/**
 * Calculate when to send the next follow-up
 */
export function calculateFollowUpDate(
  lastEmailSent: Date,
  timing: FollowUpTiming,
  customDays?: number
): Date {
  const followUpDate = new Date(lastEmailSent);
  
  switch (timing) {
    case '3_days':
      followUpDate.setDate(followUpDate.getDate() + 3);
      break;
    case '1_week':
      followUpDate.setDate(followUpDate.getDate() + 7);
      break;
    case '2_weeks':
      followUpDate.setDate(followUpDate.getDate() + 14);
      break;
    case 'custom':
      if (customDays) {
        followUpDate.setDate(followUpDate.getDate() + customDays);
      } else {
        // Default to 5 days if custom not specified
        followUpDate.setDate(followUpDate.getDate() + 5);
      }
      break;
  }
  
  // Set to business hours (10 AM)
  followUpDate.setHours(10, 0, 0, 0);
  
  return followUpDate;
}

/**
 * Determine if a lead should receive a follow-up based on engagement
 */
export function shouldFollowUp(
  engagementScore: number,
  rule: FollowUpRule
): boolean {
  return (
    engagementScore >= rule.minEngagementScore &&
    engagementScore < rule.maxEngagementScore
  );
}

/**
 * Default follow-up rules
 */
export const DEFAULT_FOLLOWUP_RULES: FollowUpRule[] = [
  {
    timing: '3_days',
    minEngagementScore: 10, // At least 2 opens
    maxEngagementScore: 50, // But not hot yet
  },
  {
    timing: '1_week',
    minEngagementScore: 5, // At least 1 open
    maxEngagementScore: 10, // Low engagement
  },
];

/**
 * Generate A/B test variant
 */
export function getABTestVariant(campaignLeadId: string): 'A' | 'B' {
  // Simple hash-based assignment (consistent for same lead)
  const hash = campaignLeadId.split('').reduce((acc, char) => {
    return acc + char.charCodeAt(0);
  }, 0);
  
  return hash % 2 === 0 ? 'A' : 'B';
}
