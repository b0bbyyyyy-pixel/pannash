import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import DetectHotButton from './DetectHotButton';

export default async function HotLeadsPage() {
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

  // Fetch hot leads
  const { data: hotLeads } = await supabase
    .from('hot_leads')
    .select(`
      id,
      engagement_score,
      reasoning,
      status,
      created_at,
      leads(name, company, email, phone),
      campaigns(name, subject)
    `)
    .eq('campaigns.user_id', user.id)
    .order('engagement_score', { ascending: false });

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">🔥 Hot Leads</h1>
            <p className="text-gray-600 mt-1">
              Leads showing strong engagement signals
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
            <div className="text-2xl font-bold text-orange-600">
              {hotLeads?.filter(l => l.status === 'new').length || 0}
            </div>
            <div className="text-sm text-gray-600">New Hot Leads</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-blue-600">
              {hotLeads?.filter(l => l.status === 'contacted').length || 0}
            </div>
            <div className="text-sm text-gray-600">Contacted</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-green-600">
              {hotLeads?.filter(l => l.status === 'converted').length || 0}
            </div>
            <div className="text-sm text-gray-600">Converted</div>
          </div>
        </div>

        {/* Hot Leads Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {!hotLeads || hotLeads.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <p className="text-lg mb-2">No hot leads yet</p>
              <p className="text-sm">
                Hot leads will appear here when contacts show strong engagement
                (opens, clicks, or replies)
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
                    Score
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Reasoning
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Detected
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {hotLeads.map((hotLead) => {
                  const lead = hotLead.leads as any;
                  const campaign = hotLead.campaigns as any;
                  
                  return (
                    <tr key={hotLead.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900">{lead?.name}</div>
                        {lead?.company && (
                          <div className="text-sm text-gray-500">{lead.company}</div>
                        )}
                        <div className="text-sm text-gray-500">{lead?.email}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">{campaign?.name}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <div className="text-2xl font-bold text-orange-600">
                            {hotLead.engagement_score}
                          </div>
                          <div className="text-xs text-gray-500 ml-1">/100</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {hotLead.reasoning}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            hotLead.status === 'new'
                              ? 'bg-orange-100 text-orange-800'
                              : hotLead.status === 'contacted'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-green-100 text-green-800'
                          }`}
                        >
                          {hotLead.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {new Date(hotLead.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Detection Button */}
        <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-blue-900">Manual Detection</div>
              <div className="text-sm text-blue-700 mt-1">
                Check all active campaigns for hot leads based on engagement
              </div>
            </div>
            <DetectHotButton />
          </div>
        </div>
      </div>
    </div>
  );
}
