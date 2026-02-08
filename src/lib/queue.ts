// Queue management utilities

/**
 * Calculate random delay between emails (30-300 seconds)
 */
export function getRandomDelay(): number {
  const minSeconds = 30;
  const maxSeconds = 300;
  return Math.floor(Math.random() * (maxSeconds - minSeconds + 1)) + minSeconds;
}

/**
 * Check if a date/time is within business hours (9 AM - 6 PM)
 */
export function isBusinessHours(date: Date): boolean {
  const hours = date.getHours();
  return hours >= 9 && hours < 18;
}

/**
 * Get next available business hour timestamp
 * If current time is after 6 PM, returns 9 AM next day
 * If current time is before 9 AM, returns 9 AM today
 */
export function getNextBusinessHour(date: Date): Date {
  const result = new Date(date);
  const hours = result.getHours();

  if (hours >= 18) {
    // After 6 PM - schedule for 9 AM next day
    result.setDate(result.getDate() + 1);
    result.setHours(9, 0, 0, 0);
  } else if (hours < 9) {
    // Before 9 AM - schedule for 9 AM today
    result.setHours(9, 0, 0, 0);
  }
  // If already in business hours, return as-is

  return result;
}

/**
 * Generate scheduled times for a batch of emails
 * @param count - Number of emails to schedule
 * @param startTime - Optional start time (defaults to next business hour)
 * @returns Array of ISO timestamp strings
 */
export function generateScheduledTimes(count: number, startTime?: Date): string[] {
  const times: string[] = [];
  let currentTime = startTime ? new Date(startTime) : getNextBusinessHour(new Date());

  for (let i = 0; i < count; i++) {
    // Ensure we're in business hours
    if (!isBusinessHours(currentTime)) {
      currentTime = getNextBusinessHour(currentTime);
    }

    times.push(currentTime.toISOString());

    // Add random delay for next email
    const delaySeconds = getRandomDelay();
    currentTime = new Date(currentTime.getTime() + delaySeconds * 1000);

    // If we've gone past 6 PM, jump to 9 AM next day
    if (currentTime.getHours() >= 18) {
      currentTime.setDate(currentTime.getDate() + 1);
      currentTime.setHours(9, 0, 0, 0);
    }
  }

  return times;
}

/**
 * Replace template variables in email content
 * Supported variables: [Name], [Company], [Email], [Phone], [Notes]
 */
export function replaceTemplateVariables(
  template: string,
  lead: {
    name: string;
    company?: string;
    email: string;
    phone?: string;
    notes?: string;
  }
): string {
  return template
    .replace(/\[Name\]/g, lead.name)
    .replace(/\[Company\]/g, lead.company || '')
    .replace(/\[Email\]/g, lead.email)
    .replace(/\[Phone\]/g, lead.phone || '')
    .replace(/\[Notes\]/g, lead.notes || '');
}
