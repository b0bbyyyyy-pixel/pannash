'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getPhoneLocation, PhoneLocationInfo } from '@/lib/phoneLocation';
import dynamic from 'next/dynamic';

const UnderwritingSuite = dynamic(() => import('@/components/UnderwritingSuite'), { ssr: false });

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
  underwriting_data?: any;
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
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
}

interface Stage {
  value: string;
  color: string;
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

interface Attachment {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  file_type: string;
  created_at: string;
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

interface MonthData {
  monthKey: string;
  customName: string;
}

interface CRMTableProps {
  leads: Lead[];
  monthKey: string;
  stages: Stage[];
  columns: Column[];
  emailTemplates: Template[];
  textTemplates: Template[];
  emailFrequencies: Frequency[];
  textFrequencies: Frequency[];
  availableMonths: MonthData[];
  onLeadUpdate: (leadId: string, updates: Partial<Lead>) => void;
  onLeadCreate: (lead: Lead) => void;
}

export default function CRMTable({ leads: initialLeads, monthKey, stages, columns, emailTemplates, textTemplates, emailFrequencies, textFrequencies, availableMonths, onLeadUpdate, onLeadCreate }: CRMTableProps) {
  const [leads, setLeads] = useState(initialLeads);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  // Sync local state when initialLeads prop changes (after router.refresh)
  useEffect(() => {
    setLeads(initialLeads);
  }, [initialLeads]);

  const [editField, setEditField] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTimerId, setEditingTimerId] = useState<string | null>(null);
  const [showTimerSetupModal, setShowTimerSetupModal] = useState<string | null>(null);
  const [tempTimerType, setTempTimerType] = useState('No Timer');
  const [showTimerColorModal, setShowTimerColorModal] = useState<string | null>(null);
  const [newLead, setNewLead] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
  });
  const [showEmailModal, setShowEmailModal] = useState<string | null>(null);
  const [showTextModal, setShowTextModal] = useState<string | null>(null);
  const [autoCountdowns, setAutoCountdowns] = useState<{ [key: string]: { email: string, text: string } }>({});
  const [hoveredPhone, setHoveredPhone] = useState<string | null>(null);
  const [phoneLocationData, setPhoneLocationData] = useState<{ [key: string]: PhoneLocationInfo | null }>({});
  const [userTimezone, setUserTimezone] = useState<string>('America/New_York');
  const [showCustomTimerModal, setShowCustomTimerModal] = useState<string | null>(null);
  const [customTimerDate, setCustomTimerDate] = useState('');
  const [customTimerTime, setCustomTimerTime] = useState('23:59');
  const [selectedTimerColor, setSelectedTimerColor] = useState('#ff0000');
  const [showDisplayDateModal, setShowDisplayDateModal] = useState<string | null>(null);
  const [displayDate, setDisplayDate] = useState('');
  const [showExpandedTextModal, setShowExpandedTextModal] = useState<{ leadId: string; field: string; value: string; label: string } | null>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [showContactHistoryModal, setShowContactHistoryModal] = useState<{ leadId: string; leadName: string } | null>(null);
  const [contactHistory, setContactHistory] = useState<any[]>([]);
  const [newContactDate, setNewContactDate] = useState('');
  const [newContactTime, setNewContactTime] = useState('');
  const [newContactNotes, setNewContactNotes] = useState('');
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [attachmentCounts, setAttachmentCounts] = useState<{ [key: string]: number }>({});
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [showScheduleTextModal, setShowScheduleTextModal] = useState<string | null>(null);
  const [scheduledTextContent, setScheduledTextContent] = useState('');
  const [scheduledTextDate, setScheduledTextDate] = useState('');
  const [scheduledTextTime, setScheduledTextTime] = useState('09:00');
  const [scheduledTextFrequency, setScheduledTextFrequency] = useState('once');
  const [scheduledTextCountdowns, setScheduledTextCountdowns] = useState<{ [key: string]: { days: number; time: string } | 'READY' }>({});
  const [showCopyMoveModal, setShowCopyMoveModal] = useState<{ lead: Lead; action: 'copy' | 'move' } | null>(null);
  const [selectedDestinationMonth, setSelectedDestinationMonth] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; lead: Lead } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [showScheduleEmailModal, setShowScheduleEmailModal] = useState<string | null>(null);
  const [selectedEmailTemplate, setSelectedEmailTemplate] = useState<string>('');
  const [scheduledEmailDate, setScheduledEmailDate] = useState('');
  const [scheduledEmailTime, setScheduledEmailTime] = useState('09:00');
  const [scheduledEmailFrequency, setScheduledEmailFrequency] = useState('once');
  const [scheduledEmailCountdowns, setScheduledEmailCountdowns] = useState<{ [key: string]: { days: number; time: string } | 'READY' }>({});
  const [savedEmailTemplates, setSavedEmailTemplates] = useState<EmailTemplate[]>([]);
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [templateSubject, setTemplateSubject] = useState('');
  const [templateBody, setTemplateBody] = useState('');
  const [editingInScheduleModal, setEditingInScheduleModal] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Text template states
  const [savedTextTemplates, setSavedTextTemplates] = useState<{ id: string; name: string; body: string }[]>([]);
  const [showTextTemplateManager, setShowTextTemplateManager] = useState(false);
  const [editingTextTemplate, setEditingTextTemplate] = useState<{ id: string; name: string; body: string } | null>(null);
  const [textTemplateName, setTextTemplateName] = useState('');
  const [textTemplateBody, setTextTemplateBody] = useState('');
  const [selectedTextTemplate, setSelectedTextTemplate] = useState<string>('');
  
  // Underwriting suite state
  const [showUnderwritingSuite, setShowUnderwritingSuite] = useState<{ leadId: string; leadName: string } | null>(null);
  const router = useRouter();

  // Update local state when props change (e.g., switching tabs)
  useEffect(() => {
    setLeads(initialLeads);
  }, [initialLeads]);

  // Fetch user timezone
  useEffect(() => {
    const fetchUserTimezone = async () => {
      try {
        const response = await fetch('/api/settings/timezone');
        if (response.ok) {
          const data = await response.json();
          if (data.timezone) {
            setUserTimezone(data.timezone);
          }
        }
      } catch (error) {
        console.error('Error fetching timezone:', error);
      }
    };
    fetchUserTimezone();
  }, []);

  // Fetch saved email templates for scheduled emails
  useEffect(() => {
    const fetchSavedEmailTemplates = async () => {
      try {
        const response = await fetch('/api/email-templates', {
          credentials: 'include',
        });
        if (response.ok) {
          const data = await response.json();
          setSavedEmailTemplates(data.templates || []);
        }
      } catch (error) {
        console.error('Error fetching saved email templates:', error);
      }
    };
    fetchSavedEmailTemplates();
  }, []);

  // Fetch saved text templates for scheduled texts
  useEffect(() => {
    const fetchSavedTextTemplates = async () => {
      try {
        const response = await fetch('/api/text-templates', {
          credentials: 'include',
        });
        if (response.ok) {
          const data = await response.json();
          setSavedTextTemplates(data.templates || []);
        }
      } catch (error) {
        console.error('Error fetching saved text templates:', error);
      }
    };
    fetchSavedTextTemplates();
  }, []);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };

    if (contextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [contextMenu]);

  // Close modals when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showEmailModal || showTextModal) {
        const target = e.target as HTMLElement;
        if (!target.closest('.email-modal-container') && !target.closest('.text-modal-container')) {
          setShowEmailModal(null);
          setShowTextModal(null);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showEmailModal, showTextModal]);

  const timerTypes = [
    'No Timer',
    '15 Day Countdown',
    '30 Day Countdown',
    '60 Day Countdown',
    'Display Date',
  ];

  const timerColors = [
    { name: 'Red', value: '#ff0000', label: '🔴 Red' },
    { name: 'Orange', value: '#ff8800', label: '🟠 Orange' },
    { name: 'Yellow', value: '#ffcc00', label: '🟡 Yellow' },
    { name: 'Green', value: '#00cc00', label: '🟢 Green' },
    { name: 'Blue', value: '#0088ff', label: '🔵 Blue' },
    { name: 'Purple', value: '#aa00ff', label: '🟣 Purple' },
  ];

  // Helper function to calculate countdown for auto email/text
  const getAutoCountdown = (lastSent: string | null, frequencyName: string, frequencies: Frequency[]) => {
    const freq = frequencies.find(f => f.name === frequencyName);
    if (!freq || freq.days_interval === 0 || !lastSent) return null;

    const now = new Date().getTime();
    const sent = new Date(lastSent).getTime();
    const nextSend = sent + (freq.days_interval * 24 * 60 * 60 * 1000);
    const diff = nextSend - now;

    if (diff <= 0) return 'READY';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    const hoursStr = hours.toString().padStart(2, '0');
    const minutesStr = minutes.toString().padStart(2, '0');
    const secondsStr = seconds.toString().padStart(2, '0');

    return `${days}D ${hoursStr}:${minutesStr}:${secondsStr}`;
  };

  const updateLead = async (leadId: string, field: string, value: any) => {
    // Optimistically update local state first
    setLeads(prev => prev.map(lead => 
      lead.id === leadId ? { ...lead, [field]: value } : lead
    ));

    // Also update parent state so changes persist across tab switches
    onLeadUpdate(leadId, { [field]: value });

    try {
      const res = await fetch('/api/leads/update-crm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, field, value }),
        credentials: 'include',
      });

      if (!res.ok) {
        console.error(`Failed to update ${field}:`, await res.text());
        // Revert on failure
        router.refresh();
      }
    } catch (error) {
      console.error('Error updating lead:', error);
      // Revert on error
      router.refresh();
    }
  };

  const openTimerSetupModal = (leadId: string) => {
    const lead = leads.find(l => l.id === leadId);
    setTempTimerType(lead?.timer_type || 'No Timer');
    setSelectedTimerColor(lead?.timer_color || '#ff0000');
    setShowTimerSetupModal(leadId);
  };

  const handleQuickTimerSetup = async (leadId: string) => {
    const timerType = tempTimerType;
    
    // If Display Date or Custom Countdown is selected, open respective modals
    if (timerType === 'Display Date') {
      setShowTimerSetupModal(null);
      setShowDisplayDateModal(leadId);
      return;
    }

    if (timerType === 'Custom Countdown') {
      setShowTimerSetupModal(null);
      openCustomTimerModal(leadId);
      return;
    }

    let timerEndDate = null;
    
    if (timerType !== 'No Timer') {
      const days = parseInt(timerType.split(' ')[0]);
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + days);
      timerEndDate = endDate.toISOString();
    }

    // Optimistically update local state with timer and color
    setLeads(prev => prev.map(lead => 
      lead.id === leadId ? { ...lead, timer_type: timerType, timer_end_date: timerEndDate, timer_color: selectedTimerColor } : lead
    ));

    // Also update parent state so changes persist across tab switches
    onLeadUpdate(leadId, { timer_type: timerType, timer_end_date: timerEndDate, timer_color: selectedTimerColor });

    try {
      // Update timer
      const timerRes = await fetch('/api/leads/update-crm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          leadId, 
          field: 'timer', 
          value: { timer_type: timerType, timer_end_date: timerEndDate }
        }),
        credentials: 'include',
      });

      // Update color
      await fetch('/api/leads/update-crm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          leadId, 
          field: 'timer_color',
          value: selectedTimerColor
        }),
        credentials: 'include',
      });

      if (!timerRes.ok) {
        console.error('Failed to update timer:', await timerRes.text());
        router.refresh();
      } else {
        const result = await timerRes.json();
        console.log('Timer updated successfully:', result);
      }
    } catch (error) {
      console.error('Error updating timer:', error);
      router.refresh();
    }

    setShowTimerSetupModal(null);
  };

  const handleTimerChange = async (leadId: string, timerType: string) => {
    // If Display Date is selected, open the modal
    if (timerType === 'Display Date') {
      setShowDisplayDateModal(leadId);
      return;
    }

    let timerEndDate = null;
    
    if (timerType !== 'No Timer') {
      const days = parseInt(timerType.split(' ')[0]);
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + days);
      timerEndDate = endDate.toISOString();
    }

    // Optimistically update local state first
    setLeads(prev => prev.map(lead => 
      lead.id === leadId ? { ...lead, timer_type: timerType, timer_end_date: timerEndDate } : lead
    ));

    // Also update parent state so changes persist across tab switches
    onLeadUpdate(leadId, { timer_type: timerType, timer_end_date: timerEndDate });

    try {
      const res = await fetch('/api/leads/update-crm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          leadId, 
          field: 'timer', 
          value: { timer_type: timerType, timer_end_date: timerEndDate }
        }),
        credentials: 'include',
      });

      if (!res.ok) {
        console.error('Failed to update timer:', await res.text());
        // Revert on failure
        router.refresh();
      } else {
        const result = await res.json();
        console.log('Timer updated successfully:', result);
      }
    } catch (error) {
      console.error('Error updating timer:', error);
      // Revert on error
      router.refresh();
    }
  };

  const handleDisplayDate = async (leadId: string) => {
    if (!displayDate) {
      alert('Please select a date');
      return;
    }

    // Parse date in local timezone at noon to avoid timezone shifting
    const endDate = new Date(displayDate + 'T12:00:00');
    const timerEndDate = endDate.toISOString();

    // Optimistically update local state with timer (no color for display dates)
    setLeads(prev => prev.map(lead => 
      lead.id === leadId ? { ...lead, timer_type: 'Display Date', timer_end_date: timerEndDate } : lead
    ));

    // Update parent state
    onLeadUpdate(leadId, { timer_type: 'Display Date', timer_end_date: timerEndDate });

    try {
      // Update timer
      const timerRes = await fetch('/api/leads/update-crm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          leadId, 
          field: 'timer', 
          value: { timer_type: 'Display Date', timer_end_date: timerEndDate }
        }),
        credentials: 'include',
      });

      if (!timerRes.ok) {
        console.error('Failed to update display date:', await timerRes.text());
        router.refresh();
      } else {
        console.log('Display date updated successfully');
      }
    } catch (error) {
      console.error('Error updating display date:', error);
      router.refresh();
    }

    setShowDisplayDateModal(null);
    setDisplayDate('');
  };

  const openScheduleTextModal = (leadId: string) => {
    const lead = leads.find(l => l.id === leadId);
    if (lead) {
      setScheduledTextContent(lead.scheduled_text_content || '');
      setScheduledTextFrequency(lead.scheduled_text_frequency || 'once');
      
      if (lead.scheduled_text_time) {
        const scheduledDate = new Date(lead.scheduled_text_time);
        setScheduledTextDate(scheduledDate.toISOString().split('T')[0]);
        setScheduledTextTime(scheduledDate.toTimeString().slice(0, 5));
      } else {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        setScheduledTextDate(tomorrow.toISOString().split('T')[0]);
        setScheduledTextTime('09:00');
      }
    }
    setShowScheduleTextModal(leadId);
  };

  const handleScheduleText = async (leadId: string) => {
    if (!scheduledTextContent.trim()) {
      alert('Please enter a text message');
      return;
    }
    if (!scheduledTextDate) {
      alert('Please select a date');
      return;
    }

    // Combine date and time
    const scheduledDateTime = new Date(`${scheduledTextDate}T${scheduledTextTime}`);
    const scheduledTimeISO = scheduledDateTime.toISOString();

    // Optimistically update local state
    setLeads(prev => prev.map(lead => 
      lead.id === leadId ? { 
        ...lead, 
        scheduled_text_content: scheduledTextContent,
        scheduled_text_time: scheduledTimeISO,
        scheduled_text_frequency: scheduledTextFrequency
      } : lead
    ));

    // Update parent state
    onLeadUpdate(leadId, { 
      scheduled_text_content: scheduledTextContent,
      scheduled_text_time: scheduledTimeISO,
      scheduled_text_frequency: scheduledTextFrequency
    });

    try {
      const res = await fetch('/api/leads/schedule-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          leadId, 
          content: scheduledTextContent,
          scheduledTime: scheduledTimeISO,
          frequency: scheduledTextFrequency
        }),
        credentials: 'include',
      });

      if (!res.ok) {
        console.error('Failed to schedule text:', await res.text());
        router.refresh();
      } else {
        console.log('Text scheduled successfully');
      }
    } catch (error) {
      console.error('Error scheduling text:', error);
      router.refresh();
    }

    setShowScheduleTextModal(null);
    setScheduledTextContent('');
    setSelectedTextTemplate('');
  };

  const clearScheduledText = async (leadId: string) => {
    if (!confirm('Clear this scheduled text?')) return;

    // Optimistically update local state
    setLeads(prev => prev.map(lead => 
      lead.id === leadId ? { 
        ...lead, 
        scheduled_text_content: null,
        scheduled_text_time: null,
        scheduled_text_frequency: null
      } : lead
    ));

    // Update parent state
    onLeadUpdate(leadId, { 
      scheduled_text_content: null,
      scheduled_text_time: null,
      scheduled_text_frequency: null
    });

    try {
      const res = await fetch('/api/leads/schedule-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          leadId, 
          content: null,
          scheduledTime: null,
          frequency: null
        }),
        credentials: 'include',
      });

      if (!res.ok) {
        console.error('Failed to clear scheduled text:', await res.text());
        router.refresh();
      }
    } catch (error) {
      console.error('Error clearing scheduled text:', error);
      router.refresh();
    }
  };

  const copyTextToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      alert('Text copied to clipboard!');
    } catch (error) {
      console.error('Failed to copy:', error);
      alert('Failed to copy text');
    }
  };

  // Email scheduling functions
  const openScheduleEmailModal = (leadId: string) => {
    const lead = leads.find(l => l.id === leadId);
    if (lead) {
      // Pre-fill if already scheduled
      if (lead.scheduled_email_template_id) {
        setSelectedEmailTemplate(lead.scheduled_email_template_id);
      }
      if (lead.scheduled_email_time) {
        const date = new Date(lead.scheduled_email_time);
        setScheduledEmailDate(date.toISOString().split('T')[0]);
        setScheduledEmailTime(`${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`);
      }
      if (lead.scheduled_email_frequency) {
        setScheduledEmailFrequency(lead.scheduled_email_frequency);
      }
    }
    setShowScheduleEmailModal(leadId);
  };

  const handleScheduleEmail = async (leadId: string, sendNow: boolean = false) => {
    if (!selectedEmailTemplate) {
      alert('Please select an email template');
      return;
    }

    let scheduledTimeISO = null;
    
    if (!sendNow) {
      if (!scheduledEmailDate) {
        alert('Please select a date');
        return;
      }
      // Combine date and time
      const scheduledDateTime = new Date(`${scheduledEmailDate}T${scheduledEmailTime}`);
      scheduledTimeISO = scheduledDateTime.toISOString();
    } else {
      // Send now = set to current time (will show as READY)
      scheduledTimeISO = new Date().toISOString();
    }

    // Optimistically update local state
    setLeads(prev => prev.map(lead => 
      lead.id === leadId ? { 
        ...lead, 
        scheduled_email_template_id: selectedEmailTemplate,
        scheduled_email_time: scheduledTimeISO,
        scheduled_email_frequency: sendNow ? 'once' : scheduledEmailFrequency
      } : lead
    ));

    // Update parent state
    onLeadUpdate(leadId, { 
      scheduled_email_template_id: selectedEmailTemplate,
      scheduled_email_time: scheduledTimeISO,
      scheduled_email_frequency: sendNow ? 'once' : scheduledEmailFrequency
    });

    try {
      const res = await fetch('/api/leads/schedule-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          leadId, 
          templateId: selectedEmailTemplate,
          scheduledTime: scheduledTimeISO,
          frequency: sendNow ? 'once' : scheduledEmailFrequency
        }),
        credentials: 'include',
      });

      if (!res.ok) {
        console.error('Failed to schedule email:', await res.text());
        router.refresh();
      }
    } catch (error) {
      console.error('Error scheduling email:', error);
      router.refresh();
    }

    setShowScheduleEmailModal(null);
    setSelectedEmailTemplate('');
    setScheduledEmailDate('');
    setScheduledEmailTime('09:00');
    setScheduledEmailFrequency('once');
  };

  const clearScheduledEmail = async (leadId: string) => {
    if (!confirm('Clear this scheduled email?')) return;

    // Optimistically update local state
    setLeads(prev => prev.map(lead => 
      lead.id === leadId ? { 
        ...lead, 
        scheduled_email_template_id: null,
        scheduled_email_time: null,
        scheduled_email_frequency: null
      } : lead
    ));

    // Update parent state
    onLeadUpdate(leadId, { 
      scheduled_email_template_id: null,
      scheduled_email_time: null,
      scheduled_email_frequency: null
    });

    try {
      const res = await fetch('/api/leads/schedule-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          leadId, 
          templateId: null,
          scheduledTime: null,
          frequency: null
        }),
        credentials: 'include',
      });

      if (!res.ok) {
        console.error('Failed to clear scheduled email:', await res.text());
        router.refresh();
      }
    } catch (error) {
      console.error('Error clearing scheduled email:', error);
      router.refresh();
    }
  };

  const copyEmailToClipboard = async (templateId: string, lead: Lead) => {
    const template = savedEmailTemplates.find(t => t.id === templateId);
    if (!template) return;
    
    // Replace placeholders with lead data
    const subjectWithData = replacePlaceholders(template.subject, lead);
    const bodyWithData = replacePlaceholders(template.body, lead);
    
    // Strip HTML tags for plain text copying, but keep structure
    const stripHtml = (html: string) => {
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      return tmp.textContent || tmp.innerText || '';
    };
    
    const plainTextBody = stripHtml(bodyWithData.replace(/<br\s*\/?>/gi, '\n'));
    const emailContent = `Subject: ${subjectWithData}\n\n${plainTextBody}`;
    
    try {
      await navigator.clipboard.writeText(emailContent);
      alert('Email copied to clipboard!');
    } catch (error) {
      console.error('Failed to copy:', error);
      alert('Failed to copy email');
    }
  };

  // Email template management functions
  const handleSaveTemplate = async () => {
    if (!templateName.trim() || !templateSubject.trim() || !templateBody.trim()) {
      alert('Please fill in all template fields');
      return;
    }

    try {
      const url = editingTemplate ? '/api/email-templates' : '/api/email-templates';
      const method = editingTemplate ? 'PUT' : 'POST';
      const body = editingTemplate 
        ? { id: editingTemplate.id, name: templateName, subject: templateSubject, body: templateBody }
        : { name: templateName, subject: templateSubject, body: templateBody };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include',
      });

      if (res.ok) {
        const { template } = await res.json();
        if (editingTemplate) {
          setSavedEmailTemplates(prev => prev.map(t => t.id === template.id ? template : t));
        } else {
          setSavedEmailTemplates(prev => [...prev, template]);
        }
        setEditingTemplate(null);
        setTemplateName('');
        setTemplateSubject('');
        setTemplateBody('');
        setEditingInScheduleModal(false);
      } else {
        alert('Failed to save template');
      }
    } catch (error) {
      console.error('Error saving template:', error);
      alert('Failed to save template');
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    if (!confirm('Delete this template?')) return;

    try {
      const res = await fetch(`/api/email-templates?id=${templateId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (res.ok) {
        setSavedEmailTemplates(prev => prev.filter(t => t.id !== templateId));
      } else {
        alert('Failed to delete template');
      }
    } catch (error) {
      console.error('Error deleting template:', error);
      alert('Failed to delete template');
    }
  };

  const handleEditTemplate = (template: EmailTemplate) => {
    setEditingTemplate(template);
    setTemplateName(template.name);
    setTemplateSubject(template.subject);
    setTemplateBody(template.body);
  };

  // Rich text formatting functions
  const insertBold = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = templateBody.substring(start, end);
    
    if (selectedText) {
      // Wrap selected text in <strong> tags
      const before = templateBody.substring(0, start);
      const after = templateBody.substring(end);
      const newText = `${before}<strong>${selectedText}</strong>${after}`;
      setTemplateBody(newText);
      
      // Reset cursor position after the inserted tag
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + 8 + selectedText.length + 9, start + 8 + selectedText.length + 9);
      }, 0);
    } else {
      // Insert placeholder bold tags
      const before = templateBody.substring(0, start);
      const after = templateBody.substring(start);
      const newText = `${before}<strong>Bold text</strong>${after}`;
      setTemplateBody(newText);
      
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + 8, start + 8 + 9); // Select "Bold text"
      }, 0);
    }
  };

  const insertImage = () => {
    const imageUrl = prompt('Enter image URL:');
    if (!imageUrl) return;

    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const before = templateBody.substring(0, start);
    const after = templateBody.substring(start);
    const imageTag = `<img src="${imageUrl}" alt="Image" style="max-width: 100%; height: auto;" />`;
    const newText = `${before}${imageTag}${after}`;
    setTemplateBody(newText);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + imageTag.length, start + imageTag.length);
    }, 0);
  };

  const insertPlaceholder = (placeholder: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const before = templateBody.substring(0, start);
    const after = templateBody.substring(start);
    const newText = `${before}{{${placeholder}}}${after}`;
    setTemplateBody(newText);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + placeholder.length + 4, start + placeholder.length + 4);
    }, 0);
  };

  const replacePlaceholders = (text: string, lead: Lead) => {
    // Get first name from full name (before first space)
    const firstName = lead.name.split(' ')[0] || lead.name;
    
    const replacements: { [key: string]: string } = {
      firstName: firstName,
      name: lead.name,
      email: lead.email || '',
      phone: lead.phone || '',
      company: lead.company || '',
    };

    let result = text;
    Object.keys(replacements).forEach(key => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, replacements[key]);
    });

    return result;
  };

  const replacePlaceholdersWithExamples = (text: string) => {
    const exampleReplacements: { [key: string]: string } = {
      firstName: '<span class="bg-yellow-100 px-1 rounded">John</span>',
      name: '<span class="bg-yellow-100 px-1 rounded">John Smith</span>',
      email: '<span class="bg-yellow-100 px-1 rounded">john@example.com</span>',
      phone: '<span class="bg-yellow-100 px-1 rounded">(555) 123-4567</span>',
      company: '<span class="bg-yellow-100 px-1 rounded">Acme Corp</span>',
    };

    let result = text;
    Object.keys(exampleReplacements).forEach(key => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, exampleReplacements[key]);
    });

    return result;
  };

  const editTemplateFromScheduleModal = (template: EmailTemplate) => {
    setEditingTemplate(template);
    setTemplateName(template.name);
    setTemplateSubject(template.subject);
    setTemplateBody(template.body);
    setEditingInScheduleModal(true);
  };

  // Text template management functions
  const handleSaveTextTemplate = async () => {
    if (!textTemplateName.trim() || !textTemplateBody.trim()) {
      alert('Please fill in all template fields');
      return;
    }

    try {
      const res = await fetch('/api/text-templates', {
        method: editingTextTemplate ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          id: editingTextTemplate?.id,
          name: textTemplateName,
          body: textTemplateBody,
        }),
      });

      if (res.ok) {
        const { template } = await res.json();
        if (editingTextTemplate) {
          setSavedTextTemplates(prev => prev.map(t => t.id === template.id ? template : t));
        } else {
          setSavedTextTemplates(prev => [...prev, template]);
        }
        setEditingTextTemplate(null);
        setTextTemplateName('');
        setTextTemplateBody('');
      } else {
        alert('Failed to save template');
      }
    } catch (error) {
      console.error('Error saving text template:', error);
      alert('Failed to save template');
    }
  };

  const handleDeleteTextTemplate = async (templateId: string) => {
    if (!confirm('Delete this template?')) return;

    try {
      const res = await fetch(`/api/text-templates?id=${templateId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (res.ok) {
        setSavedTextTemplates(prev => prev.filter(t => t.id !== templateId));
      } else {
        alert('Failed to delete template');
      }
    } catch (error) {
      console.error('Error deleting text template:', error);
      alert('Failed to delete template');
    }
  };

  const handleEditTextTemplate = (template: { id: string; name: string; body: string }) => {
    setEditingTextTemplate(template);
    setTextTemplateName(template.name);
    setTextTemplateBody(template.body);
  };

  // Underwriting functions
  const handleSaveUnderwriting = async (leadId: string, underwritingData: any) => {
    try {
      const response = await fetch('/api/leads/underwriting', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ leadId, underwritingData }),
      });

      if (!response.ok) {
        throw new Error('Failed to save underwriting data');
      }

      // Update local state
      setLeads(prevLeads =>
        prevLeads.map(lead =>
          lead.id === leadId ? { ...lead, underwriting_data: underwritingData } : lead
        )
      );

      router.refresh();
    } catch (error) {
      console.error('Error saving underwriting data:', error);
      throw error;
    }
  };

  const handleCopyLead = async (lead: Lead, destinationMonth: string) => {
    try {
      const res = await fetch('/api/leads/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: lead.id,
          destinationMonth
        }),
        credentials: 'include',
      });

      if (res.ok) {
        alert('Lead copied successfully!');
        setShowCopyMoveModal(null);
        setSelectedDestinationMonth('');
        router.refresh();
      } else {
        alert('Failed to copy lead');
      }
    } catch (error) {
      console.error('Error copying lead:', error);
      alert('Failed to copy lead');
    }
  };

  const handleMoveLead = async (lead: Lead, destinationMonth: string) => {
    try {
      const res = await fetch('/api/leads/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: lead.id,
          destinationMonth
        }),
        credentials: 'include',
      });

      if (res.ok) {
        alert('Lead moved successfully!');
        setShowCopyMoveModal(null);
        setSelectedDestinationMonth('');
        router.refresh();
      } else {
        alert('Failed to move lead');
      }
    } catch (error) {
      console.error('Error moving lead:', error);
      alert('Failed to move lead');
    }
  };

  const applyFormatting = (format: 'bold' | 'italic') => {
    const textarea = textAreaRef.current;
    if (!textarea || !showExpandedTextModal) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = showExpandedTextModal.value;
    const selectedText = text.substring(start, end);

    if (selectedText) {
      let formattedText = '';
      if (format === 'bold') {
        formattedText = text.substring(0, start) + `**${selectedText}**` + text.substring(end);
      } else if (format === 'italic') {
        formattedText = text.substring(0, start) + `*${selectedText}*` + text.substring(end);
      }

      setShowExpandedTextModal({ ...showExpandedTextModal, value: formattedText });
      
      // Restore cursor position after formatting
      setTimeout(() => {
        if (textarea) {
          const newCursorPos = start + (format === 'bold' ? 2 : 1) + selectedText.length;
          textarea.focus();
          textarea.setSelectionRange(newCursorPos, newCursorPos);
        }
      }, 0);
    }
  };

  // Convert URLs to clickable links (with option to make them clickable or just styled)
  const linkifyText = (text: string, clickable: boolean = false) => {
    if (!text) return text;
    
    // Regex to match URLs (http://, https://, www.)
    const urlRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)/gi;
    
    return text.replace(urlRegex, (match) => {
      // If URL doesn't start with http/https, add https://
      const href = match.startsWith('http') ? match : `https://${match}`;
      
      if (clickable) {
        // In expanded modal - make links clickable
        return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="text-[#5a7fc7] underline hover:text-[#4a6fb7]" onclick="event.stopPropagation()">${match}</a>`;
      } else {
        // In cell view - just style as link but don't make clickable
        return `<span class="text-[#5a7fc7] underline">${match}</span>`;
      }
    });
  };

  // Convert markdown to HTML for display
  const renderMarkdown = (text: string, clickableLinks: boolean = false) => {
    if (!text) return text;
    
    // Convert **bold** to <strong>
    let formatted = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    
    // Convert *italic* to <em> (but not if it's part of **)
    formatted = formatted.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
    
    // Convert URLs to links (clickable or just styled)
    formatted = linkifyText(formatted, clickableLinks);
    
    return formatted;
  };

  // Strip markdown syntax for plain text display (used when truncating)
  const stripMarkdown = (text: string) => {
    if (!text) return text;
    
    // Remove **bold** markers
    let plain = text.replace(/\*\*([^*]+)\*\*/g, '$1');
    
    // Remove *italic* markers
    plain = plain.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1');
    
    return plain;
  };

  // Fetch attachments when modal opens
  useEffect(() => {
    if (showExpandedTextModal) {
      fetchAttachments(showExpandedTextModal.leadId, showExpandedTextModal.field);
    } else {
      setAttachments([]);
    }
  }, [showExpandedTextModal]);

  const fetchAttachments = async (leadId: string, columnField: string) => {
    try {
      const res = await fetch(`/api/attachments?leadId=${leadId}&columnField=${columnField}`, {
        credentials: 'include',
      });
      if (res.ok) {
        const { attachments: fetchedAttachments } = await res.json();
        setAttachments(fetchedAttachments || []);
        // Update count
        const countKey = `${leadId}-${columnField}`;
        setAttachmentCounts(prev => ({ ...prev, [countKey]: fetchedAttachments?.length || 0 }));
      } else {
        // Silently handle non-ok responses (like 401 unauthorized)
        console.warn('Failed to fetch attachments:', res.status);
        setAttachments([]);
      }
    } catch (error) {
      // Silently handle fetch errors (network issues, etc.)
      console.warn('Error fetching attachments:', error);
      setAttachments([]);
    }
  };

  const handleFileUpload = async (leadId: string, columnField: string, file: File) => {
    setUploadingFile(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('leadId', leadId);
      formData.append('columnField', columnField);

      const res = await fetch('/api/attachments', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const { attachment } = await res.json();
        setAttachments(prev => [attachment, ...prev]);
        // Update attachment count
        const countKey = `${leadId}-${columnField}`;
        setAttachmentCounts(prev => ({ ...prev, [countKey]: (prev[countKey] || 0) + 1 }));
      } else {
        alert('Failed to upload file');
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      alert('Failed to upload file');
    } finally {
      setUploadingFile(false);
    }
  };

  const handleFileDrop = (e: React.DragEvent, leadId: string, columnField: string) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileUpload(leadId, columnField, files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set to false if leaving the drop zone entirely
    if (e.currentTarget === e.target) {
      setIsDraggingFile(false);
    }
  };

  const handleFileDelete = async (attachmentId: string) => {
    if (!confirm('Delete this file?')) return;

    try {
      const res = await fetch(`/api/attachments?id=${attachmentId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setAttachments(prev => prev.filter(a => a.id !== attachmentId));
        // Update attachment count
        if (showExpandedTextModal) {
          const countKey = `${showExpandedTextModal.leadId}-${showExpandedTextModal.field}`;
          setAttachmentCounts(prev => ({ ...prev, [countKey]: Math.max((prev[countKey] || 1) - 1, 0) }));
        }
      } else {
        alert('Failed to delete file');
      }
    } catch (error) {
      console.error('Error deleting file:', error);
      alert('Failed to delete file');
    }
  };

  // Fetch contact history when modal opens
  useEffect(() => {
    if (showContactHistoryModal) {
      fetchContactHistory(showContactHistoryModal.leadId);
      // Set default date/time to now
      const now = new Date();
      setNewContactDate(now.toISOString().split('T')[0]);
      setNewContactTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
    } else {
      setContactHistory([]);
      setNewContactDate('');
      setNewContactTime('');
      setNewContactNotes('');
    }
  }, [showContactHistoryModal]);

  const fetchContactHistory = async (leadId: string) => {
    try {
      const res = await fetch(`/api/contact-history?leadId=${leadId}`, {
        credentials: 'include',
      });
      if (res.ok) {
        const { history } = await res.json();
        setContactHistory(history || []);
      }
    } catch (error) {
      console.error('Error fetching contact history:', error);
    }
  };

  const handleAddContact = async () => {
    if (!showContactHistoryModal || !newContactDate || !newContactTime) return;

    const contactDate = new Date(`${newContactDate}T${newContactTime}`).toISOString();

    try {
      const res = await fetch('/api/contact-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: showContactHistoryModal.leadId,
          contactDate,
          notes: newContactNotes,
        }),
        credentials: 'include',
      });

      if (res.ok) {
        // Refresh history
        await fetchContactHistory(showContactHistoryModal.leadId);
        // Clear form
        const now = new Date();
        setNewContactDate(now.toISOString().split('T')[0]);
        setNewContactTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
        setNewContactNotes('');
        // Refresh dashboard to update last_contact
        router.refresh();
      } else {
        alert('Failed to add contact');
      }
    } catch (error) {
      console.error('Error adding contact:', error);
      alert('Failed to add contact');
    }
  };

  const handleDeleteContact = async (id: string) => {
    if (!confirm('Delete this contact entry?')) return;

    if (!showContactHistoryModal) return;

    // Optimistically update UI immediately
    setContactHistory(prev => prev.filter(c => c.id !== id));

    try {
      const res = await fetch(`/api/contact-history?id=${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      console.log('Delete response status:', res.status, res.statusText);

      if (res.ok) {
        const result = await res.json();
        console.log('Delete successful:', result);
        // Refresh dashboard to update last_contact
        router.refresh();
      } else {
        let errorData;
        try {
          errorData = await res.json();
        } catch (e) {
          errorData = { error: `HTTP ${res.status}: ${res.statusText}` };
        }
        console.error('Delete failed:', res.status, errorData);
        // Revert on failure - fetch from server
        await fetchContactHistory(showContactHistoryModal.leadId);
        
        if (res.status === 404) {
          alert('Contact entry not found. It may have already been deleted.');
        } else {
          alert(`Failed to delete contact: ${errorData.error || 'Unknown error'}\n\nPlease run fix-contact-history.sql in Supabase SQL Editor`);
        }
      }
    } catch (error) {
      console.error('Error deleting contact:', error);
      // Revert on error - fetch from server
      await fetchContactHistory(showContactHistoryModal.leadId);
      alert('Failed to delete contact. Check console for details.');
    }
  };

  const handleFileDownload = async (attachmentId: string) => {
    try {
      const res = await fetch(`/api/attachments/download?id=${attachmentId}`);
      if (res.ok) {
        const { url, fileName } = await res.json();
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        alert('Failed to download file');
      }
    } catch (error) {
      console.error('Error downloading file:', error);
      alert('Failed to download file');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleTimerColorChange = async (leadId: string, color: string) => {
    // Optimistically update local state first
    setLeads(prev => prev.map(lead => 
      lead.id === leadId ? { ...lead, timer_color: color } : lead
    ));

    // Also update parent state so changes persist across tab switches
    onLeadUpdate(leadId, { timer_color: color });

    try {
      const res = await fetch('/api/leads/update-crm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          leadId, 
          field: 'timer_color',
          value: color
        }),
        credentials: 'include',
      });

      if (!res.ok) {
        console.error('Failed to update timer color:', await res.text());
        router.refresh();
      }
    } catch (error) {
      console.error('Error updating timer color:', error);
      router.refresh();
    }

    setShowTimerColorModal(null);
  };

  const handleCustomTimer = async (leadId: string) => {
    if (!customTimerDate) {
      alert('Please select a date');
      return;
    }

    // Combine date and time
    const endDate = new Date(`${customTimerDate}T${customTimerTime}`);
    const timerEndDate = endDate.toISOString();

    // Optimistically update local state with timer and color
    setLeads(prev => prev.map(lead => 
      lead.id === leadId ? { ...lead, timer_type: 'Custom Countdown', timer_end_date: timerEndDate, timer_color: selectedTimerColor } : lead
    ));

    // Also update parent state so changes persist across tab switches
    onLeadUpdate(leadId, { timer_type: 'Custom Countdown', timer_end_date: timerEndDate, timer_color: selectedTimerColor });

    try {
      // Update timer
      const timerRes = await fetch('/api/leads/update-crm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          leadId, 
          field: 'timer', 
          value: { timer_type: 'Custom Countdown', timer_end_date: timerEndDate }
        }),
        credentials: 'include',
      });

      // Update color
      await fetch('/api/leads/update-crm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          leadId, 
          field: 'timer_color',
          value: selectedTimerColor
        }),
        credentials: 'include',
      });

      if (!timerRes.ok) {
        console.error('Failed to update custom timer:', await timerRes.text());
        router.refresh();
      } else {
        const result = await timerRes.json();
        console.log('Custom timer updated successfully:', result);
      }
    } catch (error) {
      console.error('Error updating custom timer:', error);
      router.refresh();
    }

    setShowCustomTimerModal(null);
    setCustomTimerDate('');
    setCustomTimerTime('23:59');
  };

  const openDisplayDateModal = (leadId: string) => {
    const lead = leads.find(l => l.id === leadId);
    if (lead?.timer_end_date) {
      // Extract just the date portion to avoid timezone issues
      const dateStr = lead.timer_end_date.split('T')[0];
      setDisplayDate(dateStr);
      setSelectedTimerColor(lead.timer_color || '#ff0000');
    } else {
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      setDisplayDate(`${year}-${month}-${day}`);
      setSelectedTimerColor(lead?.timer_color || '#ff0000');
    }
    setShowDisplayDateModal(leadId);
  };

  const openCustomTimerModal = (leadId: string) => {
    const lead = leads.find(l => l.id === leadId);
    if (lead?.timer_end_date) {
      const endDate = new Date(lead.timer_end_date);
      setCustomTimerDate(endDate.toISOString().split('T')[0]);
      setCustomTimerTime(endDate.toTimeString().slice(0, 5));
      setSelectedTimerColor(lead.timer_color || '#ff0000');
    } else {
      // Default to 30 days from now
      const defaultEnd = new Date();
      defaultEnd.setDate(defaultEnd.getDate() + 30);
      setCustomTimerDate(defaultEnd.toISOString().split('T')[0]);
      setCustomTimerTime('23:59');
      setSelectedTimerColor(lead?.timer_color || '#ff0000');
    }
    setShowCustomTimerModal(leadId);
  };

  const getCountdown = (timerEndDate: string | null) => {
    if (!timerEndDate) return null;

    const now = new Date().getTime();
    const end = new Date(timerEndDate).getTime();
    const diff = end - now;

    if (diff <= 0) return 'EXPIRED';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    const hoursStr = hours.toString().padStart(2, '0');
    const minutesStr = minutes.toString().padStart(2, '0');
    const secondsStr = seconds.toString().padStart(2, '0');

    return { days, time: `${hoursStr}:${minutesStr}:${secondsStr}` };
  };

  const [countdown, setCountdown] = useState<{ [key: string]: { days: number; time: string } | string }>({});

  // Initialize countdowns and update every second
  useEffect(() => {
    // Calculate initial countdowns for deal timers
    const initialCountdowns: { [key: string]: { days: number; time: string } | string } = {};
    leads.forEach(lead => {
      if (lead.timer_end_date) {
        const result = getCountdown(lead.timer_end_date);
        initialCountdowns[lead.id] = result || 'EXPIRED';
      }
    });
    setCountdown(initialCountdowns);

    // Calculate initial auto email/text countdowns
    const initialAutoCountdowns: { [key: string]: { email: string, text: string } } = {};
    leads.forEach(lead => {
      initialAutoCountdowns[lead.id] = {
        email: getAutoCountdown(lead.last_email_sent, lead.auto_email_frequency, emailFrequencies) || '',
        text: getAutoCountdown(lead.last_text_sent, lead.auto_text_frequency, textFrequencies) || ''
      };
    });
    setAutoCountdowns(initialAutoCountdowns);

    // Calculate initial scheduled text countdowns
    const initialScheduledCountdowns: { [key: string]: { days: number; time: string } | 'READY' } = {};
    leads.forEach(lead => {
      if (lead.scheduled_text_time) {
        const result = getCountdown(lead.scheduled_text_time);
        if (result === 'EXPIRED') {
          initialScheduledCountdowns[lead.id] = 'READY';
        } else if (result) {
          initialScheduledCountdowns[lead.id] = result;
        }
      }
    });
    setScheduledTextCountdowns(initialScheduledCountdowns);

    // Calculate initial scheduled email countdowns
    const initialScheduledEmailCountdowns: { [key: string]: { days: number; time: string } | 'READY' } = {};
    leads.forEach(lead => {
      if (lead.scheduled_email_time) {
        const result = getCountdown(lead.scheduled_email_time);
        if (result === 'EXPIRED') {
          initialScheduledEmailCountdowns[lead.id] = 'READY';
        } else if (result) {
          initialScheduledEmailCountdowns[lead.id] = result;
        }
      }
    });
    setScheduledEmailCountdowns(initialScheduledEmailCountdowns);

    // Update every second
    const interval = setInterval(() => {
      const newCountdowns: { [key: string]: { days: number; time: string } | string } = {};
      const newAutoCountdowns: { [key: string]: { email: string, text: string } } = {};
      const newScheduledCountdowns: { [key: string]: { days: number; time: string } | 'READY' } = {};
      const newScheduledEmailCountdowns: { [key: string]: { days: number; time: string } | 'READY' } = {};
      
      leads.forEach(lead => {
        if (lead.timer_end_date) {
          const result = getCountdown(lead.timer_end_date);
          newCountdowns[lead.id] = result || 'EXPIRED';
        }
        newAutoCountdowns[lead.id] = {
          email: getAutoCountdown(lead.last_email_sent, lead.auto_email_frequency, emailFrequencies) || '',
          text: getAutoCountdown(lead.last_text_sent, lead.auto_text_frequency, textFrequencies) || ''
        };
        if (lead.scheduled_text_time) {
          const result = getCountdown(lead.scheduled_text_time);
          if (result === 'EXPIRED') {
            newScheduledCountdowns[lead.id] = 'READY';
          } else if (result) {
            newScheduledCountdowns[lead.id] = result;
          }
        }
        if (lead.scheduled_email_time) {
          const result = getCountdown(lead.scheduled_email_time);
          if (result === 'EXPIRED') {
            newScheduledEmailCountdowns[lead.id] = 'READY';
          } else if (result) {
            newScheduledEmailCountdowns[lead.id] = result;
          }
        }
      });
      
      setCountdown(newCountdowns);
      setAutoCountdowns(newAutoCountdowns);
      setScheduledTextCountdowns(newScheduledCountdowns);
      setScheduledEmailCountdowns(newScheduledEmailCountdowns);
    }, 1000);

    return () => clearInterval(interval);
  }, [leads, emailFrequencies, textFrequencies]);

  const startEdit = (leadId: string, field: string, currentValue: any) => {
    setEditingId(leadId);
    setEditField(field);
    setEditValue(currentValue || '');
  };

  const saveEdit = () => {
    if (editField && editingId) {
      // Convert value to number if it's the value field
      let valueToSave: string | number | null = editField === 'value' ? Number(editValue) : editValue;
      
      updateLead(editingId, editField, valueToSave);
    }
    setEditingId(null);
    setEditField('');
    setEditValue('');
  };

  const deleteLead = async (leadId: string) => {
    if (!confirm('Delete this lead?')) return;

    // Optimistically remove from local state
    setLeads(prev => prev.filter(lead => lead.id !== leadId));

    try {
      const res = await fetch('/api/leads/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId }),
      });

      if (res.ok) {
        // Refresh to sync with database
        router.refresh();
      } else {
        // Revert on failure
        router.refresh();
      }
    } catch (error) {
      console.error('Error deleting lead:', error);
      // Revert on error
      router.refresh();
    }
  };

  const addLead = async () => {
    if (!newLead.name || !newLead.email) {
      alert('Name and Email are required');
      return;
    }

    try {
      const res = await fetch('/api/leads/create-crm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newLead, monthKey }),
      });

      if (res.ok) {
        const { lead } = await res.json();
        
        // Update local state
        setLeads(prev => [lead, ...prev]);
        
        // Update parent state so it persists
        onLeadCreate(lead);
        
        setShowAddModal(false);
        setNewLead({ name: '', email: '', phone: '', company: '' });
      } else {
        alert('Failed to add lead');
      }
    } catch (error) {
      console.error('Error creating lead:', error);
      alert('Failed to add lead');
    }
  };

  // Helper function to render cell content based on field type
  const renderCell = (lead: Lead, column: Column, bgColor: string, textColor: string) => {
    const columnField = column.field;
    const fieldKey = columnField as keyof Lead;
    
    // Handle expandable text fields (configurable via column settings)
    // Skip expandable for 'offers' column as it now has the Underwriting Suite
    if (column.expandable && columnField !== 'offers') {
      const value = lead[fieldKey] as string | null;
      const formattedValue = value ? renderMarkdown(value, false) : null; // Links not clickable in cell view
      const countKey = `${lead.id}-${columnField}`;
      const attachmentCount = attachmentCounts[countKey] || 0;
      
      return (
        <button
          onClick={() => setShowExpandedTextModal({ leadId: lead.id, field: columnField, value: String(value || ''), label: column.label })}
          className="hover:text-[#5a7fc7] transition-colors text-left whitespace-nowrap overflow-hidden text-ellipsis max-w-full block"
        >
          <div className="flex items-center gap-1.5">
            {value ? (
              <span 
                className="block overflow-hidden text-ellipsis" 
                style={{ maxWidth: `${column.width - (attachmentCount > 0 ? 60 : 32)}px` }}
                dangerouslySetInnerHTML={{ __html: formattedValue || '' }}
              />
            ) : (
              `Add ${column.label.toLowerCase()}`
            )}
            {column.allowAttachments && attachmentCount > 0 && (
              <span className="flex items-center gap-1 text-xs text-[#6b6b6b] flex-shrink-0">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
                {attachmentCount}
              </span>
            )}
          </div>
        </button>
      );
    }
    
    switch (columnField) {
      case 'timer':
        return lead.timer_type !== 'No Timer' && lead.timer_end_date ? (
          editingTimerId === lead.id ? (
            <select
              value={lead.timer_type}
              onChange={(e) => {
                handleTimerChange(lead.id, e.target.value);
                setEditingTimerId(null);
              }}
              onBlur={() => setEditingTimerId(null)}
              autoFocus
              className="w-full px-2 py-1 text-xs border border-[#5a7fc7] rounded bg-white text-[#1a1a1a] cursor-pointer"
            >
              {timerTypes.map((type, idx) => (
                <option key={`timer-${idx}`} value={type}>{type}</option>
              ))}
            </select>
          ) : lead.timer_type === 'Display Date' ? (
            editingTimerId === lead.id ? (
              <select
                value={lead.timer_type}
                onChange={(e) => {
                  handleTimerChange(lead.id, e.target.value);
                  setEditingTimerId(null);
                }}
                onBlur={() => setEditingTimerId(null)}
                autoFocus
                className="w-full px-2 py-1 text-xs border border-[#5a7fc7] rounded bg-white text-[#1a1a1a] cursor-pointer"
              >
                {timerTypes.map((type, idx) => (
                  <option key={`timer-${idx}`} value={type}>{type}</option>
                ))}
              </select>
            ) : (
              <button
                onClick={() => setEditingTimerId(lead.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  openDisplayDateModal(lead.id);
                }}
                style={{ 
                  fontFamily: 'var(--font-roboto-mono), monospace', 
                  fontSize: '13px', 
                  fontWeight: '500', 
                  color: '#1a1a1a', 
                  whiteSpace: 'nowrap',
                  display: 'inline-block',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  letterSpacing: '-0.02em',
                }}
                className="hover:opacity-70 transition-opacity"
              >
                {(() => {
                  // Extract date parts from ISO string to avoid timezone conversion
                  const dateStr = lead.timer_end_date.split('T')[0];
                  const [year, month, day] = dateStr.split('-');
                  const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
                  const formatted = date.toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric', 
                    year: 'numeric' 
                  });
                  // Remove extra spaces from date formatting for tighter spacing
                  return formatted.replace(/,\s+/g, ', ').replace(/\s+/g, ' ');
                })()}
              </button>
            )
          ) : (
            <button
              onClick={(e) => {
                if (e.shiftKey) {
                  e.preventDefault();
                  setShowTimerColorModal(lead.id);
                } else {
                  setEditingTimerId(lead.id);
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                openCustomTimerModal(lead.id);
              }}
              style={{ 
                fontFamily: 'var(--font-roboto-mono), monospace', 
                fontSize: '13px', 
                fontWeight: '700', 
                whiteSpace: 'nowrap',
                display: 'inline-block',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
              }}
              className="hover:opacity-80 transition-opacity"
              title="Click to change type | Shift+Click to change color | Right-click for custom date"
            >
              {(() => {
                const countdownValue = countdown[lead.id];
                const timerColor = lead.timer_color || '#ff0000';
                if (countdownValue === 'EXPIRED') {
                  return <span style={{ color: timerColor }} className="animate-pulse">EXPIRED</span>;
                }
                if (typeof countdownValue === 'object' && countdownValue !== null) {
                  return (
                    <>
                      <span style={{ color: timerColor }}>
                        {countdownValue.days}D
                      </span>
                      <span style={{ color: timerColor }}>
                        {' '}{countdownValue.time}
                      </span>
                    </>
                  );
                }
                return '...';
              })()}
            </button>
          )
        ) : (
          <select
            value={lead.timer_type}
            onChange={(e) => handleTimerChange(lead.id, e.target.value)}
            onContextMenu={(e) => {
              e.preventDefault();
              openCustomTimerModal(lead.id);
            }}
            className="w-full px-2 py-1 text-xs border border-[#e5e5e5] rounded bg-white text-[#1a1a1a] cursor-pointer"
          >
            {timerTypes.map((type, idx) => (
              <option key={`timer-${idx}`} value={type}>{type}</option>
            ))}
          </select>
        );

      case 'company': {
        const countKey = `${lead.id}-company`;
        const attachmentCount = attachmentCounts[countKey] || 0;
        const companyText = lead.company || 'Add company';
        const maxLength = 25;
        
        let displayText: string;
        let shouldRenderMarkdown = true;
        
        if (column.truncateText) {
          const plainText = stripMarkdown(companyText);
          if (plainText.length > maxLength) {
            displayText = plainText.substring(0, maxLength) + '...';
            shouldRenderMarkdown = false;
          } else {
            displayText = companyText;
          }
        } else {
          displayText = companyText;
        }
        
        return editingId === lead.id && editField === 'company' ? (
          <input
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={saveEdit}
            onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
            autoFocus
            className="w-full px-2 py-1 text-sm border border-[#5a7fc7] rounded"
          />
        ) : (
          <button
            onClick={() => startEdit(lead.id, 'company', lead.company || '')}
            onContextMenu={(e) => {
              e.preventDefault();
              setShowExpandedTextModal({ leadId: lead.id, field: 'company', value: String(lead.company || ''), label: 'Opportunity' });
            }}
            className="hover:text-[#5a7fc7] transition-colors text-left whitespace-nowrap"
            title={column.truncateText && stripMarkdown(companyText).length > maxLength ? companyText : undefined}
          >
            <div className="flex items-center gap-1.5">
              {shouldRenderMarkdown ? (
                <span dangerouslySetInnerHTML={{ __html: renderMarkdown(displayText, false) }} />
              ) : (
                <span>{displayText}</span>
              )}
              {column.allowAttachments && attachmentCount > 0 && (
                <span className="flex items-center gap-1 text-xs text-[#6b6b6b]">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                  {attachmentCount}
                </span>
              )}
            </div>
          </button>
        );
      }

      case 'name': {
        const countKey = `${lead.id}-name`;
        const attachmentCount = attachmentCounts[countKey] || 0;
        return editingId === lead.id && editField === 'name' ? (
          <input
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={saveEdit}
            onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
            autoFocus
            className="w-full px-2 py-1 text-sm border border-[#5a7fc7] rounded"
          />
        ) : (
          <button
            onClick={() => startEdit(lead.id, 'name', lead.name)}
            onContextMenu={(e) => {
              e.preventDefault();
              setShowExpandedTextModal({ leadId: lead.id, field: 'name', value: String(lead.name || ''), label: 'Name' });
            }}
            className="hover:text-[#5a7fc7] transition-colors text-left"
          >
            <div className="flex items-center gap-1.5">
              <span dangerouslySetInnerHTML={{ __html: renderMarkdown(lead.name || '', false) }} />
              {column.allowAttachments && attachmentCount > 0 && (
                <span className="flex items-center gap-1 text-xs text-[#6b6b6b]">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                  {attachmentCount}
                </span>
              )}
            </div>
          </button>
        );
      }

      case 'stage':
        return (
          <select
            value={lead.stage}
            onChange={(e) => updateLead(lead.id, 'stage', e.target.value)}
            className="px-2 py-1 text-xs font-medium rounded border-0 cursor-pointer"
            style={{ backgroundColor: bgColor, color: textColor }}
          >
            {stages.map((stage, idx) => (
              <option key={`stage-${idx}`} value={stage.value}>
                {stage.value}
              </option>
            ))}
          </select>
        );

      case 'value':
        return editingId === lead.id && editField === 'value' ? (
          <input
            type="number"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={saveEdit}
            onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
            autoFocus
            className="w-full px-2 py-1 text-sm border border-[#5a7fc7] rounded"
          />
        ) : (
          <button
            onClick={() => startEdit(lead.id, 'value', lead.value?.toString() || '0')}
            className="hover:text-[#5a7fc7] transition-colors text-left whitespace-nowrap"
          >
            ${lead.value?.toLocaleString() || '0'}
          </button>
        );

      case 'email': {
        const countKey = `${lead.id}-email`;
        const attachmentCount = attachmentCounts[countKey] || 0;
        const emailText = lead.email || 'Add email';
        const maxEmailLength = 25;
        
        let displayEmail: string;
        let shouldRenderMarkdown = true;
        
        if (column.truncateText) {
          const plainText = stripMarkdown(emailText);
          if (plainText.length > maxEmailLength) {
            displayEmail = plainText.substring(0, maxEmailLength) + '...';
            shouldRenderMarkdown = false; // Don't render markdown on truncated text
          } else {
            displayEmail = emailText;
          }
        } else {
          displayEmail = emailText;
        }
        
        return editingId === lead.id && editField === 'email' ? (
          <input
            type="email"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={saveEdit}
            onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
            autoFocus
            className="w-full px-2 py-1 text-sm border border-[#5a7fc7] rounded"
          />
        ) : (
          <button
            onClick={() => startEdit(lead.id, 'email', lead.email || '')}
            onContextMenu={(e) => {
              e.preventDefault();
              setShowExpandedTextModal({ leadId: lead.id, field: 'email', value: String(lead.email || ''), label: 'E-Mail' });
            }}
            className="hover:text-[#5a7fc7] transition-colors text-left whitespace-nowrap"
            title={column.truncateText && stripMarkdown(emailText).length > maxEmailLength ? emailText : undefined}
          >
            <div className="flex items-center gap-1.5">
              {shouldRenderMarkdown ? (
                <span dangerouslySetInnerHTML={{ __html: renderMarkdown(displayEmail, false) }} />
              ) : (
                <span>{displayEmail}</span>
              )}
              {column.allowAttachments && attachmentCount > 0 && (
                <span className="flex items-center gap-1 text-xs text-[#6b6b6b]">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                  {attachmentCount}
                </span>
              )}
            </div>
          </button>
        );
      }

      case 'phone': {
        const countKey = `${lead.id}-phone`;
        const attachmentCount = attachmentCounts[countKey] || 0;
        const phoneKey = `${lead.id}-${column.field}`;
        const showPhoneLocation = column.showPhoneLocation;
        
        const handlePhoneHover = (phoneNumber: string, event: React.MouseEvent) => {
          if (!phoneLocationData[phoneKey]) {
            const locationInfo = getPhoneLocation(phoneNumber, userTimezone);
            setPhoneLocationData(prev => ({ ...prev, [phoneKey]: locationInfo }));
          }
          
          // Calculate tooltip position
          const rect = event.currentTarget.getBoundingClientRect();
          const tooltipX = rect.left + (rect.width / 2);
          const tooltipY = rect.bottom + 8; // 8px below the element
          
          setTooltipPosition({ x: tooltipX, y: tooltipY });
          setHoveredPhone(phoneKey);
        };
        
        return editingId === lead.id && editField === 'phone' ? (
          <input
            type="tel"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={saveEdit}
            onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
            autoFocus
            className="w-full px-2 py-1 text-sm border border-[#5a7fc7] rounded"
          />
        ) : (
          <div className="relative">
            <button
              onClick={() => startEdit(lead.id, 'phone', lead.phone || '')}
              onContextMenu={(e) => {
                e.preventDefault();
                setShowExpandedTextModal({ leadId: lead.id, field: 'phone', value: String(lead.phone || ''), label: 'Phone' });
              }}
              onMouseEnter={(e) => showPhoneLocation && lead.phone && handlePhoneHover(lead.phone, e)}
              onMouseLeave={() => {
                setHoveredPhone(null);
                setTooltipPosition(null);
              }}
              className="hover:text-[#5a7fc7] transition-colors text-left whitespace-nowrap"
            >
              <div className="flex items-center gap-1.5">
                <span dangerouslySetInnerHTML={{ __html: renderMarkdown(lead.phone || 'Add phone', false) }} />
                {column.allowAttachments && attachmentCount > 0 && (
                  <span className="flex items-center gap-1 text-xs text-[#6b6b6b]">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                    {attachmentCount}
                  </span>
                )}
              </div>
            </button>
            
            {/* Phone Location Tooltip */}
            {showPhoneLocation && hoveredPhone === phoneKey && phoneLocationData[phoneKey] && tooltipPosition && (
              <div 
                className="fixed z-50 bg-white border border-[#e5e5e5] rounded-lg shadow-xl p-3 whitespace-nowrap"
                style={{ 
                  left: `${tooltipPosition.x}px`, 
                  top: `${tooltipPosition.y}px`,
                  transform: 'translateX(-50%)',
                  pointerEvents: 'none'
                }}
              >
                <div className="text-xs space-y-1">
                  <div className="font-semibold text-[#1a1a1a]">
                    {phoneLocationData[phoneKey]!.city}, {phoneLocationData[phoneKey]!.state}
                  </div>
                  <div className="text-[#6b6b6b]">
                    {phoneLocationData[phoneKey]!.localTime} ({phoneLocationData[phoneKey]!.timeOffset})
                  </div>
                </div>
                {/* Arrow pointing up */}
                <div 
                  className="absolute left-1/2 transform -translate-x-1/2"
                  style={{
                    bottom: '100%',
                    width: 0,
                    height: 0,
                    borderLeft: '6px solid transparent',
                    borderRight: '6px solid transparent',
                    borderBottom: '6px solid white',
                  }}
                />
              </div>
            )}
          </div>
        );
      }

      case 'lead_source': {
        const countKey = `${lead.id}-lead_source`;
        const attachmentCount = attachmentCounts[countKey] || 0;
        const sourceText = lead.lead_source || 'Add source';
        const maxLength = 25;
        
        let displayText: string;
        let shouldRenderMarkdown = true;
        
        if (column.truncateText) {
          const plainText = stripMarkdown(sourceText);
          if (plainText.length > maxLength) {
            displayText = plainText.substring(0, maxLength) + '...';
            shouldRenderMarkdown = false;
          } else {
            displayText = sourceText;
          }
        } else {
          displayText = sourceText;
        }
        
        return editingId === lead.id && editField === 'lead_source' ? (
          <input
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={saveEdit}
            onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
            autoFocus
            className="w-full px-2 py-1 text-sm border border-[#5a7fc7] rounded"
          />
        ) : (
          <button
            onClick={() => startEdit(lead.id, 'lead_source', lead.lead_source || '')}
            onContextMenu={(e) => {
              e.preventDefault();
              setShowExpandedTextModal({ leadId: lead.id, field: 'lead_source', value: String(lead.lead_source || ''), label: 'Lead Source' });
            }}
            className="hover:text-[#5a7fc7] transition-colors text-left whitespace-nowrap"
            title={column.truncateText && stripMarkdown(sourceText).length > maxLength ? sourceText : undefined}
          >
            <div className="flex items-center gap-1.5">
              {shouldRenderMarkdown ? (
                <span dangerouslySetInnerHTML={{ __html: renderMarkdown(displayText, false) }} />
              ) : (
                <span>{displayText}</span>
              )}
              {column.allowAttachments && attachmentCount > 0 && (
                <span className="flex items-center gap-1 text-xs text-[#6b6b6b]">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                  {attachmentCount}
                </span>
              )}
            </div>
          </button>
        );
      }

      case 'last_contact': {
        // Format datetime for display (M/D/YY 11am)
        const formatLastContact = (dateString: string | null) => {
          if (!dateString) return 'Add contact';
          const date = new Date(dateString);
          const dateStr = date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' });
          const hour = date.getHours();
          const isPM = hour >= 12;
          const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
          const timeStr = `${displayHour}${isPM ? 'pm' : 'am'}`;
          return `${dateStr} ${timeStr}`;
        };

        return (
          <button
            onClick={() => setShowContactHistoryModal({ leadId: lead.id, leadName: lead.name })}
            className="hover:text-[#5a7fc7] transition-colors text-left whitespace-nowrap"
          >
            {formatLastContact(lead.last_contact)}
          </button>
        );
      }

      case 'notes': {
        const notesText = lead.notes || 'Add notes';
        const maxLength = 25;
        
        let displayText: string;
        
        if (column.truncateText) {
          const plainText = stripMarkdown(notesText);
          if (plainText.length > maxLength) {
            displayText = plainText.substring(0, maxLength) + '...';
          } else {
            displayText = notesText;
          }
        } else {
          displayText = notesText;
        }
        
        return editingId === lead.id && editField === 'notes' ? (
          <textarea
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={saveEdit}
            autoFocus
            className="w-full px-2 py-1 text-sm border border-[#5a7fc7] rounded min-h-[60px]"
          />
        ) : (
          <button
            onClick={() => startEdit(lead.id, 'notes', lead.notes || '')}
            className="hover:text-[#5a7fc7] transition-colors text-left whitespace-nowrap"
            title={column.truncateText && stripMarkdown(notesText).length > maxLength ? notesText : undefined}
          >
            {displayText}
          </button>
        );
      }

      case 'offers': {
        const hasUnderwritingData = lead.underwriting_data && Object.keys(lead.underwriting_data).length > 0;
        
        return (
          <button
            onClick={() => setShowUnderwritingSuite({ leadId: lead.id, leadName: lead.name })}
            className="w-full px-2 py-1 text-xs bg-white text-black border border-black rounded hover:bg-gray-50 transition-colors font-medium"
          >
            {hasUnderwritingData ? 'View' : '+ Create Deal'}
          </button>
        );
      }

      case 'auto_email_frequency': {
        const scheduledEmailCountdown = scheduledEmailCountdowns[lead.id];
        const hasScheduledEmail = lead.scheduled_email_time && lead.scheduled_email_template_id;
        
        return (
          <>
            {hasScheduledEmail ? (
              scheduledEmailCountdown === 'READY' ? (
                <div 
                  className="border border-[#5a7fc7] rounded cursor-pointer hover:bg-[#f5f5f5] transition-colors"
                  onClick={() => openScheduleEmailModal(lead.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    clearScheduledEmail(lead.id);
                  }}
                  title="Click to edit | Right-click to clear"
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '4px 8px',
                    width: 'fit-content',
                    margin: '0 auto'
                  }}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      copyEmailToClipboard(lead.scheduled_email_template_id!, lead);
                    }}
                    className="px-1.5 py-0.5 bg-[#5a7fc7] text-white rounded hover:bg-[#4a6fb7] transition-colors"
                    style={{ fontSize: '10px', fontWeight: '600', lineHeight: '1.2' }}
                  >
                    Copy
                  </button>
                  <span 
                    className="text-[#00cc00] font-bold animate-pulse"
                    style={{ fontSize: '11px', fontWeight: '700', lineHeight: '1.2' }}
                  >
                    Send Email
                  </span>
                </div>
              ) : (
                <button
                  onClick={() => openScheduleEmailModal(lead.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    clearScheduledEmail(lead.id);
                  }}
                  className="w-full px-2 py-1 text-xs border border-[#5a7fc7] rounded cursor-pointer hover:bg-[#f5f5f5] transition-colors"
                  title="Click to edit | Right-click to clear"
                >
                  {typeof scheduledEmailCountdown === 'object' ? (
                    <span 
                      style={{ 
                        fontFamily: 'var(--font-roboto-mono), monospace', 
                        fontSize: '11px',
                        color: '#5a7fc7',
                        fontWeight: '700'
                      }}
                    >
                      {scheduledEmailCountdown.days}D {scheduledEmailCountdown.time}
                    </span>
                  ) : null}
                </button>
              )
            ) : (
              <button
                onClick={() => openScheduleEmailModal(lead.id)}
                className="w-full px-1.5 py-0.5 text-xs border border-[#e5e5e5] rounded cursor-pointer hover:border-[#5a7fc7] hover:bg-[#f5f5f5] transition-colors text-[#6b6b6b]"
              >
                Schedule Email
              </button>
            )}
          </>
        );
      }

      case 'auto_text_frequency':
        const scheduledCountdown = scheduledTextCountdowns[lead.id];
        const hasScheduledText = lead.scheduled_text_time && lead.scheduled_text_content;
        
        return (
          <>
            {hasScheduledText ? (
              scheduledCountdown === 'READY' ? (
                <div 
                  className="border border-[#5a7fc7] rounded cursor-pointer hover:bg-[#f5f5f5] transition-colors"
                  onClick={() => openScheduleTextModal(lead.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    clearScheduledText(lead.id);
                  }}
                  title="Click to edit | Right-click to clear"
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '4px 8px',
                    width: 'fit-content',
                    margin: '0 auto'
                  }}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      copyTextToClipboard(lead.scheduled_text_content!);
                    }}
                    className="px-1.5 py-0.5 bg-[#5a7fc7] text-white rounded hover:bg-[#4a6fb7] transition-colors"
                    style={{ fontSize: '10px', fontWeight: '600', lineHeight: '1.2' }}
                  >
                    Copy
                  </button>
                  <span 
                    className="text-[#00cc00] font-bold animate-pulse"
                    style={{ fontSize: '11px', fontWeight: '700', lineHeight: '1.2' }}
                  >
                    Send Text
                  </span>
                </div>
              ) : (
                <button
                  onClick={() => openScheduleTextModal(lead.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    clearScheduledText(lead.id);
                  }}
                  className="w-full px-2 py-1 text-xs border border-[#5a7fc7] rounded cursor-pointer hover:bg-[#f5f5f5] transition-colors"
                  title="Click to edit | Right-click to clear"
                >
                  {typeof scheduledCountdown === 'object' ? (
                    <span 
                      style={{ 
                        fontFamily: 'var(--font-roboto-mono), monospace', 
                        fontSize: '11px',
                        color: '#5a7fc7',
                        fontWeight: '700'
                      }}
                    >
                      {scheduledCountdown.days}D {scheduledCountdown.time}
                    </span>
                  ) : (
                    <span className="text-[#6b6b6b]">Scheduled</span>
                  )}
                </button>
              )
            ) : (
              <button
                onClick={() => openScheduleTextModal(lead.id)}
                className="w-full px-1.5 py-0.5 text-xs border border-[#e5e5e5] rounded cursor-pointer hover:border-[#5a7fc7] hover:bg-[#f5f5f5] transition-colors text-[#999]"
              >
                Schedule Text
              </button>
            )}
            
            {showTextModal === lead.id && (
              <div 
                className="fixed inset-0 bg-black/20 flex items-center justify-center z-50 text-modal-container" 
                onClick={() => setShowTextModal(null)}
              >
                <div 
                  className="bg-white border-2 border-[#5a7fc7] rounded-md shadow-xl p-4 w-[300px]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <h3 className="text-sm font-medium text-[#1a1a1a] mb-3">Text Automation</h3>
                  <div className="mb-3">
                    <label className="block text-xs font-medium text-[#6b6b6b] mb-1">Frequency</label>
                    <select
                      value={lead.auto_text_frequency}
                      onChange={(e) => {
                        updateLead(lead.id, 'auto_text_frequency', e.target.value);
                        // If setting a frequency for the first time, set last_sent to now
                        if (e.target.value !== 'Off' && !lead.last_text_sent) {
                          updateLead(lead.id, 'last_text_sent', new Date().toISOString());
                        }
                      }}
                      className="w-full px-3 py-2 text-sm border border-[#e5e5e5] rounded"
                    >
                      {textFrequencies.map((freq, idx) => (
                        <option key={`text-${idx}`} value={freq.name}>{freq.name}</option>
                      ))}
                    </select>
                  </div>
                  {lead.auto_text_frequency !== 'Off' && (
                    <div className="mb-3">
                      <label className="block text-xs font-medium text-[#6b6b6b] mb-1">Template</label>
                      <select
                        value={lead.text_template_id || ''}
                        onChange={(e) => updateLead(lead.id, 'text_template_id', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-[#e5e5e5] rounded"
                      >
                        <option value="">Select template...</option>
                        {textTemplates.map((template) => (
                          <option key={template.id} value={template.id}>{template.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <button
                    onClick={() => setShowTextModal(null)}
                    className="w-full px-3 py-2 bg-[#1a1a1a] text-white rounded text-sm font-medium hover:bg-[#2a2a2a]"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </>
        );

      default: {
        const fieldValue = (lead[fieldKey] as any) || '-';
        const valueStr = String(fieldValue);
        const maxLength = 25;
        
        let displayValue: string;
        
        if (column.truncateText) {
          const plainText = stripMarkdown(valueStr);
          if (plainText.length > maxLength) {
            displayValue = plainText.substring(0, maxLength) + '...';
          } else {
            displayValue = valueStr;
          }
        } else {
          displayValue = valueStr;
        }
        
        return (
          <span 
            className="text-sm text-[#1a1a1a]" 
            title={column.truncateText && stripMarkdown(valueStr).length > maxLength ? valueStr : undefined}
          >
            {displayValue}
          </span>
        );
      }
    }
  };

  return (
    <>
      {/* Context Menu for Copy/Move Lead */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed bg-white border border-[#e5e5e5] rounded-md shadow-xl py-1 z-[100]"
          style={{
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
          }}
        >
          <button
            onClick={() => {
              setShowCopyMoveModal({ lead: contextMenu.lead, action: 'copy' });
              setContextMenu(null);
            }}
            className="w-full px-4 py-2 text-left text-sm text-[#1a1a1a] hover:bg-[#f5f5f5] transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4 text-[#5a7fc7]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Copy to Another Tab
          </button>
          <button
            onClick={() => {
              setShowCopyMoveModal({ lead: contextMenu.lead, action: 'move' });
              setContextMenu(null);
            }}
            className="w-full px-4 py-2 text-left text-sm text-[#1a1a1a] hover:bg-[#f5f5f5] transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4 text-[#5a7fc7]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
            Move to Another Tab
          </button>
        </div>
      )}

      {/* Expanded Text Modal */}
      {showExpandedTextModal && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" 
          onClick={() => setShowExpandedTextModal(null)}
        >
          <div 
            className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-[#1a1a1a] mb-4">
              {showExpandedTextModal.label}
            </h2>
            
            {/* Formatting Toolbar */}
            <div className="flex gap-2 mb-3 pb-3 border-b border-[#e5e5e5]">
              <button
                onClick={() => applyFormatting('bold')}
                className="px-3 py-1.5 border border-[#e5e5e5] rounded text-sm font-bold hover:bg-[#f5f5f5] transition-colors"
                title="Bold (wrap with **text**)"
              >
                B
              </button>
              <button
                onClick={() => applyFormatting('italic')}
                className="px-3 py-1.5 border border-[#e5e5e5] rounded text-sm italic hover:bg-[#f5f5f5] transition-colors"
                title="Italic (wrap with *text*)"
              >
                I
              </button>
              <div className="flex-1" />
              <span className="text-xs text-[#6b6b6b] self-center">
                Select text and click B or I to format
              </span>
            </div>
            
            <textarea
              ref={textAreaRef}
              value={showExpandedTextModal.value}
              onChange={(e) => setShowExpandedTextModal({ ...showExpandedTextModal, value: e.target.value })}
              className="w-full px-3 py-2 border border-[#e5e5e5] rounded-md text-sm min-h-[200px] resize-y font-mono"
              placeholder={`Enter ${showExpandedTextModal.label.toLowerCase()} here...\n\nFormatting:\n**bold text**\n*italic text*\nURLs are automatically clickable`}
              autoFocus
            />
            
            {/* Clickable Links Preview - Only shows extracted links */}
            {(() => {
              const urlRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)/gi;
              const matches = showExpandedTextModal.value.match(urlRegex);
              
              return matches && matches.length > 0 ? (
                <div className="mt-3 p-3 bg-[#f5f5f5] border border-[#e5e5e5] rounded-md">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-[#6b6b6b]">Links in this field ({matches.length})</span>
                    <span className="text-xs text-[#6b6b6b] italic">Click to open</span>
                  </div>
                  <div className="space-y-1.5">
                    {matches.map((url, idx) => {
                      const href = url.startsWith('http') ? url : `https://${url}`;
                      return (
                        <a
                          key={idx}
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-sm text-[#5a7fc7] underline hover:text-[#4a6fb7] truncate"
                          title={url}
                        >
                          {url}
                        </a>
                      );
                    })}
                  </div>
                </div>
              ) : null;
            })()}

            {/* File Attachments Section - Only show if column allows attachments */}
            {columns.find(c => c.field === showExpandedTextModal.field)?.allowAttachments && (
              <div className="mt-4 pt-4 border-t border-[#e5e5e5]">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-[#1a1a1a]">Attachments</h3>
                  <label className="px-3 py-1.5 bg-[#1a1a1a] text-white rounded text-xs font-medium hover:bg-[#2a2a2a] transition-colors cursor-pointer">
                    {uploadingFile ? 'Uploading...' : '+ Add File'}
                    <input
                      type="file"
                      className="hidden"
                      disabled={uploadingFile}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file && showExpandedTextModal) {
                          handleFileUpload(showExpandedTextModal.leadId, showExpandedTextModal.field, file);
                        }
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>

                {/* Drag and Drop Zone */}
                <div
                  onDrop={(e) => handleFileDrop(e, showExpandedTextModal.leadId, showExpandedTextModal.field)}
                  onDragOver={handleDragOver}
                  onDragEnter={handleDragEnter}
                  onDragLeave={handleDragLeave}
                  className={`mb-3 p-6 border-2 border-dashed rounded-lg transition-colors text-center ${
                    isDraggingFile 
                      ? 'border-[#5a7fc7] bg-[#f0f7ff]' 
                      : 'border-[#e5e5e5] bg-[#f9f9f9] hover:border-[#5a7fc7]'
                  }`}
                >
                  <svg 
                    className={`w-8 h-8 mx-auto mb-2 ${isDraggingFile ? 'text-[#5a7fc7]' : 'text-[#6b6b6b]'}`}
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className={`text-sm ${isDraggingFile ? 'text-[#5a7fc7] font-medium' : 'text-[#6b6b6b]'}`}>
                    {isDraggingFile ? 'Drop file here' : 'Drag and drop file here'}
                  </p>
                  <p className="text-xs text-[#999] mt-1">or click "+ Add File" above</p>
                </div>

                {/* File List */}
                {attachments.length > 0 ? (
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {attachments.map((attachment) => (
                      <div
                        key={attachment.id}
                        className="flex items-center justify-between p-2 bg-[#f5f5f5] rounded border border-[#e5e5e5]"
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <svg className="w-4 h-4 text-[#6b6b6b] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                          </svg>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-[#1a1a1a] truncate">{attachment.file_name}</p>
                            <p className="text-xs text-[#6b6b6b]">{formatFileSize(attachment.file_size)}</p>
                          </div>
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <button
                            onClick={() => handleFileDownload(attachment.id)}
                            className="p-1.5 hover:bg-[#e5e5e5] rounded transition-colors"
                            title="Download"
                          >
                            <svg className="w-4 h-4 text-[#1a1a1a]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleFileDelete(attachment.id)}
                            className="p-1.5 hover:bg-red-100 rounded transition-colors"
                            title="Delete"
                          >
                            <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[#6b6b6b] italic">No files attached</p>
                )}
              </div>
            )}

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowExpandedTextModal(null)}
                className="flex-1 px-4 py-2 border border-[#e5e5e5] text-[#1a1a1a] rounded-md text-sm font-medium hover:bg-[#f5f5f5] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (showExpandedTextModal) {
                    updateLead(showExpandedTextModal.leadId, showExpandedTextModal.field, showExpandedTextModal.value);
                    setShowExpandedTextModal(null);
                  }
                }}
                className="flex-1 px-4 py-2 bg-[#1a1a1a] text-white rounded-md text-sm font-medium hover:bg-[#2a2a2a] transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Timer Modal */}
      {showCustomTimerModal && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" 
          onClick={() => setShowCustomTimerModal(null)}
        >
          <div 
            className="bg-white rounded-lg p-6 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-[#1a1a1a] mb-4">Custom Timer</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#1a1a1a] mb-2">
                  End Date
                </label>
                <input
                  type="date"
                  value={customTimerDate}
                  onChange={(e) => setCustomTimerDate(e.target.value)}
                  className="w-full px-3 py-2 border border-[#e5e5e5] rounded-md text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1a1a1a] mb-2">
                  End Time
                </label>
                <input
                  type="time"
                  value={customTimerTime}
                  onChange={(e) => setCustomTimerTime(e.target.value)}
                  className="w-full px-3 py-2 border border-[#e5e5e5] rounded-md text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1a1a1a] mb-2">
                  Timer Color
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {timerColors.map((color) => (
                    <button
                      key={color.value}
                      type="button"
                      onClick={() => setSelectedTimerColor(color.value)}
                      className={`px-3 py-2 border-2 rounded-md text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${
                        selectedTimerColor === color.value 
                          ? 'border-[#1a1a1a] bg-[#f5f5f5]' 
                          : 'border-[#e5e5e5] hover:border-[#999]'
                      }`}
                    >
                      <span style={{ color: color.value, fontSize: '16px' }}>●</span>
                      <span>{color.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <p className="text-xs text-[#6b6b6b]">
                The countdown will expire at this exact date and time
              </p>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowCustomTimerModal(null)}
                className="flex-1 px-4 py-2 border border-[#e5e5e5] text-[#1a1a1a] rounded-md text-sm font-medium hover:bg-[#f5f5f5] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => showCustomTimerModal && handleCustomTimer(showCustomTimerModal)}
                className="flex-1 px-4 py-2 bg-[#1a1a1a] text-white rounded-md text-sm font-medium hover:bg-[#2a2a2a] transition-colors"
              >
                Set Timer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Timer Color Modal */}
      {showTimerColorModal && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" 
          onClick={() => setShowTimerColorModal(null)}
        >
          <div 
            className="bg-white rounded-lg p-6 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-[#1a1a1a] mb-4">Timer Color</h2>
            
            <p className="text-sm text-[#6b6b6b] mb-4">
              Choose a color for this timer countdown
            </p>

            <div className="grid grid-cols-2 gap-3 mb-6">
              {timerColors.map((color) => (
                <button
                  key={color.value}
                  onClick={() => handleTimerColorChange(showTimerColorModal, color.value)}
                  className="px-4 py-3 border-2 border-[#e5e5e5] rounded-lg text-sm font-medium hover:border-[#1a1a1a] transition-colors flex items-center gap-2"
                >
                  <span style={{ color: color.value, fontSize: '20px' }}>●</span>
                  <span>{color.name}</span>
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowTimerColorModal(null)}
              className="w-full px-4 py-2 border border-[#e5e5e5] text-[#1a1a1a] rounded-md text-sm font-medium hover:bg-[#f5f5f5] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Display Date Modal */}
      {showDisplayDateModal && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" 
          onClick={() => setShowDisplayDateModal(null)}
        >
          <div 
            className="bg-white rounded-lg p-6 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-[#1a1a1a] mb-4">Display Date</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#1a1a1a] mb-2">
                  Date to Display
                </label>
                <input
                  type="date"
                  value={displayDate}
                  onChange={(e) => setDisplayDate(e.target.value)}
                  className="w-full px-3 py-2 border border-[#e5e5e5] rounded-md text-sm"
                />
              </div>

              <p className="text-xs text-[#6b6b6b]">
                This date will be shown in the timer column without any countdown
              </p>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowDisplayDateModal(null)}
                className="flex-1 px-4 py-2 border border-[#e5e5e5] text-[#1a1a1a] rounded-md text-sm font-medium hover:bg-[#f5f5f5] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => showDisplayDateModal && handleDisplayDate(showDisplayDateModal)}
                className="flex-1 px-4 py-2 bg-[#1a1a1a] text-white rounded-md text-sm font-medium hover:bg-[#2a2a2a] transition-colors"
              >
                Set Date
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Text Modal */}
      {showScheduleTextModal && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" 
          onClick={() => {
            setShowScheduleTextModal(null);
            setSelectedTextTemplate('');
          }}
        >
          <div 
            className="bg-white rounded-lg p-6 max-w-lg w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-[#1a1a1a] mb-4">Schedule Text Message</h2>
            
            <div className="space-y-4">
              {/* Template Selection */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-[#1a1a1a]">
                    Load Template (Optional)
                  </label>
                  <button
                    onClick={() => setShowTextTemplateManager(true)}
                    className="text-xs text-[#5a7fc7] hover:text-[#4a6fb7] font-medium"
                  >
                    + Manage Templates
                  </button>
                </div>
                <select
                  value={selectedTextTemplate}
                  onChange={(e) => {
                    setSelectedTextTemplate(e.target.value);
                    const template = savedTextTemplates.find(t => t.id === e.target.value);
                    if (template) {
                      setScheduledTextContent(template.body);
                    }
                  }}
                  className="w-full px-3 py-2 border border-[#e5e5e5] rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#5a7fc7] focus:border-[#5a7fc7]"
                >
                  <option value="">Choose a template or write your own...</option>
                  {savedTextTemplates.map((template) => (
                    <option key={template.id} value={template.id}>{template.name}</option>
                  ))}
                </select>
              </div>

              {/* Text Message Content */}
              <div>
                <label className="block text-sm font-medium text-[#1a1a1a] mb-2">
                  Message Content
                </label>
                <textarea
                  value={scheduledTextContent}
                  onChange={(e) => setScheduledTextContent(e.target.value)}
                  placeholder="Enter your text message here or select a template above..."
                  rows={6}
                  className="w-full px-3 py-2 border border-[#e5e5e5] rounded-md text-sm resize-none focus:outline-none focus:ring-1 focus:ring-[#5a7fc7] focus:border-[#5a7fc7]"
                />
                <div className="flex justify-between mt-1">
                  <span className="text-xs text-[#6b6b6b]">
                    {scheduledTextContent.length} characters
                  </span>
                  {scheduledTextContent.length > 160 && (
                    <span className="text-xs text-[#ff8800]">
                      {Math.ceil(scheduledTextContent.length / 160)} SMS segments
                    </span>
                  )}
                </div>
              </div>

              {/* Date and Time Selection */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-[#1a1a1a] mb-2">
                    Send Date
                  </label>
                  <input
                    type="date"
                    value={scheduledTextDate}
                    onChange={(e) => setScheduledTextDate(e.target.value)}
                    className="w-full px-3 py-2 border border-[#e5e5e5] rounded-md text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1a1a1a] mb-2">
                    Send Time
                  </label>
                  <input
                    type="time"
                    value={scheduledTextTime}
                    onChange={(e) => setScheduledTextTime(e.target.value)}
                    className="w-full px-3 py-2 border border-[#e5e5e5] rounded-md text-sm"
                  />
                </div>
              </div>

              {/* Frequency Selection */}
              <div>
                <label className="block text-sm font-medium text-[#1a1a1a] mb-2">
                  Repeat Frequency
                </label>
                <select
                  value={scheduledTextFrequency}
                  onChange={(e) => setScheduledTextFrequency(e.target.value)}
                  className="w-full px-3 py-2 border border-[#e5e5e5] rounded-md text-sm"
                >
                  <option value="once">Send Once</option>
                  <option value="daily">Daily</option>
                  <option value="every2days">Every 2 Days</option>
                  <option value="every3days">Every 3 Days</option>
                  <option value="weekly">Weekly</option>
                  <option value="every2weeks">Every 2 Weeks</option>
                  <option value="monthly">Monthly</option>
                </select>
                <p className="text-xs text-[#6b6b6b] mt-1">
                  {scheduledTextFrequency === 'once' 
                    ? 'Message will be sent once at the specified time' 
                    : `Message will repeat ${scheduledTextFrequency.replace('every', 'every ')} after initial send`}
                </p>
              </div>

              {/* Info Box */}
              <div className="bg-[#f0f7ff] border border-[#5a7fc7] rounded-lg p-3 text-xs text-[#1a1a1a]">
                <p className="font-semibold mb-1">📋 Manual Send (Until Twilio Approved):</p>
                <p>When time is ready, click "Copy Text" to paste into your phone manually. After Twilio approval, messages will send automatically.</p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowScheduleTextModal(null);
                  setSelectedTextTemplate('');
                }}
                className="flex-1 px-4 py-2 border border-[#e5e5e5] text-[#1a1a1a] rounded-md text-sm font-medium hover:bg-[#f5f5f5] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => showScheduleTextModal && handleScheduleText(showScheduleTextModal)}
                className="flex-1 px-4 py-2 bg-[#5a7fc7] text-white rounded-md text-sm font-medium hover:bg-[#4a6fb7] transition-colors"
              >
                Schedule Text
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Email Modal */}
      {showScheduleEmailModal && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" 
          onClick={() => setShowScheduleEmailModal(null)}
        >
          <div 
            className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-[#1a1a1a] mb-4">Schedule Email</h2>
            
            <div className="space-y-4">
              {/* Template Selection */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-[#1a1a1a]">
                    Select Email Template *
                  </label>
                  <button
                    onClick={() => setShowTemplateManager(true)}
                    className="text-xs text-[#5a7fc7] hover:text-[#4a6fb7] font-medium"
                  >
                    + Manage Templates
                  </button>
                </div>
                <select
                  value={selectedEmailTemplate}
                  onChange={(e) => setSelectedEmailTemplate(e.target.value)}
                className="w-full px-3 py-2 border border-[#e5e5e5] rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#5a7fc7] focus:border-[#5a7fc7]"
              >
                <option value="">Choose a template...</option>
                {savedEmailTemplates.map((template) => (
                  <option key={template.id} value={template.id}>{template.name}</option>
                ))}
              </select>
              </div>

            {/* Email Preview */}
            {selectedEmailTemplate && (() => {
              const template = savedEmailTemplates.find(t => t.id === selectedEmailTemplate);
              const currentLead = showScheduleEmailModal ? leads.find(l => l.id === showScheduleEmailModal) : null;
              
              return template ? (
                editingInScheduleModal && editingTemplate?.id === template.id ? (
                  /* Inline Editor */
                  <div className="border border-[#e5e5e5] rounded-lg p-4 bg-[#f5f5f5]">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-xs font-medium text-[#6b6b6b]">Edit Template:</div>
                      <button
                        onClick={() => setEditingInScheduleModal(false)}
                        className="text-xs text-[#5a7fc7] hover:text-[#4a6fb7]"
                      >
                        Done Editing
                      </button>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs text-[#6b6b6b] mb-1">Subject</label>
                        <input
                          type="text"
                          value={templateSubject}
                          onChange={(e) => setTemplateSubject(e.target.value)}
                          className="w-full px-3 py-2 border border-[#e5e5e5] rounded-md text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-[#6b6b6b] mb-1">Body</label>
                        {/* Formatting Toolbar */}
                        <div className="flex gap-2 mb-2">
                          <button
                            type="button"
                            onClick={insertBold}
                            className="px-3 py-1 bg-white border border-[#e5e5e5] rounded text-xs font-bold hover:bg-[#f5f5f5]"
                            title="Bold (wrap text in <strong> tags)"
                          >
                            B
                          </button>
                          <button
                            type="button"
                            onClick={insertImage}
                            className="px-3 py-1 bg-white border border-[#e5e5e5] rounded text-xs hover:bg-[#f5f5f5]"
                            title="Insert image"
                          >
                            🖼️ Image
                          </button>
                          <div className="relative group">
                            <button
                              type="button"
                              className="px-3 py-1 bg-white border border-[#e5e5e5] rounded text-xs hover:bg-[#f5f5f5]"
                              title="Insert dynamic field"
                            >
                              + Field ▼
                            </button>
                            <div className="absolute left-0 mt-1 bg-white border border-[#e5e5e5] rounded-md shadow-lg z-10 hidden group-hover:block min-w-[150px]">
                              <button
                                type="button"
                                onClick={() => insertPlaceholder('firstName')}
                                className="block w-full text-left px-3 py-2 text-xs hover:bg-[#f5f5f5]"
                              >
                                First Name
                              </button>
                              <button
                                type="button"
                                onClick={() => insertPlaceholder('name')}
                                className="block w-full text-left px-3 py-2 text-xs hover:bg-[#f5f5f5]"
                              >
                                Full Name
                              </button>
                              <button
                                type="button"
                                onClick={() => insertPlaceholder('company')}
                                className="block w-full text-left px-3 py-2 text-xs hover:bg-[#f5f5f5]"
                              >
                                Company
                              </button>
                              <button
                                type="button"
                                onClick={() => insertPlaceholder('email')}
                                className="block w-full text-left px-3 py-2 text-xs hover:bg-[#f5f5f5]"
                              >
                                Email
                              </button>
                              <button
                                type="button"
                                onClick={() => insertPlaceholder('phone')}
                                className="block w-full text-left px-3 py-2 text-xs hover:bg-[#f5f5f5]"
                              >
                                Phone
                              </button>
                            </div>
                          </div>
                        </div>
                        <textarea
                          ref={textareaRef}
                          value={templateBody}
                          onChange={(e) => setTemplateBody(e.target.value)}
                          rows={10}
                          className="w-full px-3 py-2 border border-[#e5e5e5] rounded-md text-sm font-mono resize-y"
                        />
                        <p className="text-xs text-[#6b6b6b] mt-1">Use HTML tags: &lt;strong&gt;bold&lt;/strong&gt; or &lt;img src="url"&gt;</p>
                      </div>
                      <button
                        onClick={handleSaveTemplate}
                        disabled={!templateName.trim() || !templateSubject.trim() || !templateBody.trim()}
                        className="w-full px-4 py-2 bg-[#5a7fc7] text-white rounded-md text-sm font-medium hover:bg-[#4a6fb7] transition-colors disabled:opacity-50"
                      >
                        Save Changes
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Preview Mode */
                  <div className="border border-[#e5e5e5] rounded-lg p-4 bg-[#f5f5f5]">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-xs font-medium text-[#6b6b6b]">
                        {currentLead ? 'Email Preview with Lead Data:' : 'Email Preview:'}
                      </div>
                      <button
                        onClick={() => editTemplateFromScheduleModal(template)}
                        className="text-xs text-[#5a7fc7] hover:text-[#4a6fb7] font-medium"
                      >
                        ✏️ Edit Template
                      </button>
                    </div>
                    <div className="bg-white rounded p-3 space-y-3">
                      <div>
                        <span className="text-xs font-semibold text-[#6b6b6b]">Subject:</span>
                        {currentLead ? (
                          <p className="text-sm text-[#1a1a1a] mt-1">{replacePlaceholders(template.subject, currentLead)}</p>
                        ) : (
                          <div 
                            className="text-sm text-[#1a1a1a] mt-1" 
                            dangerouslySetInnerHTML={{ __html: replacePlaceholdersWithExamples(template.subject) }}
                          />
                        )}
                      </div>
                      <div className="border-t border-[#e5e5e5] pt-3">
                        <span className="text-xs font-semibold text-[#6b6b6b]">Body:</span>
                        {currentLead ? (
                          <div 
                            className="text-sm text-[#1a1a1a] mt-1" 
                            dangerouslySetInnerHTML={{ __html: replacePlaceholders(template.body, currentLead).replace(/\n/g, '<br/>') }}
                          />
                        ) : (
                          <div 
                            className="text-sm text-[#1a1a1a] mt-1" 
                            dangerouslySetInnerHTML={{ __html: replacePlaceholdersWithExamples(template.body).replace(/\n/g, '<br/>') }}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                )
              ) : null;
            })()}

              {/* Send Options */}
              <div className="border-t border-[#e5e5e5] pt-4">
                <h3 className="text-sm font-medium text-[#1a1a1a] mb-3">Sending Options</h3>
                
                {/* Send Now Button */}
                <button
                  onClick={() => showScheduleEmailModal && handleScheduleEmail(showScheduleEmailModal, true)}
                  disabled={!selectedEmailTemplate}
                  className="w-full px-4 py-3 bg-[#00cc00] text-white rounded-md text-sm font-medium hover:bg-[#00b300] transition-colors mb-3 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  📨 Send Now (Copy & Paste)
                </button>

                <div className="text-center text-xs text-[#6b6b6b] mb-3">— OR —</div>

                {/* Schedule for Later */}
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-[#1a1a1a]">
                    Schedule for Later
                  </label>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-[#6b6b6b] mb-1">Date</label>
                      <input
                        type="date"
                        value={scheduledEmailDate}
                        onChange={(e) => setScheduledEmailDate(e.target.value)}
                        className="w-full px-3 py-2 border border-[#e5e5e5] rounded-md text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[#6b6b6b] mb-1">Time</label>
                      <input
                        type="time"
                        value={scheduledEmailTime}
                        onChange={(e) => setScheduledEmailTime(e.target.value)}
                        className="w-full px-3 py-2 border border-[#e5e5e5] rounded-md text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-[#6b6b6b] mb-1">Frequency</label>
                    <select
                      value={scheduledEmailFrequency}
                      onChange={(e) => setScheduledEmailFrequency(e.target.value)}
                      className="w-full px-3 py-2 border border-[#e5e5e5] rounded-md text-sm"
                    >
                      <option value="once">Once</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                    <p className="text-xs text-[#6b6b6b] mt-1">
                      {scheduledEmailFrequency === 'once' 
                        ? 'Email will be sent once at the specified time' 
                        : `Email will repeat ${scheduledEmailFrequency} after initial send`}
                    </p>
                  </div>
                </div>
              </div>

              {/* Info Box */}
              <div className="bg-[#f0f7ff] border border-[#5a7fc7] rounded-lg p-3 text-xs text-[#1a1a1a]">
                <p className="font-semibold mb-1">📋 Manual Send (Until Email Connected):</p>
                <p>When ready, click "Copy" to get the email content. Paste into your email client manually. After email service is connected, emails will send automatically.</p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowScheduleEmailModal(null)}
                className="flex-1 px-4 py-2 border border-[#e5e5e5] text-[#1a1a1a] rounded-md text-sm font-medium hover:bg-[#f5f5f5] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => showScheduleEmailModal && handleScheduleEmail(showScheduleEmailModal, false)}
                disabled={!selectedEmailTemplate || !scheduledEmailDate}
                className="flex-1 px-4 py-2 bg-[#5a7fc7] text-white rounded-md text-sm font-medium hover:bg-[#4a6fb7] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Schedule Email
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Email Template Manager Modal */}
      {showTemplateManager && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]" 
          onClick={() => {
            setShowTemplateManager(false);
            setEditingTemplate(null);
            setTemplateName('');
            setTemplateSubject('');
            setTemplateBody('');
          }}
        >
          <div 
            className="bg-white rounded-lg p-6 max-w-7xl w-full mx-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-[#1a1a1a] mb-4">
              {editingTemplate ? 'Edit Email Template' : 'Manage Email Templates'}
            </h2>

            {/* Template Form */}
            <div className="bg-[#f5f5f5] border border-[#e5e5e5] rounded-lg p-4 mb-4">
              <h3 className="text-sm font-medium text-[#1a1a1a] mb-3">
                {editingTemplate ? 'Edit Template' : 'Create New Template'}
              </h3>
              <div className="grid grid-cols-2 gap-6">
                {/* Left Side - Form Inputs */}
                <div className="space-y-3 flex flex-col">
                  <div>
                    <label className="block text-xs text-[#6b6b6b] mb-1">Template Name *</label>
                    <input
                      type="text"
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                      placeholder="e.g., Follow Up Email"
                      className="w-full px-3 py-2 border border-[#e5e5e5] rounded-md text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#6b6b6b] mb-1">Email Subject *</label>
                    <input
                      type="text"
                      value={templateSubject}
                      onChange={(e) => setTemplateSubject(e.target.value)}
                      placeholder="e.g., Following up on our conversation"
                      className="w-full px-3 py-2 border border-[#e5e5e5] rounded-md text-sm"
                    />
                  </div>
                  <div className="flex-1 flex flex-col">
                    <label className="block text-xs text-[#6b6b6b] mb-1">Email Body *</label>
                    {/* Formatting Toolbar */}
                    <div className="flex gap-2 mb-2">
                      <button
                        type="button"
                        onClick={insertBold}
                        className="px-3 py-1 bg-white border border-[#e5e5e5] rounded text-xs font-bold hover:bg-[#f5f5f5] transition-colors"
                        title="Bold - Select text and click, or inserts <strong> tags"
                      >
                        <strong>B</strong>
                      </button>
                      <button
                        type="button"
                        onClick={insertImage}
                        className="px-3 py-1 bg-white border border-[#e5e5e5] rounded text-xs hover:bg-[#f5f5f5] transition-colors"
                        title="Insert image from URL"
                      >
                        🖼️ Image
                      </button>
                      <div className="relative group">
                        <button
                          type="button"
                          className="px-3 py-1 bg-white border border-[#e5e5e5] rounded text-xs hover:bg-[#f5f5f5] transition-colors"
                          title="Insert dynamic field"
                        >
                          + Field ▼
                        </button>
                        <div className="absolute left-0 mt-1 bg-white border border-[#e5e5e5] rounded-md shadow-lg z-10 hidden group-hover:block min-w-[150px]">
                          <button
                            type="button"
                            onClick={() => insertPlaceholder('firstName')}
                            className="block w-full text-left px-3 py-2 text-xs hover:bg-[#f5f5f5]"
                          >
                            First Name
                          </button>
                          <button
                            type="button"
                            onClick={() => insertPlaceholder('name')}
                            className="block w-full text-left px-3 py-2 text-xs hover:bg-[#f5f5f5]"
                          >
                            Full Name
                          </button>
                          <button
                            type="button"
                            onClick={() => insertPlaceholder('company')}
                            className="block w-full text-left px-3 py-2 text-xs hover:bg-[#f5f5f5]"
                          >
                            Company
                          </button>
                          <button
                            type="button"
                            onClick={() => insertPlaceholder('email')}
                            className="block w-full text-left px-3 py-2 text-xs hover:bg-[#f5f5f5]"
                          >
                            Email
                          </button>
                          <button
                            type="button"
                            onClick={() => insertPlaceholder('phone')}
                            className="block w-full text-left px-3 py-2 text-xs hover:bg-[#f5f5f5]"
                          >
                            Phone
                          </button>
                        </div>
                      </div>
                      <span className="text-xs text-[#6b6b6b] flex items-center ml-2">
                        Use {'{{'} firstName {'}}'}  for dynamic fields
                      </span>
                    </div>
                    <textarea
                      ref={textareaRef}
                      value={templateBody}
                      onChange={(e) => setTemplateBody(e.target.value)}
                      placeholder="Enter your email content here... Use <strong>text</strong> for bold"
                      className="flex-1 min-h-[500px] px-3 py-2 border border-[#e5e5e5] rounded-md text-sm resize-none font-mono"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveTemplate}
                      disabled={!templateName.trim() || !templateSubject.trim() || !templateBody.trim()}
                      className="flex-1 px-4 py-2 bg-[#5a7fc7] text-white rounded-md text-sm font-medium hover:bg-[#4a6fb7] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {editingTemplate ? 'Update Template' : 'Save Template'}
                    </button>
                    {editingTemplate && (
                      <button
                        onClick={() => {
                          setEditingTemplate(null);
                          setTemplateName('');
                          setTemplateSubject('');
                          setTemplateBody('');
                        }}
                        className="px-4 py-2 border border-[#e5e5e5] text-[#1a1a1a] rounded-md text-sm font-medium hover:bg-[#f5f5f5] transition-colors"
                      >
                        Cancel Edit
                      </button>
                    )}
                  </div>
                </div>

                {/* Right Side - Full Email Preview */}
                <div className="flex flex-col">
                  <label className="block text-xs text-[#6b6b6b] mb-1">Live Email Preview</label>
                  <div className="bg-white border-2 border-[#d4d4d4] rounded-md shadow-lg flex-1 overflow-hidden flex flex-col">
                    {/* Email Header */}
                    <div className="border-b border-[#e5e5e5] p-4 bg-[#f9f9f9]">
                      <div className="space-y-2 text-sm">
                        <div className="flex">
                          <span className="text-[#6b6b6b] font-medium w-16 flex-shrink-0">From:</span>
                          <span className="text-[#1a1a1a]">you@gostwrk.io</span>
                        </div>
                        <div className="flex">
                          <span className="text-[#6b6b6b] font-medium w-16 flex-shrink-0">To:</span>
                          <span className="text-[#1a1a1a]">recipient@example.com</span>
                        </div>
                        <div className="flex">
                          <span className="text-[#6b6b6b] font-medium w-16 flex-shrink-0">Subject:</span>
                          <span className="text-[#1a1a1a] font-semibold">
                            {templateSubject ? (
                              <span dangerouslySetInnerHTML={{ __html: replacePlaceholdersWithExamples(templateSubject) }} />
                            ) : (
                              <span className="text-[#999] italic font-normal">Your email subject...</span>
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                    {/* Email Body - 8.5x11 proportions */}
                    <div className="flex-1 p-8 overflow-y-auto bg-white">
                      {templateBody ? (
                        <div 
                          className="text-sm text-[#1a1a1a] leading-relaxed"
                          style={{ 
                            fontFamily: 'system-ui, -apple-system, sans-serif',
                            minHeight: '600px',
                            maxWidth: '100%',
                            wordWrap: 'break-word'
                          }}
                          dangerouslySetInnerHTML={{ __html: replacePlaceholdersWithExamples(templateBody).replace(/\n/g, '<br/>') }}
                        />
                      ) : (
                        <div 
                          className="text-sm text-[#999] italic leading-relaxed"
                          style={{ minHeight: '600px' }}
                        >
                          Your email content will appear here as you type...
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

          {/* Saved Templates List */}
          <div>
            <h3 className="text-sm font-medium text-[#1a1a1a] mb-3">
              Saved Templates ({savedEmailTemplates.length})
            </h3>
            {savedEmailTemplates.length > 0 ? (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {savedEmailTemplates.map((template) => (
                    <div 
                      key={template.id} 
                      className="bg-white border border-[#e5e5e5] rounded-lg p-3"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <h4 className="text-sm font-medium text-[#1a1a1a]">{template.name}</h4>
                          <p className="text-xs text-[#6b6b6b] mt-1">
                            <span className="font-semibold">Subject:</span> {template.subject}
                          </p>
                        </div>
                        <div className="flex gap-2 ml-2">
                          <button
                            onClick={() => handleEditTemplate(template)}
                            className="text-[#5a7fc7] hover:text-[#4a6fb7] transition-colors"
                            title="Edit template"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDeleteTemplate(template.id)}
                            className="text-[#999] hover:text-[#8a2a2a] transition-colors"
                            title="Delete template"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-[#6b6b6b] line-clamp-2">{template.body}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[#6b6b6b] italic text-center py-8">
                  No templates yet. Click "Manage Templates" to create one.
                </p>
              )}
            </div>

            <div className="mt-6">
              <button
                onClick={() => {
                  setShowTemplateManager(false);
                  setEditingTemplate(null);
                  setTemplateName('');
                  setTemplateSubject('');
                  setTemplateBody('');
                }}
                className="w-full px-4 py-2 border border-[#e5e5e5] text-[#1a1a1a] rounded-md text-sm font-medium hover:bg-[#f5f5f5] transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Text Template Manager Modal */}
      {showTextTemplateManager && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]" 
          onClick={() => {
            setShowTextTemplateManager(false);
            setEditingTextTemplate(null);
            setTextTemplateName('');
            setTextTemplateBody('');
          }}
        >
          <div 
            className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-[#1a1a1a] mb-4">
              {editingTextTemplate ? 'Edit Text Template' : 'Manage Text Templates'}
            </h2>

            {/* Template Form */}
            <div className="bg-[#f5f5f5] border border-[#e5e5e5] rounded-lg p-4 mb-4">
              <h3 className="text-sm font-medium text-[#1a1a1a] mb-3">
                {editingTextTemplate ? 'Edit Template' : 'Create New Template'}
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-[#6b6b6b] mb-1">Template Name *</label>
                  <input
                    type="text"
                    value={textTemplateName}
                    onChange={(e) => setTextTemplateName(e.target.value)}
                    placeholder="e.g., Follow Up Text"
                    className="w-full px-3 py-2 border border-[#e5e5e5] rounded-md text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#6b6b6b] mb-1">Message Content *</label>
                  <textarea
                    value={textTemplateBody}
                    onChange={(e) => setTextTemplateBody(e.target.value)}
                    placeholder="Enter your text message template here..."
                    rows={6}
                    className="w-full px-3 py-2 border border-[#e5e5e5] rounded-md text-sm resize-y"
                  />
                  <div className="flex justify-between mt-1">
                    <span className="text-xs text-[#6b6b6b]">
                      {textTemplateBody.length} characters
                    </span>
                    {textTemplateBody.length > 160 && (
                      <span className="text-xs text-[#ff8800]">
                        {Math.ceil(textTemplateBody.length / 160)} SMS segments
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveTextTemplate}
                    disabled={!textTemplateName.trim() || !textTemplateBody.trim()}
                    className="flex-1 px-4 py-2 bg-[#5a7fc7] text-white rounded-md text-sm font-medium hover:bg-[#4a6fb7] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {editingTextTemplate ? 'Update Template' : 'Save Template'}
                  </button>
                  {editingTextTemplate && (
                    <button
                      onClick={() => {
                        setEditingTextTemplate(null);
                        setTextTemplateName('');
                        setTextTemplateBody('');
                      }}
                      className="px-4 py-2 border border-[#e5e5e5] text-[#1a1a1a] rounded-md text-sm font-medium hover:bg-[#f5f5f5] transition-colors"
                    >
                      Cancel Edit
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Saved Templates List */}
            <div>
              <h3 className="text-sm font-medium text-[#1a1a1a] mb-3">
                Saved Templates ({savedTextTemplates.length})
              </h3>
              {savedTextTemplates.length > 0 ? (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {savedTextTemplates.map((template) => (
                    <div 
                      key={template.id} 
                      className="bg-white border border-[#e5e5e5] rounded-lg p-3"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <h4 className="text-sm font-medium text-[#1a1a1a]">{template.name}</h4>
                        </div>
                        <div className="flex gap-2 ml-2">
                          <button
                            onClick={() => handleEditTextTemplate(template)}
                            className="text-[#5a7fc7] hover:text-[#4a6fb7] transition-colors"
                            title="Edit template"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDeleteTextTemplate(template.id)}
                            className="text-[#999] hover:text-[#8a2a2a] transition-colors"
                            title="Delete template"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-[#6b6b6b] line-clamp-2">{template.body}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[#6b6b6b] italic text-center py-8">
                  No templates yet. Create one to get started.
                </p>
              )}
            </div>

            <div className="mt-6">
              <button
                onClick={() => {
                  setShowTextTemplateManager(false);
                  setEditingTextTemplate(null);
                  setTextTemplateName('');
                  setTextTemplateBody('');
                }}
                className="w-full px-4 py-2 border border-[#e5e5e5] text-[#1a1a1a] rounded-md text-sm font-medium hover:bg-[#f5f5f5] transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Copy/Move Lead Modal */}
      {showCopyMoveModal && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" 
          onClick={() => {
            setShowCopyMoveModal(null);
            setSelectedDestinationMonth('');
          }}
        >
          <div 
            className="bg-white rounded-lg p-6 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-[#1a1a1a] mb-4">
              {showCopyMoveModal.action === 'copy' ? 'Copy' : 'Move'} Lead: {showCopyMoveModal.lead.name}
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#1a1a1a] mb-2">
                  Select Destination Tab
                </label>
                <select
                  value={selectedDestinationMonth}
                  onChange={(e) => setSelectedDestinationMonth(e.target.value)}
                  className="w-full px-3 py-2 border border-[#e5e5e5] rounded-md text-sm"
                >
                  <option value="">Choose a tab...</option>
                  {availableMonths?.map((month) => (
                    <option 
                      key={`tab-${month.monthKey}`} 
                      value={month.monthKey}
                      disabled={month.monthKey === monthKey}
                    >
                      {month.customName} {month.monthKey === monthKey ? '(current)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="bg-[#f0f7ff] border border-[#5a7fc7] rounded-lg p-3 text-xs text-[#1a1a1a]">
                {showCopyMoveModal.action === 'copy' ? (
                  <>
                    <p className="font-semibold mb-1">📋 Copy Lead:</p>
                    <p>Creates a duplicate of this lead in the selected tab. The original lead remains in the current tab.</p>
                  </>
                ) : (
                  <>
                    <p className="font-semibold mb-1">➡️ Move Lead:</p>
                    <p>Moves this lead to the selected tab. It will be removed from the current tab.</p>
                  </>
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowCopyMoveModal(null);
                  setSelectedDestinationMonth('');
                }}
                className="flex-1 px-4 py-2 border border-[#e5e5e5] text-[#1a1a1a] rounded-md text-sm font-medium hover:bg-[#f5f5f5] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!selectedDestinationMonth) {
                    alert('Please select a destination month');
                    return;
                  }
                  if (showCopyMoveModal.action === 'copy') {
                    handleCopyLead(showCopyMoveModal.lead, selectedDestinationMonth);
                  } else {
                    handleMoveLead(showCopyMoveModal.lead, selectedDestinationMonth);
                  }
                }}
                disabled={!selectedDestinationMonth}
                className="flex-1 px-4 py-2 bg-[#5a7fc7] text-white rounded-md text-sm font-medium hover:bg-[#4a6fb7] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {showCopyMoveModal.action === 'copy' ? 'Copy to Tab' : 'Move to Tab'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Contact History Modal */}
      {showContactHistoryModal && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" 
          onClick={() => setShowContactHistoryModal(null)}
        >
          <div 
            className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-[#1a1a1a] mb-4">
              Contact History - {showContactHistoryModal.leadName}
            </h2>

            {/* Add New Contact Form */}
            <div className="bg-[#f5f5f5] border border-[#e5e5e5] rounded-lg p-4 mb-4">
              <h3 className="text-sm font-medium text-[#1a1a1a] mb-3">Add New Contact</h3>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs text-[#6b6b6b] mb-1">Date</label>
                  <input
                    type="date"
                    value={newContactDate}
                    onChange={(e) => setNewContactDate(e.target.value)}
                    className="w-full px-3 py-2 border border-[#e5e5e5] rounded-md text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#6b6b6b] mb-1">Time</label>
                  <input
                    type="time"
                    value={newContactTime}
                    onChange={(e) => setNewContactTime(e.target.value)}
                    className="w-full px-3 py-2 border border-[#e5e5e5] rounded-md text-sm"
                  />
                </div>
              </div>
              <div className="mb-3">
                <label className="block text-xs text-[#6b6b6b] mb-1">Notes (optional)</label>
                <textarea
                  value={newContactNotes}
                  onChange={(e) => setNewContactNotes(e.target.value)}
                  placeholder="Add notes about this contact..."
                  className="w-full px-3 py-2 border border-[#e5e5e5] rounded-md text-sm min-h-[60px] resize-y"
                />
              </div>
              <button
                onClick={handleAddContact}
                disabled={!newContactDate || !newContactTime}
                className="w-full px-4 py-2 bg-[#5a7fc7] text-white rounded-md text-sm font-medium hover:bg-[#4a6fb7] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add Contact
              </button>
            </div>

            {/* Contact History List */}
            <div>
              <h3 className="text-sm font-medium text-[#1a1a1a] mb-3">Previous Contacts ({contactHistory.length})</h3>
              {contactHistory.length > 0 ? (
                <div className="space-y-2">
                  {contactHistory.map((contact) => {
                    const date = new Date(contact.contact_date);
                    const dateStr = date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' });
                    const hour = date.getHours();
                    const isPM = hour >= 12;
                    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
                    const minute = String(date.getMinutes()).padStart(2, '0');
                    const timeStr = `${displayHour}:${minute}${isPM ? 'pm' : 'am'}`;
                    
                    return (
                      <div 
                        key={contact.id} 
                        className="bg-white border border-[#e5e5e5] rounded-lg p-3 hover:bg-[#f5f5f5] transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-medium text-[#1a1a1a]">
                                {dateStr} {timeStr}
                              </span>
                            </div>
                            {contact.notes && (
                              <p className="text-sm text-[#6b6b6b] mt-1">{contact.notes}</p>
                            )}
                          </div>
                          <button
                            onClick={() => handleDeleteContact(contact.id)}
                            className="text-[#999] hover:text-[#8a2a2a] transition-colors ml-2"
                            title="Delete contact"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-[#6b6b6b] italic text-center py-8">No contact history yet</p>
              )}
            </div>

            <div className="mt-6">
              <button
                onClick={() => setShowContactHistoryModal(null)}
                className="w-full px-4 py-2 border border-[#e5e5e5] text-[#1a1a1a] rounded-md text-sm font-medium hover:bg-[#f5f5f5] transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Lead Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAddModal(false)}>
          <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-[#1a1a1a] mb-6">Add New Lead</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#1a1a1a] mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  value={newLead.name}
                  onChange={(e) => setNewLead({ ...newLead, name: e.target.value })}
                  className="w-full px-3 py-2 border border-[#e5e5e5] rounded-md text-sm"
                  placeholder="John Doe"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1a1a1a] mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  value={newLead.email}
                  onChange={(e) => setNewLead({ ...newLead, email: e.target.value })}
                  className="w-full px-3 py-2 border border-[#e5e5e5] rounded-md text-sm"
                  placeholder="john@company.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1a1a1a] mb-1">
                  Phone
                </label>
                <input
                  type="tel"
                  value={newLead.phone}
                  onChange={(e) => setNewLead({ ...newLead, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-[#e5e5e5] rounded-md text-sm"
                  placeholder="+1234567890"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1a1a1a] mb-1">
                  Company
                </label>
                <input
                  type="text"
                  value={newLead.company}
                  onChange={(e) => setNewLead({ ...newLead, company: e.target.value })}
                  className="w-full px-3 py-2 border border-[#e5e5e5] rounded-md text-sm"
                  placeholder="Acme Corp"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 px-4 py-2 border border-[#e5e5e5] text-[#1a1a1a] rounded-md text-sm font-medium hover:bg-[#f5f5f5] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={addLead}
                className="flex-1 px-4 py-2 bg-[#1a1a1a] text-white rounded-md text-sm font-medium hover:bg-[#2a2a2a] transition-colors"
              >
                Add Lead
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-[#e5e5e5] rounded-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#f5f5f5] border-b border-[#e5e5e5]">
                {columns.filter(col => col.visible).map((col, idx) => (
                  <th 
                    key={idx}
                    className="px-2 py-2 text-left text-xs font-bold text-[#1a1a1a] uppercase tracking-wider whitespace-nowrap"
                    style={{ width: `${col.width}px`, minWidth: `${col.width}px`, maxWidth: `${col.width}px` }}
                  >
                    {col.label}
                  </th>
                ))}
                <th className="px-2 py-2 text-left text-xs font-bold text-[#1a1a1a] uppercase tracking-wider whitespace-nowrap" style={{ width: '60px' }}></th>
              </tr>
            </thead>
          <tbody>
            {leads.map((lead) => {
              const stageConfig = stages.find(s => s.value === lead.stage) || stages[2];
              
              // Extract colors from Tailwind classes for inline styles
              const bgMatch = stageConfig.color.match(/bg-\[([^\]]+)\]/);
              const textMatch = stageConfig.color.match(/text-\[([^\]]+)\]/);
              const bgColor = bgMatch ? bgMatch[1] : '#e5e5e5';
              const textColor = textMatch ? textMatch[1] : '#4a4a4a';
              
              return (
                <tr 
                  key={lead.id} 
                  className="border-b border-[#f0f0f0] hover:bg-[#fafafa] transition-colors"
                  onContextMenu={(e) => {
                    // Only show context menu if not clicking on an interactive element
                    const target = e.target as HTMLElement;
                    if (!target.closest('button') && !target.closest('input') && !target.closest('select') && !target.closest('textarea')) {
                      e.preventDefault();
                      setContextMenu({
                        x: e.clientX,
                        y: e.clientY,
                        lead
                      });
                    }
                  }}
                >
                  {columns.filter(col => col.visible).map((col, colIdx) => (
                    <td 
                      key={colIdx} 
                      className="px-2 py-2 text-sm text-[#1a1a1a] whitespace-nowrap"
                      style={{ width: `${col.width}px`, minWidth: `${col.width}px` }}
                    >
                      {renderCell(lead, col, bgColor, textColor)}
                    </td>
                  ))}
                  
                  {/* Delete Button */}
                  <td className="px-2 py-2 whitespace-nowrap">
                    <button
                      onClick={() => deleteLead(lead.id)}
                      className="text-[#999] hover:text-[#8a2a2a] transition-colors"
                      title="Delete lead"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {leads.length === 0 && (
          <div className="text-center py-12">
            <p className="text-[#999] text-sm">No leads yet. Add a lead to get started.</p>
          </div>
        )}
      </div>
    </div>

    {/* Add Lead Button */}
    <div className="mt-4 flex justify-end">
      <button
        onClick={() => setShowAddModal(true)}
        className="px-5 py-2.5 bg-[#1a1a1a] text-white rounded-md text-sm font-medium hover:bg-[#2a2a2a] transition-colors"
      >
        Add Lead
      </button>
    </div>

    {/* Underwriting Suite Modal */}
    {showUnderwritingSuite && (
      <UnderwritingSuite
        leadId={showUnderwritingSuite.leadId}
        leadName={showUnderwritingSuite.leadName}
        initialData={leads.find(l => l.id === showUnderwritingSuite.leadId)?.underwriting_data}
        onClose={() => setShowUnderwritingSuite(null)}
        onSave={(data) => handleSaveUnderwriting(showUnderwritingSuite.leadId, data)}
      />
    )}
    </>
  );
}
