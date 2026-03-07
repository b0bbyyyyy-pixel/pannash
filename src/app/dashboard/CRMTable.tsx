'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

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

interface CRMTableProps {
  leads: Lead[];
  monthKey: string;
  stages: Stage[];
  columns: Column[];
  emailTemplates: Template[];
  textTemplates: Template[];
  emailFrequencies: Frequency[];
  textFrequencies: Frequency[];
  onLeadUpdate: (leadId: string, updates: Partial<Lead>) => void;
  onLeadCreate: (lead: Lead) => void;
}

export default function CRMTable({ leads: initialLeads, monthKey, stages, columns, emailTemplates, textTemplates, emailFrequencies, textFrequencies, onLeadUpdate, onLeadCreate }: CRMTableProps) {
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
  const [newLead, setNewLead] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
  });
  const [showEmailModal, setShowEmailModal] = useState<string | null>(null);
  const [showTextModal, setShowTextModal] = useState<string | null>(null);
  const [autoCountdowns, setAutoCountdowns] = useState<{ [key: string]: { email: string, text: string } }>({});
  const [showCustomTimerModal, setShowCustomTimerModal] = useState<string | null>(null);
  const [customTimerDate, setCustomTimerDate] = useState('');
  const [customTimerTime, setCustomTimerTime] = useState('23:59');
  const [showDisplayDateModal, setShowDisplayDateModal] = useState<string | null>(null);
  const [displayDate, setDisplayDate] = useState('');
  const [showExpandedTextModal, setShowExpandedTextModal] = useState<{ leadId: string; field: string; value: string; label: string } | null>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [attachmentCounts, setAttachmentCounts] = useState<{ [key: string]: number }>({});
  const router = useRouter();

  // Update local state when props change (e.g., switching tabs)
  useEffect(() => {
    setLeads(initialLeads);
  }, [initialLeads]);

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

    // Optimistically update local state
    setLeads(prev => prev.map(lead => 
      lead.id === leadId ? { ...lead, timer_type: 'Display Date', timer_end_date: timerEndDate } : lead
    ));

    // Update parent state
    onLeadUpdate(leadId, { timer_type: 'Display Date', timer_end_date: timerEndDate });

    try {
      const res = await fetch('/api/leads/update-crm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          leadId, 
          field: 'timer', 
          value: { timer_type: 'Display Date', timer_end_date: timerEndDate }
        }),
        credentials: 'include',
      });

      if (!res.ok) {
        console.error('Failed to update display date:', await res.text());
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

  // Convert markdown to HTML for display
  const renderMarkdown = (text: string) => {
    if (!text) return text;
    
    // Convert **bold** to <strong>
    let formatted = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    
    // Convert *italic* to <em> (but not if it's part of **)
    formatted = formatted.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
    
    return formatted;
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
      const res = await fetch(`/api/attachments?leadId=${leadId}&columnField=${columnField}`);
      if (res.ok) {
        const { attachments: fetchedAttachments } = await res.json();
        setAttachments(fetchedAttachments || []);
        // Update count
        const countKey = `${leadId}-${columnField}`;
        setAttachmentCounts(prev => ({ ...prev, [countKey]: fetchedAttachments?.length || 0 }));
      }
    } catch (error) {
      console.error('Error fetching attachments:', error);
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

  const handleCustomTimer = async (leadId: string) => {
    if (!customTimerDate) {
      alert('Please select a date');
      return;
    }

    // Combine date and time
    const endDate = new Date(`${customTimerDate}T${customTimerTime}`);
    const timerEndDate = endDate.toISOString();

    // Optimistically update local state
    setLeads(prev => prev.map(lead => 
      lead.id === leadId ? { ...lead, timer_type: 'Custom Countdown', timer_end_date: timerEndDate } : lead
    ));

    // Also update parent state so changes persist across tab switches
    onLeadUpdate(leadId, { timer_type: 'Custom Countdown', timer_end_date: timerEndDate });

    try {
      const res = await fetch('/api/leads/update-crm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          leadId, 
          field: 'timer', 
          value: { timer_type: 'Custom Countdown', timer_end_date: timerEndDate }
        }),
        credentials: 'include',
      });

      if (!res.ok) {
        console.error('Failed to update custom timer:', await res.text());
        router.refresh();
      } else {
        const result = await res.json();
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
    } else {
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      setDisplayDate(`${year}-${month}-${day}`);
    }
    setShowDisplayDateModal(leadId);
  };

  const openCustomTimerModal = (leadId: string) => {
    const lead = leads.find(l => l.id === leadId);
    if (lead?.timer_end_date) {
      const endDate = new Date(lead.timer_end_date);
      setCustomTimerDate(endDate.toISOString().split('T')[0]);
      setCustomTimerTime(endDate.toTimeString().slice(0, 5));
    } else {
      // Default to 30 days from now
      const defaultEnd = new Date();
      defaultEnd.setDate(defaultEnd.getDate() + 30);
      setCustomTimerDate(defaultEnd.toISOString().split('T')[0]);
      setCustomTimerTime('23:59');
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

    // Update every second
    const interval = setInterval(() => {
      const newCountdowns: { [key: string]: { days: number; time: string } | string } = {};
      const newAutoCountdowns: { [key: string]: { email: string, text: string } } = {};
      
      leads.forEach(lead => {
        if (lead.timer_end_date) {
          const result = getCountdown(lead.timer_end_date);
          newCountdowns[lead.id] = result || 'EXPIRED';
        }
        newAutoCountdowns[lead.id] = {
          email: getAutoCountdown(lead.last_email_sent, lead.auto_email_frequency, emailFrequencies) || '',
          text: getAutoCountdown(lead.last_text_sent, lead.auto_text_frequency, textFrequencies) || ''
        };
      });
      
      setCountdown(newCountdowns);
      setAutoCountdowns(newAutoCountdowns);
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
      const valueToSave = editField === 'value' ? Number(editValue) : editValue;
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
    if (column.expandable) {
      const value = lead[fieldKey] as string | null;
      const formattedValue = value ? renderMarkdown(value) : null;
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
              onClick={() => setEditingTimerId(lead.id)}
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
            >
              {countdown[lead.id] === 'EXPIRED' ? (
                <span style={{ color: '#ff0000' }} className="animate-pulse">EXPIRED</span>
              ) : typeof countdown[lead.id] === 'object' ? (
                <>
                  <span style={{ color: countdown[lead.id].days <= 1 ? '#ff0000' : '#1a1a1a' }}>
                    {countdown[lead.id].days}D
                  </span>
                  <span style={{ color: '#ff0000' }}>
                    {' '}{countdown[lead.id].time}
                  </span>
                </>
              ) : (
                '...'
              )}
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
          >
            <div className="flex items-center gap-1.5">
              <span dangerouslySetInnerHTML={{ __html: renderMarkdown(lead.company || 'Add company') }} />
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
              <span dangerouslySetInnerHTML={{ __html: renderMarkdown(lead.name || '') }} />
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
          >
            <div className="flex items-center gap-1.5">
              <span dangerouslySetInnerHTML={{ __html: renderMarkdown(lead.email || 'Add email') }} />
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
          <button
            onClick={() => startEdit(lead.id, 'phone', lead.phone || '')}
            onContextMenu={(e) => {
              e.preventDefault();
              setShowExpandedTextModal({ leadId: lead.id, field: 'phone', value: String(lead.phone || ''), label: 'Phone' });
            }}
            className="hover:text-[#5a7fc7] transition-colors text-left whitespace-nowrap"
          >
            <div className="flex items-center gap-1.5">
              <span dangerouslySetInnerHTML={{ __html: renderMarkdown(lead.phone || 'Add phone') }} />
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

      case 'lead_source': {
        const countKey = `${lead.id}-lead_source`;
        const attachmentCount = attachmentCounts[countKey] || 0;
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
          >
            <div className="flex items-center gap-1.5">
              <span dangerouslySetInnerHTML={{ __html: renderMarkdown(lead.lead_source || 'Add source') }} />
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

      case 'last_contact':
        return editingId === lead.id && editField === 'last_contact' ? (
          <input
            type="date"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={saveEdit}
            onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
            autoFocus
            className="w-full px-2 py-1 text-sm border border-[#5a7fc7] rounded"
          />
        ) : (
          <button
            onClick={() => startEdit(lead.id, 'last_contact', lead.last_contact ? new Date(lead.last_contact).toISOString().split('T')[0] : '')}
            className="hover:text-[#5a7fc7] transition-colors text-left whitespace-nowrap"
          >
            {lead.last_contact ? new Date(lead.last_contact).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' }) : 'Add date'}
          </button>
        );

      case 'notes':
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
          >
            {lead.notes || 'Add notes'}
          </button>
        );

      case 'offers':
        return editingId === lead.id && editField === 'offers' ? (
          <textarea
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={saveEdit}
            autoFocus
            className="w-full px-2 py-1 text-sm border border-[#5a7fc7] rounded min-h-[60px]"
          />
        ) : (
          <button
            onClick={() => startEdit(lead.id, 'offers', lead.offers || '')}
            className="hover:text-[#5a7fc7] transition-colors text-left whitespace-nowrap"
          >
            {lead.offers || 'Add offers'}
          </button>
        );

      case 'auto_email_frequency':
        const emailFreq = emailFrequencies.find(f => f.name === lead.auto_email_frequency);
        const emailCountdown = autoCountdowns[lead.id]?.email;
        return (
          <>
            <button
              onClick={() => setShowEmailModal(lead.id)}
              className="w-full px-2 py-1 text-xs border-0 rounded cursor-pointer flex flex-col items-start"
              style={{
                backgroundColor: emailFreq?.bg_color || '#f5f5f5',
                color: emailFreq?.text_color || '#999'
              }}
            >
              <span>{lead.auto_email_frequency}</span>
              {emailCountdown && emailCountdown !== 'READY' && (
                <span 
                  style={{ 
                    fontFamily: 'var(--font-roboto-mono), monospace', 
                    fontSize: '9px',
                    color: '#ff0000',
                    marginTop: '2px'
                  }}
                >
                  {emailCountdown}
                </span>
              )}
            </button>
            
            {showEmailModal === lead.id && (
              <div 
                className="fixed inset-0 bg-black/20 flex items-center justify-center z-50 email-modal-container" 
                onClick={() => setShowEmailModal(null)}
              >
                <div 
                  className="bg-white border-2 border-[#5a7fc7] rounded-md shadow-xl p-4 w-[300px]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <h3 className="text-sm font-medium text-[#1a1a1a] mb-3">Email Automation</h3>
                  <div className="mb-3">
                    <label className="block text-xs font-medium text-[#6b6b6b] mb-1">Frequency</label>
                    <select
                      value={lead.auto_email_frequency}
                      onChange={(e) => {
                        updateLead(lead.id, 'auto_email_frequency', e.target.value);
                        // If setting a frequency for the first time, set last_sent to now
                        if (e.target.value !== 'Off' && !lead.last_email_sent) {
                          updateLead(lead.id, 'last_email_sent', new Date().toISOString());
                        }
                      }}
                      className="w-full px-3 py-2 text-sm border border-[#e5e5e5] rounded"
                    >
                      {emailFrequencies.map((freq, idx) => (
                        <option key={`email-${idx}`} value={freq.name}>{freq.name}</option>
                      ))}
                    </select>
                  </div>
                  {lead.auto_email_frequency !== 'Off' && (
                    <div className="mb-3">
                      <label className="block text-xs font-medium text-[#6b6b6b] mb-1">Template</label>
                      <select
                        value={lead.email_template_id || ''}
                        onChange={(e) => updateLead(lead.id, 'email_template_id', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-[#e5e5e5] rounded"
                      >
                        <option value="">Select template...</option>
                        {emailTemplates.map((template) => (
                          <option key={template.id} value={template.id}>{template.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <button
                    onClick={() => setShowEmailModal(null)}
                    className="w-full px-3 py-2 bg-[#1a1a1a] text-white rounded text-sm font-medium hover:bg-[#2a2a2a]"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </>
        );

      case 'auto_text_frequency':
        const textFreq = textFrequencies.find(f => f.name === lead.auto_text_frequency);
        const textCountdown = autoCountdowns[lead.id]?.text;
        return (
          <>
            <button
              onClick={() => setShowTextModal(lead.id)}
              className="w-full px-2 py-1 text-xs border-0 rounded cursor-pointer flex flex-col items-start"
              style={{
                backgroundColor: textFreq?.bg_color || '#f5f5f5',
                color: textFreq?.text_color || '#999'
              }}
            >
              <span>{lead.auto_text_frequency}</span>
              {textCountdown && textCountdown !== 'READY' && (
                <span 
                  style={{ 
                    fontFamily: 'var(--font-roboto-mono), monospace', 
                    fontSize: '9px',
                    color: '#ff0000',
                    marginTop: '2px'
                  }}
                >
                  {textCountdown}
                </span>
              )}
            </button>
            
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

      default:
        return <span className="text-sm text-[#1a1a1a]">{(lead[fieldKey] as any) || '-'}</span>;
    }
  };

  return (
    <>
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
              placeholder={`Enter ${showExpandedTextModal.label.toLowerCase()} here...\n\nFormatting:\n**bold text**\n*italic text*`}
              autoFocus
            />

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
                    className="px-4 py-3 text-left text-xs font-bold text-[#1a1a1a] uppercase tracking-wider whitespace-nowrap"
                    style={{ width: `${col.width}px`, minWidth: `${col.width}px`, maxWidth: `${col.width}px` }}
                  >
                    {col.label}
                  </th>
                ))}
                <th className="px-4 py-3 text-left text-xs font-bold text-[#1a1a1a] uppercase tracking-wider whitespace-nowrap" style={{ width: '60px' }}></th>
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
                <tr key={lead.id} className="border-b border-[#f0f0f0] hover:bg-[#fafafa] transition-colors">
                  {columns.filter(col => col.visible).map((col, colIdx) => (
                    <td 
                      key={colIdx} 
                      className="px-4 py-3 text-sm text-[#1a1a1a] whitespace-nowrap"
                      style={{ width: `${col.width}px`, minWidth: `${col.width}px` }}
                    >
                      {renderCell(lead, col, bgColor, textColor)}
                    </td>
                  ))}
                  
                  {/* Delete Button */}
                  <td className="px-4 py-3 whitespace-nowrap">
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
    </>
  );
}
