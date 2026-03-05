import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import GenerateButton from './GenerateButton';
import SendButton from './SendButton';

export default async function FollowUpsPage() {
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

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth');

  // Fetch follow-ups
  const { data: followUps } = await supabase
    .from('follow_ups')
    .select(`
      id,
      subject,
      scheduled_for,
      sent_at,
      status,
      ab_variant,
      engagement_score,
      leads(name, company, email),
      campaigns(name)
    `)
    .eq('campaigns.user_id', user.id)
    .order('scheduled_for', { ascending: true });

  // Get stats
  const scheduled = followUps?.filter(f => f.status === 'scheduled').length || 0;
  const sent = followUps?.filter(f => f.status === 'sent').length || 0;
  const failed = followUps?.filter(f => f.status === 'failed').length || 0;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">📧 Follow-ups</h1>
            <p className="text-gray-600 mt-1">
              AI-generated follow-ups for warm leads
            </p>
          </div>
          <Link
            href="/dashboard"
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
          >
            ← Back to Dashboard
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-blue-600">{scheduled}</div>
            <div className="text-sm text-gray-600">Scheduled</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-green-600">{sent}</div>
            <div className="text-sm text-gray-600">Sent</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-red-600">{failed}</div>
            <div className="text-sm text-gray-600">Failed</div>
          </div>
        </div>

        {/* Follow-ups Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {!followUps || followUps.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <p className="text-lg mb-2">No follow-ups yet</p>
              <p className="text-sm">
                Follow-ups are automatically generated for warm leads based on engagement
              </p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Lead
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Campaign
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Subject
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Score
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    A/B
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Scheduled For
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {followUps.map((followUp) => {
                  const lead = followUp.leads as any;
                  const campaign = followUp.campaigns as any;
                  
                  return (
                    <tr key={followUp.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900">{lead?.name}</div>
                        {lead?.company && (
                          <div className="text-sm text-gray-500">{lead.company}</div>
                        )}
                        <div className="text-sm text-gray-500">{lead?.email}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {campaign?.name}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {followUp.subject}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-semibold text-blue-600">
                          {followUp.engagement_score}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 text-xs font-semibold rounded bg-purple-100 text-purple-800">
                          {followUp.ab_variant}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {followUp.status === 'sent' && followUp.sent_at ? (
                          <>
                            <div>Sent</div>
                            <div className="text-xs text-gray-500">
                              {new Date(followUp.sent_at).toLocaleDateString()}
                            </div>
                          </>
                        ) : (
                          <>
                            <div>{new Date(followUp.scheduled_for).toLocaleDateString()}</div>
                            <div className="text-xs text-gray-500">
                              {new Date(followUp.scheduled_for).toLocaleTimeString()}
                            </div>
                          </>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            followUp.status === 'scheduled'
                              ? 'bg-blue-100 text-blue-800'
                              : followUp.status === 'sent'
                              ? 'bg-green-100 text-green-800'
                              : followUp.status === 'failed'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {followUp.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Actions */}
        <div className="mt-6 grid grid-cols-2 gap-4">
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-blue-900">Generate Follow-ups</div>
                <div className="text-sm text-blue-700 mt-1">
                  Scan all campaigns and create AI follow-ups for warm leads
                </div>
              </div>
              <GenerateButton />
            </div>
          </div>

          <div className="p-4 bg-green-50 rounded-lg border border-green-200">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-green-900">Send Ready Follow-ups</div>
                <div className="text-sm text-green-700 mt-1">
                  Send all follow-ups that are scheduled for now or earlier
                </div>
              </div>
              <SendButton />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
