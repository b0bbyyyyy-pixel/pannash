'use client';

import { useState, useEffect, useRef } from 'react';
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
  timer_color: string | null;
  auto_email_frequency: string;
  auto_text_frequency: string;
  email_template_id: string | null;
  text_template_id: string | null;
  last_email_sent: string | null;
  last_text_sent: string | null;
  scheduled_text_content: string | null;
  scheduled_text_time: string | null;
  scheduled_text_frequency: string | null;
  last_scheduled_text_sent: string | null;
  scheduled_email_template_id: string | null;
  scheduled_email_time: string | null;
  scheduled_email_frequency: string | null;
  last_scheduled_email_sent: string | null;
  month_key: string;
  max_added_points?: number;
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
  allowAttachments?: boolean;
  showPhoneLocation?: boolean;
  isTimer?: boolean;
  isStage?: boolean;
  truncateText?: boolean;
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
  const [currentStages, setCurrentStages] = useState(stages);
  const [currentStats, setCurrentStats] = useState(stats);
  const [currentColumns, setCurrentColumns] = useState(columns);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [highlightLeadId, setHighlightLeadId] = useState<string | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  // Keep a stable copy of ALL leads (across all tabs) just for search — never filtered by month
  const allLeadsRef = useRef<typeof allLeads>(allLeads);
  const router = useRouter();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  
  // Sync leads when allLeads prop changes (after router.refresh)
  useEffect(() => {
    setLeads(allLeads);
    // Keep the search pool up to date too, but MERGE so we never lose other-tab leads
    // between refreshes triggered by month switches
    allLeadsRef.current = allLeads;
  }, [allLeads]);
  
  // Sync stages, stats, and columns when props change (after router.refresh)
  useEffect(() => {
    setCurrentStages(stages);
  }, [stages]);
  
  useEffect(() => {
    setCurrentStats(stats);
  }, [stats]);
  
  useEffect(() => {
    setCurrentColumns(columns);
  }, [columns]);

  // Re-fetch from the server when this browser tab becomes visible again (fixes stale
  // lead stages/config until a manual refresh, e.g. after edits in another window)
  useEffect(() => {
    let hiddenAt: number | null = null;
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        return;
      }
      if (document.visibilityState === 'visible' && hiddenAt != null) {
        if (Date.now() - hiddenAt > 300) {
          router.refresh();
        }
        hiddenAt = null;
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [router]);
  
  // When month changes, update URL and refresh to load that month's configuration
  const handleMonthChange = (monthKey: string) => {
    setCurrentMonth(monthKey);
    const url = `/dashboard?month=${encodeURIComponent(monthKey)}`;
    window.history.pushState({}, '', url);
    router.refresh();
  };
  
  // Get the current month's custom name
  const displayName = availableMonths.find(m => m.monthKey === currentMonth)?.customName || currentMonthName;

  const q = searchQuery.trim().toLowerCase();
  const filteredLeads = leads.filter(lead => lead.month_key === currentMonth);

  // Typeahead results — always search across ALL leads from ALL tabs
  // Only match name/company/email/phone so notes false-positives don't bury the real result
  const searchResults = (() => {
    if (q.length < 1) return [];
    const qDigits = q.replace(/\D/g, '');
    const all = allLeadsRef.current;
    const nameMatches: typeof all = [];
    const companyMatches: typeof all = [];
    const contactMatches: typeof all = [];
    for (const lead of all) {
      const name = (lead.name ?? '').toLowerCase();
      const company = (lead.company ?? '').toLowerCase().replace(/\*\*/g, '');
      const email = (lead.email ?? '').toLowerCase();
      const phone = (lead.phone ?? '').replace(/\D/g, '');
      if (name.includes(q)) { nameMatches.push(lead); continue; }
      if (company.includes(q)) { companyMatches.push(lead); continue; }
      if (email.includes(q) || (qDigits.length >= 3 && phone.includes(qDigits))) {
        contactMatches.push(lead);
      }
    }
    return [...nameMatches, ...companyMatches, ...contactMatches].slice(0, 10);
  })();

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
    <div className="w-full">
      {/* Header */}
      <div className="mb-4 flex justify-between items-center">
        <h1 className="text-3xl font-bold text-[#1a1a1a] tracking-tight">
          {displayName}
        </h1>
        <div className="flex items-center gap-2">
          {/* Typeahead search */}
          <div className="relative" ref={searchRef}>
            <svg
              className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9b9b9b] pointer-events-none"
              fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
            >
              <circle cx="11" cy="11" r="8" />
              <path strokeLinecap="round" d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setSearchOpen(true); }}
              onFocus={() => { if (searchQuery) setSearchOpen(true); }}
              placeholder="Search"
              className="w-44 pl-7 pr-6 py-1.5 text-xs border border-[#e5e5e5] rounded-md bg-white text-[#1a1a1a] placeholder-[#9b9b9b] focus:outline-none focus:ring-2 focus:ring-[#5a7fc7] focus:border-transparent"
            />
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(''); setSearchOpen(false); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[#9b9b9b] hover:text-[#1a1a1a] text-xs leading-none"
                aria-label="Clear search"
              >✕</button>
            )}
            {/* Dropdown */}
            {searchOpen && searchResults.length > 0 && (
              <div className="absolute right-0 top-full mt-1 w-80 bg-white border border-[#e5e5e5] rounded-md shadow-lg z-50 overflow-hidden">
                {searchResults.map(lead => {
                  const tab = availableMonths.find(m => m.monthKey === lead.month_key)?.customName ?? lead.month_key;
                  return (
                    <button
                      key={lead.id}
                      className="w-full text-left px-3 py-2.5 hover:bg-[#f5f5f5] border-b border-[#f0f0f0] last:border-0 transition-colors"
                      onClick={() => {
                        setSearchOpen(false);
                        setSearchQuery('');
                        const targetMonth = lead.month_key;
                        const targetId = lead.id;
                        // Switch to that lead's tab
                        setCurrentMonth(targetMonth);
                        const url = `/dashboard?month=${encodeURIComponent(targetMonth)}`;
                        window.history.pushState({}, '', url);
                        // If navigating to a different month, refresh config; otherwise just scroll
                        if (targetMonth !== currentMonth) {
                          router.refresh();
                        }
                        // Highlight and scroll — give the table time to render
                        setHighlightLeadId(targetId);
                        setTimeout(() => {
                          const el = document.getElementById(`lead-row-${targetId}`);
                          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          setTimeout(() => setHighlightLeadId(null), 2500);
                        }, 200);
                      }}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-[#1a1a1a] truncate">{lead.company || '—'}</p>
                          <p className="text-xs text-[#6b6b6b] truncate">{lead.name}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[10px] text-[#5a7fc7] font-medium">{tab}</p>
                          <p className="text-[10px] text-[#9b9b9b] truncate max-w-[100px]">{lead.stage}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            {searchOpen && q.length > 0 && searchResults.length === 0 && (
              <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-[#e5e5e5] rounded-md shadow-lg z-50 px-3 py-2.5 text-xs text-[#9b9b9b]">
                No leads found
              </div>
            )}
          </div>
          <ConfigButton stages={currentStages} stats={currentStats} columns={currentColumns} emailTemplates={emailTemplates} textTemplates={textTemplates} emailFrequencies={emailFrequencies} textFrequencies={textFrequencies} monthKey={currentMonth} />
        </div>
      </div>

      {/* Monthly Tabs */}
      <MonthlyTabs 
        availableMonths={availableMonths}
        currentMonth={currentMonth}
        onMonthChange={handleMonthChange}
      />


      {/* Quick Stats - Dynamic based on configuration */}
      <div className={`grid gap-3 mb-4 sticky z-40 bg-[#fafafa] pt-4 pb-4 -mx-6 px-6`} style={{ gridTemplateColumns: `repeat(${currentStats.length}, minmax(0, 1fr))`, top: '64px' }}>
        {currentStats.map((stat, index) => {
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
        stages={currentStages} 
        columns={currentColumns} 
        emailTemplates={emailTemplates} 
        textTemplates={textTemplates} 
        emailFrequencies={emailFrequencies} 
        textFrequencies={textFrequencies}
        availableMonths={availableMonths}
        highlightLeadId={highlightLeadId}
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
