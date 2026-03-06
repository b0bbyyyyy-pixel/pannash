import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Navbar from '@/components/Navbar';
import DashboardClient from './DashboardClient';

export default async function DashboardPage() {
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

  // Fetch all leads for the user with CRM fields
  const { data: leads, error } = await supabase
    .from('leads')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching leads:', error);
  }

  // Fetch monthly dashboards with custom names (oldest first, so new tabs appear on the right)
  const { data: monthlyDashboards, error: dashboardError } = await supabase
    .from('monthly_dashboards')
    .select('*')
    .eq('user_id', user.id)
    .order('display_order', { ascending: true });

  if (dashboardError) {
    console.error('Error fetching monthly dashboards:', dashboardError);
  }

  // If no monthly dashboards exist, create a default one
  let availableMonths = monthlyDashboards?.map(m => ({
    monthKey: m.month_key,
    customName: m.custom_name,
  })) || [];

  // If user has no monthly dashboards, create a default one
  if (availableMonths.length === 0) {
    const defaultMonthKey = new Date().toISOString().slice(0, 16).replace('T', '_').replace(/:/g, '-');
    const defaultName = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    
    const { data: newDashboard, error: insertError } = await supabase
      .from('monthly_dashboards')
      .insert({
        user_id: user.id,
        month_key: defaultMonthKey,
        custom_name: defaultName,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating default dashboard:', insertError);
      console.error('Insert error details:', JSON.stringify(insertError, null, 2));
    } else if (newDashboard) {
      availableMonths = [{
        monthKey: newDashboard.month_key,
        customName: newDashboard.custom_name,
      }];
    }
  }

  // Fetch dashboard configuration (stages, stats, columns)
  const { data: stagesConfig } = await supabase
    .from('dashboard_config')
    .select('config_data')
    .eq('user_id', user.id)
    .eq('config_type', 'stages')
    .single();

  const { data: statsConfig } = await supabase
    .from('dashboard_config')
    .select('config_data')
    .eq('user_id', user.id)
    .eq('config_type', 'stats')
    .single();

  const { data: columnsConfig } = await supabase
    .from('dashboard_config')
    .select('config_data')
    .eq('user_id', user.id)
    .eq('config_type', 'columns')
    .single();

  // Default stages if not configured
  const stages = stagesConfig?.config_data || [
    { value: 'Killed In Final', color: 'bg-[#e5e5e5] text-[#4a4a4a]' },
    { value: 'All Declined/Final', color: 'bg-[#d5e5f0] text-[#2a4a5a]' },
    { value: 'Offers/Follow up', color: 'bg-[#e5d5e8] text-[#4a3a5a]' },
    { value: 'Proposal Sent', color: 'bg-[#f0d5a8] text-[#6b4a2a]' },
    { value: 'Contracts Out', color: 'bg-[#f0c5c5] text-[#8a2a2a]' },
  ];

  // Default stats if not configured
  const stats = statsConfig?.config_data || [
    { key: 'activeLeads', label: 'Active Leads', color: 'text-[#1a1a1a]' },
    { key: 'contractsOut', label: 'Contracts Out', color: 'text-[#8a2a2a]', stage: 'Contracts Out' },
    { key: 'proposalsOut', label: 'Proposals Out', color: 'text-[#d17a3f]', stage: 'Proposal Sent' },
    { key: 'totalValue', label: 'Total Value', color: 'text-[#1a1a1a]', format: 'currency' },
    { key: 'activeTimers', label: 'Active Timers', color: 'text-[#5a7fc7]' },
  ];

  // Default columns if not configured
  const columns = columnsConfig?.config_data || [
    { field: 'timer', label: 'Timer', width: 120, visible: true },
    { field: 'company', label: 'Opportunity', width: 150, visible: true },
    { field: 'name', label: 'Name', width: 150, visible: true },
    { field: 'stage', label: 'Stage', width: 160, visible: true },
    { field: 'value', label: 'Value', width: 100, visible: true },
    { field: 'email', label: 'E-Mail', width: 180, visible: true },
    { field: 'phone', label: 'Phone', width: 120, visible: true },
    { field: 'lead_source', label: 'Lead Source', width: 120, visible: true },
    { field: 'last_contact', label: 'Last Contact', width: 120, visible: true },
    { field: 'notes', label: 'Notes', width: 150, visible: true },
    { field: 'offers', label: 'Offers', width: 150, visible: true },
    { field: 'auto_email_frequency', label: 'Auto Email', width: 140, visible: true },
    { field: 'auto_text_frequency', label: 'Auto Text', width: 140, visible: true },
  ];

  // Fetch templates (with error handling for if table doesn't exist yet)
  let emailTemplates: any[] = [];
  let textTemplates: any[] = [];
  
  try {
    const { data: templates, error: templatesError } = await supabase
      .from('message_templates')
      .select('*')
      .eq('user_id', user.id)
      .order('name', { ascending: true });

    if (!templatesError && templates) {
      emailTemplates = templates.filter(t => t.type === 'email');
      textTemplates = templates.filter(t => t.type === 'text');
    }
  } catch (error) {
    console.log('Templates table not yet created, using empty arrays');
    emailTemplates = [];
    textTemplates = [];
  }

  // Fetch auto frequencies (with error handling)
  let emailFrequencies: any[] = [];
  let textFrequencies: any[] = [];
  
  try {
    const { data: frequencies, error: freqError } = await supabase
      .from('auto_frequencies')
      .select('*')
      .eq('user_id', user.id)
      .order('days_interval', { ascending: true });

    if (!freqError && frequencies) {
      emailFrequencies = frequencies.filter(f => f.type === 'email' || f.type === 'both');
      textFrequencies = frequencies.filter(f => f.type === 'text' || f.type === 'both');
    }
  } catch (error) {
    console.log('Frequencies table not yet created, using defaults');
    // Default frequencies
    const defaults = [
      { id: 'off', name: 'Off', days_interval: 0, bg_color: '#f5f5f5', text_color: '#999999', type: 'both' },
      { id: 'daily', name: 'Everyday', days_interval: 1, bg_color: '#d5f0d5', text_color: '#2a5a2a', type: 'both' },
      { id: 'every2', name: 'Every Other Day', days_interval: 2, bg_color: '#d5e8f0', text_color: '#2a3a5a', type: 'both' },
      { id: 'every30', name: 'Every 30 Days', days_interval: 30, bg_color: '#e5d5e8', text_color: '#4a3a5a', type: 'both' },
    ];
    emailFrequencies = defaults;
    textFrequencies = defaults;
  }

  // Default to the most recently created tab (last in array since we sort by ascending)
  const currentMonth = availableMonths[availableMonths.length - 1]?.monthKey || '';
  const currentMonthName = availableMonths[availableMonths.length - 1]?.customName || 'Monthly Working Leads';

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <Navbar userName={user.email?.split('@')[0] || 'User'} />
      
      <main className="px-12 pt-24 pb-12">
        <DashboardClient 
          allLeads={leads || []}
          availableMonths={availableMonths}
          initialMonth={currentMonth}
          currentMonthName={currentMonthName}
          stages={stages}
          stats={stats}
          columns={columns}
          emailTemplates={emailTemplates}
          textTemplates={textTemplates}
          emailFrequencies={emailFrequencies}
          textFrequencies={textFrequencies}
        />
      </main>
    </div>
  );
}
