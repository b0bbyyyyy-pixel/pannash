import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

interface EngagementStatsProps {
  campaignLeadId: string;
}

export default async function EngagementStats({ campaignLeadId }: EngagementStatsProps) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    }
  );

  // Fetch engagement events for this campaign lead
  const { data: events } = await supabase
    .from('email_events')
    .select('event_type, created_at')
    .eq('campaign_lead_id', campaignLeadId)
    .order('created_at', { ascending: false });

  if (!events || events.length === 0) {
    return (
      <div className="text-xs text-gray-400 mt-1">
        No engagement yet
      </div>
    );
  }

  const opens = events.filter((e) => e.event_type === 'opened').length;
  const clicks = events.filter((e) => e.event_type === 'clicked').length;
  const replies = events.filter((e) => e.event_type === 'replied').length;

  return (
    <div className="flex items-center gap-2 mt-1 text-xs">
      {opens > 0 && (
        <span className="text-blue-600" title="Opens">
          👁️ {opens}
        </span>
      )}
      {clicks > 0 && (
        <span className="text-green-600" title="Clicks">
          🖱️ {clicks}
        </span>
      )}
      {replies > 0 && (
        <span className="text-orange-600 font-semibold" title="Replies">
          💬 {replies}
        </span>
      )}
    </div>
  );
}
