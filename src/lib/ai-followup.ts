/**
 * AI utilities for follow-up generation and sentiment analysis
 */

import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface EngagementData {
  opens: number;
  clicks: number;
  replies: number;
  lastActivityAt?: string;
}

export interface FollowUpContext {
  leadName: string;
  leadCompany?: string;
  initialEmail: string;
  engagement: EngagementData;
  previousFollowUps?: string[];
}

/**
 * Analyze engagement level and detect if lead is "hot"
 */
export async function analyzeEngagement(engagement: EngagementData): Promise<{
  score: number; // 0-100
  isHot: boolean;
  reasoning: string;
}> {
  const { opens, clicks, replies } = engagement;

  // Simple scoring logic (can be enhanced with AI later)
  let score = 0;
  
  // Opens: 5 points each, max 30
  score += Math.min(opens * 5, 30);
  
  // Clicks: 15 points each, max 45
  score += Math.min(clicks * 15, 45);
  
  // Replies: 25 points, instant hot
  score += replies * 25;

  const isHot = score >= 50 || replies > 0;

  let reasoning = '';
  if (replies > 0) {
    reasoning = `Lead replied to the email${replies > 1 ? ` ${replies} times` : ''}`;
  } else if (clicks > 0) {
    reasoning = `Lead clicked ${clicks} link${clicks > 1 ? 's' : ''} and opened ${opens} time${opens > 1 ? 's' : ''}`;
  } else if (opens >= 3) {
    reasoning = `Lead opened email ${opens} times (high interest)`;
  } else if (opens > 0) {
    reasoning = `Lead opened email ${opens} time${opens > 1 ? 's' : ''}`;
  } else {
    reasoning = 'No engagement yet';
  }

  return { score, isHot, reasoning };
}

/**
 * Generate a gentle, context-aware follow-up email using AI
 */
export async function generateFollowUp(context: FollowUpContext): Promise<{
  subject: string;
  body: string;
}> {
  try {
    const { leadName, leadCompany, initialEmail, engagement, previousFollowUps } = context;

    const systemPrompt = `You are a sales outreach assistant. Generate a gentle, non-pushy follow-up email.

Guidelines:
- Be respectful and concise (3-4 sentences max)
- Reference the initial email naturally
- Add value or offer help
- Include a soft call-to-action
- Never be aggressive or desperate
- Match the tone of the initial email
- Do NOT include signature lines or sender names (user will add those)`;

    const userPrompt = `Generate a follow-up email for ${leadName}${leadCompany ? ` at ${leadCompany}` : ''}.

Initial email sent:
"""
${initialEmail}
"""

Engagement:
- Opens: ${engagement.opens}
- Clicks: ${engagement.clicks}
- Replies: ${engagement.replies}
${engagement.lastActivityAt ? `- Last activity: ${new Date(engagement.lastActivityAt).toLocaleDateString()}` : ''}

${previousFollowUps && previousFollowUps.length > 0 ? `Previous follow-ups sent:\n${previousFollowUps.map((f, i) => `${i + 1}. ${f}`).join('\n')}` : 'This is the first follow-up.'}

Return JSON with "subject" and "body" fields.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Cost-effective for this task
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });

    const response = JSON.parse(completion.choices[0].message.content || '{}');
    
    return {
      subject: response.subject || `Re: Follow-up`,
      body: response.body || `Hi ${leadName},\n\nJust wanted to check in and see if you had any questions.\n\nBest regards`,
    };
  } catch (err: any) {
    console.error('AI follow-up generation error:', err);
    
    // Fallback generic follow-up
    return {
      subject: `Quick follow-up`,
      body: `Hi ${context.leadName},\n\nI wanted to follow up on my previous email. Would you be interested in learning more?\n\nLet me know if you have any questions.`,
    };
  }
}

/**
 * Analyze reply sentiment (positive, neutral, negative)
 */
export async function analyzeReplySentiment(replyText: string): Promise<{
  sentiment: 'positive' | 'neutral' | 'negative';
  confidence: number; // 0-1
  summary: string;
}> {
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Analyze the sentiment of this email reply. Return JSON with "sentiment" (positive/neutral/negative), "confidence" (0-1), and "summary" (brief explanation).',
        },
        { role: 'user', content: replyText },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const response = JSON.parse(completion.choices[0].message.content || '{}');
    
    return {
      sentiment: response.sentiment || 'neutral',
      confidence: response.confidence || 0.5,
      summary: response.summary || 'Unable to analyze sentiment',
    };
  } catch (err: any) {
    console.error('Sentiment analysis error:', err);
    
    return {
      sentiment: 'neutral',
      confidence: 0,
      summary: 'Analysis failed',
    };
  }
}
