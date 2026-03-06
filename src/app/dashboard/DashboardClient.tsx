'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import MonthlyTabs from './MonthlyTabs';
import CRMTable from './CRMTable';
import ConfigButton from './ConfigButton';

interface Lead {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  notes: string | null;
  stage: string;
  value: number;
  lead_source: string | null;
  last_contact: string | null;
  offers: string | null;
  timer_type: string;
  timer_end_date: string | null;
  auto_email_frequency: string;
  auto_text_frequency: string;
  email_template_id: string | null;
  text_template_id: string | null;
  last_email_sent: string | null;
  last_text_sent: string | null;
  month_key: string;
}

interface MonthData {
  monthKey: string;
  customName: string;
}

interface Stage {
  value: string;
  color: string;
}

interface Stat {
  key: string;
  label: string;
  color: string;
  stage?: string;
  stages?: string[];
  format?: string;
  type?: string;
  numeratorStage?: string;
  numeratorStages?: string[];
  denominatorStage?: string;
  denominatorStages?: string[];
}

interface Column {
  field: string;
  label: string;
  width: number;
  visible: boolean;
  expandable?: boolean;
}

interface Template {
  id: string;
  type: string;
  name: string;
  subject?: string;
  body: string;
}

interface Frequency {
  id: string;
  name: string;
  days_interval: number;
  bg_color: string;
  text_color: string;
  type: string;
}

interface DashboardClientProps {
  allLeads: Lead[];
  availableMonths: MonthData[];
  initialMonth: string;
  currentMonthName: string;
  stages: Stage[];
  stats: Stat[];
  columns: Column[];
  emailTemplates: Template[];
  textTemplates: Template[];
  emailFrequencies: Frequency[];
  textFrequencies: Frequency[];
}

export default function DashboardClient({ allLeads, availableMonths, initialMonth, currentMonthName, stages, stats, columns, emailTemplates, textTemplates, emailFrequencies, textFrequencies }: DashboardClientProps) {
  const [currentMonth, setCurrentMonth] = useState(initialMonth);
  const [leads, setLeads] = useState(allLeads);
  const router = useRouter();
  
  // Sync leads when allLeads prop changes (after router.refresh)
  useEffect(() => {
    setLeads(allLeads);
  }, [allLeads]);
  
  // When month changes, refresh to load that month's configuration
  const handleMonthChange = (monthKey: string) => {
    setCurrentMonth(monthKey);
    router.refresh();
  };
  
  // Get the current month's custom name
  const displayName = availableMonths.find(m => m.monthKey === currentMonth)?.customName || currentMonthName;

  const filteredLeads = leads.filter(lead => lead.month_key === currentMonth);

  // Calculate stats dynamically based on configuration
  const calculateStatValue = (stat: Stat) => {
    // Determine which leads to use based on stage filter
    let leadsToCount = filteredLeads;
    
    // Check for multi-stage filter (new feature)
    if (stat.stages && stat.stages.length > 0) {
      leadsToCount = filteredLeads.filter(l => stat.stages!.includes(l.stage));
    } else if (stat.stage) {
      // Single stage filter (legacy)
      leadsToCount = filteredLeads.filter(l => l.stage === stat.stage);
    }

    // Handle percentage type
    if (stat.type === 'percentage') {
      let numerator = 0;
      let denominator = 0;
      
      // Calculate numerator (support multi-stage or single stage)
      if (stat.numeratorStages && stat.numeratorStages.length > 0) {
        numerator = filteredLeads.filter(l => stat.numeratorStages!.includes(l.stage)).length;
      } else if (stat.numeratorStage) {
        numerator = filteredLeads.filter(l => l.stage === stat.numeratorStage).length;
      }
      
      // Calculate denominator (support multi-stage or single stage or all leads)
      if (stat.denominatorStages && stat.denominatorStages.length > 0) {
        denominator = filteredLeads.filter(l => stat.denominatorStages!.includes(l.stage)).length;
      } else if (stat.denominatorStage) {
        denominator = filteredLeads.filter(l => l.stage === stat.denominatorStage).length;
      } else {
        denominator = filteredLeads.length;
      }
      
      if (denominator === 0) return 0;
      return Math.round((numerator / denominator) * 100);
    }

    // Handle currency format (sum values)
    if (stat.format === 'currency') {
      return leadsToCount.reduce((sum, l) => sum + (l.value || 0), 0);
    }

    // Legacy key-based stats
    if (stat.key === 'activeLeads') {
      return leadsToCount.length;
    }
    if (stat.key === 'totalValue') {
      return leadsToCount.reduce((sum, l) => sum + (l.value || 0), 0);
    }
    if (stat.key === 'activeTimers') {
      return leadsToCount.filter(l => l.timer_type !== 'No Timer' && l.timer_end_date).length;
    }
    
    // Count type returns the count of filtered leads
    return leadsToCount.length;
  };

  const formatStatValue = (value: number, stat: Stat) => {
    if (stat.type === 'percentage') {
      return `${value}%`;
    }
    if (stat.format === 'currency') {
      return `$${value.toLocaleString()}`;
    }
    return value.toLocaleString();
  };

  return (
    <div className="max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="mb-4 flex justify-between items-center">
        <h1 className="text-3xl font-bold text-[#1a1a1a] tracking-tight">
          {displayName}
        </h1>
        <ConfigButton stages={stages} stats={stats} columns={columns} emailTemplates={emailTemplates} textTemplates={textTemplates} emailFrequencies={emailFrequencies} textFrequencies={textFrequencies} monthKey={currentMonth} />
      </div>

      {/* Monthly Tabs */}
      <MonthlyTabs 
        availableMonths={availableMonths}
        currentMonth={currentMonth}
        onMonthChange={handleMonthChange}
      />

      {/* Quick Stats - Dynamic based on configuration */}
      <div className={`grid gap-3 mb-4 sticky z-40 bg-[#fafafa] pt-4 pb-4 -mx-12 px-12`} style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))`, top: '64px' }}>
        {stats.map((stat, index) => {
          const value = calculateStatValue(stat);
          // Extract color for inline style
          const colorMatch = stat.color.match(/text-\[([^\]]+)\]/);
          const textColor = colorMatch ? colorMatch[1] : '#1a1a1a';
          
          return (
            <div key={index} className="bg-white border border-[#e5e5e5] rounded-md p-3">
              <div className="text-xs text-[#6b6b6b] uppercase tracking-wider mb-1">{stat.label}</div>
              <div className="text-2xl font-bold" style={{ color: textColor }}>
                {formatStatValue(value, stat)}
              </div>
            </div>
          );
        })}
      </div>

      {/* CRM Table */}
      <CRMTable 
        leads={filteredLeads} 
        monthKey={currentMonth} 
        stages={stages} 
        columns={columns} 
        emailTemplates={emailTemplates} 
        textTemplates={textTemplates} 
        emailFrequencies={emailFrequencies} 
        textFrequencies={textFrequencies}
        onLeadUpdate={(leadId, updates) => {
          setLeads(prev => prev.map(lead => 
            lead.id === leadId ? { ...lead, ...updates } : lead
          ));
        }}
        onLeadCreate={(lead) => {
          setLeads(prev => [lead, ...prev]);
        }}
      />
    </div>
  );
}
