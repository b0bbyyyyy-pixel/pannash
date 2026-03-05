'use client';

import { useState } from 'react';
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
  format?: string;
  type?: string;
  numeratorStage?: string;
  denominatorStage?: string;
}

interface Column {
  field: string;
  label: string;
  width: number;
  visible: boolean;
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
  
  // Get the current month's custom name
  const displayName = availableMonths.find(m => m.monthKey === currentMonth)?.customName || currentMonthName;

  const filteredLeads = allLeads.filter(lead => lead.month_key === currentMonth);

  // Calculate stats dynamically based on configuration
  const calculateStatValue = (stat: Stat) => {
    // Handle percentage type
    if (stat.type === 'percentage') {
      const numerator = stat.numeratorStage 
        ? filteredLeads.filter(l => l.stage === stat.numeratorStage).length
        : 0;
      
      const denominator = stat.denominatorStage
        ? filteredLeads.filter(l => l.stage === stat.denominatorStage).length
        : filteredLeads.length; // All leads if no denominator stage
      
      if (denominator === 0) return 0;
      return Math.round((numerator / denominator) * 100);
    }

    // Legacy key-based stats
    if (stat.key === 'activeLeads') {
      return filteredLeads.length;
    }
    if (stat.key === 'totalValue') {
      return filteredLeads.reduce((sum, l) => sum + (l.value || 0), 0);
    }
    if (stat.key === 'activeTimers') {
      return filteredLeads.filter(l => l.timer_type !== 'No Timer' && l.timer_end_date).length;
    }
    
    // Count type with stage filter
    if (stat.stage) {
      return filteredLeads.filter(l => l.stage === stat.stage).length;
    }
    
    return 0;
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
        <ConfigButton stages={stages} stats={stats} columns={columns} emailTemplates={emailTemplates} textTemplates={textTemplates} emailFrequencies={emailFrequencies} textFrequencies={textFrequencies} />
      </div>

      {/* Monthly Tabs */}
      <MonthlyTabs 
        availableMonths={availableMonths}
        currentMonth={currentMonth}
        onMonthChange={setCurrentMonth}
      />

      {/* Quick Stats - Dynamic based on configuration */}
      <div className={`grid gap-3 mb-4`} style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}>
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
      <CRMTable leads={filteredLeads} monthKey={currentMonth} stages={stages} columns={columns} emailTemplates={emailTemplates} textTemplates={textTemplates} emailFrequencies={emailFrequencies} textFrequencies={textFrequencies} />
    </div>
  );
}
