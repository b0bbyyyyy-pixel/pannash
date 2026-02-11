/**
 * Email tracking utilities for opens and clicks
 */

/**
 * Generate a unique tracking ID for a campaign lead
 */
export function generateTrackingId(campaignLeadId: string): string {
  // Simple encoding - in production, consider encryption
  return Buffer.from(campaignLeadId).toString('base64url');
}

/**
 * Decode tracking ID back to campaign lead ID
 */
export function decodeTrackingId(trackingId: string): string {
  return Buffer.from(trackingId, 'base64url').toString('utf-8');
}

/**
 * Add tracking pixel to email body (invisible 1x1 image)
 */
export function addTrackingPixel(emailBody: string, trackingId: string, baseUrl: string): string {
  const trackingPixel = `<img src="${baseUrl}/api/track/open/${trackingId}" width="1" height="1" style="display:none" alt="" />`;
  
  // Add pixel at the end of the email
  return emailBody + '\n\n' + trackingPixel;
}

/**
 * Replace links in email body with tracking links
 */
export function addLinkTracking(emailBody: string, trackingId: string, baseUrl: string): string {
  // Regex to find URLs in text
  const urlRegex = /(https?:\/\/[^\s<>"]+)/g;
  
  return emailBody.replace(urlRegex, (url) => {
    const trackingUrl = `${baseUrl}/api/track/click/${trackingId}?url=${encodeURIComponent(url)}`;
    return trackingUrl;
  });
}

/**
 * Add both tracking pixel and link tracking to email
 */
export function addEmailTracking(
  emailBody: string,
  campaignLeadId: string,
  baseUrl: string
): string {
  const trackingId = generateTrackingId(campaignLeadId);
  
  // First add link tracking
  let trackedEmail = addLinkTracking(emailBody, trackingId, baseUrl);
  
  // Then add tracking pixel
  trackedEmail = addTrackingPixel(trackedEmail, trackingId, baseUrl);
  
  return trackedEmail;
}

/**
 * Convert plain text email to HTML (for tracking pixel support)
 */
export function convertToHtml(plainText: string): string {
  // Convert line breaks to <br> tags
  const html = plainText
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
  
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <p>${html}</p>
</body>
</html>`;
}
