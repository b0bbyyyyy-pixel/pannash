'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

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

interface ConfigButtonProps {
  stages: Stage[];
  stats: Stat[];
  columns: Column[];
  emailTemplates: Template[];
  textTemplates: Template[];
  emailFrequencies: Frequency[];
  textFrequencies: Frequency[];
  monthKey: string;
}

// Sortable Stage Component
function SortableStage({ 
  stage, 
  index,
  onUpdate,
  onUpdateBgColor,
  onDelete
}: { 
  stage: Stage;
  index: number;
  onUpdate: (index: number, field: 'value' | 'color', value: string) => void;
  onUpdateBgColor: (index: number, bgColor: string) => void;
  onDelete: (index: number) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: index.toString() });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Extract colors for preview
  const bgMatch = stage.color.match(/bg-\[([^\]]+)\]/);
  const textMatch = stage.color.match(/text-\[([^\]]+)\]/);
  const currentBg = bgMatch ? bgMatch[1] : '#e5e5e5';
  const currentText = textMatch ? textMatch[1] : '#4a4a4a';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="grid grid-cols-[40px_240px_100px_160px_40px] gap-4 items-end p-4 border border-[#e5e5e5] rounded-md"
    >
      <div 
        {...attributes}
        {...listeners}
        className="h-10 flex items-center justify-center text-[#999] hover:text-[#1a1a1a] cursor-grab active:cursor-grabbing"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
        </svg>
      </div>
      <div>
        <label className="block text-xs font-medium text-[#6b6b6b] mb-1">Stage Name</label>
        <input
          type="text"
          value={stage.value}
          onChange={(e) => onUpdate(index, 'value', e.target.value)}
          className="w-full px-3 py-2 border border-[#e5e5e5] rounded text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-[#6b6b6b] mb-1">Color</label>
        <input
          type="color"
          value={currentBg}
          onChange={(e) => onUpdateBgColor(index, e.target.value)}
          className="w-full h-10 border border-[#e5e5e5] rounded cursor-pointer"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-[#6b6b6b] mb-1">Preview</label>
        <div 
          className="px-2 py-1 text-xs font-medium rounded text-center"
          style={{ backgroundColor: currentBg, color: currentText }}
        >
          {stage.value}
        </div>
      </div>
      <div>
        <button
          onClick={() => onDelete(index)}
          className="text-[#999] hover:text-[#8a2a2a] transition-colors h-10 flex items-center justify-center"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default function ConfigButton({ stages: initialStages, stats: initialStats, columns: initialColumns, emailTemplates: initialEmailTemplates, textTemplates: initialTextTemplates, emailFrequencies: initialEmailFreqs, textFrequencies: initialTextFreqs, monthKey }: ConfigButtonProps) {
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'stages' | 'stats' | 'columns' | 'templates' | 'frequencies'>('stages');
  const [stages, setStages] = useState(initialStages);
  const [stats, setStats] = useState(initialStats);
  const [columns, setColumns] = useState(initialColumns);
  const [emailTemplates, setEmailTemplates] = useState(initialEmailTemplates);
  const [textTemplates, setTextTemplates] = useState(initialTextTemplates);
  const [emailFrequencies, setEmailFrequencies] = useState(initialEmailFreqs);
  const [textFrequencies, setTextFrequencies] = useState(initialTextFreqs);
  const [isMounted, setIsMounted] = useState(false);
  const router = useRouter();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Prevent hydration mismatch
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const saveConfig = async () => {
    try {
      // Check for duplicate stage names
      const stageNames = stages.map(s => s.value.trim().toLowerCase());
      const duplicates = stageNames.filter((name, index) => stageNames.indexOf(name) !== index);
      if (duplicates.length > 0) {
        alert('Duplicate stage names found. Each stage must have a unique name.');
        return;
      }

      // Check for empty stage names
      if (stages.some(s => !s.value.trim())) {
        alert('All stages must have a name.');
        return;
      }

      // Save stages (month-specific)
      const stagesRes = await fetch('/api/dashboard/update-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ 
          configType: 'stages', 
          configData: stages,
          monthKey 
        }),
      });

      if (!stagesRes.ok) {
        const error = await stagesRes.json();
        console.error('Stages save error:', error);
        alert('Failed to save stages: ' + (error.error || 'Unknown error'));
        return;
      }

      // Save stats (month-specific)
      const statsRes = await fetch('/api/dashboard/update-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ 
          configType: 'stats', 
          configData: stats,
          monthKey 
        }),
      });

      if (!statsRes.ok) {
        const error = await statsRes.json();
        console.error('Stats save error:', error);
        alert('Failed to save stats: ' + (error.error || 'Unknown error'));
        return;
      }

      // Save columns (month-specific)
      const columnsRes = await fetch('/api/dashboard/update-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ 
          configType: 'columns', 
          configData: columns,
          monthKey 
        }),
      });

      if (!columnsRes.ok) {
        const error = await columnsRes.json();
        console.error('Columns save error:', error);
        alert('Failed to save columns: ' + (error.error || 'Unknown error'));
        return;
      }

      // Save templates
      const templatesRes = await fetch('/api/templates/save-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ 
          emailTemplates,
          textTemplates
        }),
      });

      if (!templatesRes.ok) {
        const error = await templatesRes.json();
        console.error('Templates save error:', error);
        alert('Failed to save templates: ' + (error.error || 'Unknown error'));
        return;
      }

      // Save frequencies
      const frequenciesRes = await fetch('/api/frequencies/save-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ 
          emailFrequencies,
          textFrequencies
        }),
      });

      if (!frequenciesRes.ok) {
        const error = await frequenciesRes.json();
        console.error('Frequencies save error:', error);
        alert('Failed to save frequencies: ' + (error.error || 'Unknown error'));
        return;
      }

      setShowModal(false);
      // Refresh to update config without losing current month
      router.refresh();
    } catch (error) {
      console.error('Error saving config:', error);
      alert('Failed to save configuration: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const handleStagesDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = parseInt(active.id as string);
      const newIndex = parseInt(over.id as string);
      setStages(arrayMove(stages, oldIndex, newIndex));
    }
  };

  const addStage = () => {
    setStages([...stages, { value: 'New Stage', color: 'bg-[#e5e5e5] text-[#4a4a4a]' }]);
  };

  const updateStage = (index: number, field: 'value' | 'color', value: string) => {
    const newStages = [...stages];
    newStages[index][field] = value;
    setStages(newStages);
  };

  const getContrastColor = (hexColor: string) => {
    // Convert hex to RGB
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);
    
    // Calculate relative luminance
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    
    // Return dark text for light backgrounds, light text for dark backgrounds
    return luminance > 0.5 ? '#1a1a1a' : '#ffffff';
  };

  const updateStageBgColor = (index: number, bgColor: string) => {
    const textColor = getContrastColor(bgColor);
    const newStages = [...stages];
    newStages[index].color = `bg-[${bgColor}] text-[${textColor}]`;
    setStages(newStages);
  };

  const deleteStage = (index: number) => {
    if (stages.length <= 1) {
      alert('Must have at least one stage');
      return;
    }
    setStages(stages.filter((_, i) => i !== index));
  };

  const addStat = () => {
    setStats([...stats, { 
      key: 'custom' + Date.now(), 
      label: 'New Stat', 
      color: 'text-[#1a1a1a]',
      type: 'count'
    }]);
  };

  const updateStat = (index: number, field: keyof Stat, value: string) => {
    const newStats = [...stats];
    
    // Handle array fields specially
    if (field === 'stages' || field === 'numeratorStages' || field === 'denominatorStages') {
      try {
        const parsedStages = value ? JSON.parse(value) : [];
        newStats[index] = { ...newStats[index], [field]: parsedStages };
      } catch {
        newStats[index] = { ...newStats[index], [field]: [] };
      }
    } else {
      newStats[index] = { ...newStats[index], [field]: value } as Stat;
    }
    
    setStats(newStats);
  };

  const updateStatColor = (index: number, color: string) => {
    const newStats = [...stats];
    newStats[index].color = `text-[${color}]`;
    setStats(newStats);
  };

  const deleteStat = (index: number) => {
    if (stats.length <= 1) {
      alert('Must have at least one stat');
      return;
    }
    setStats(stats.filter((_, i) => i !== index));
  };

  const updateColumn = (index: number, field: keyof Column, value: string | number | boolean) => {
    const newColumns = [...columns];
    newColumns[index] = { ...newColumns[index], [field]: value };
    setColumns(newColumns);
  };

  const addEmailTemplate = () => {
    setEmailTemplates([...emailTemplates, { 
      id: 'new-' + Date.now(), 
      type: 'email',
      name: 'New Email Template', 
      subject: 'Subject',
      body: 'Email body here...'
    }]);
  };

  const addTextTemplate = () => {
    setTextTemplates([...textTemplates, { 
      id: 'new-' + Date.now(), 
      type: 'text',
      name: 'New Text Template', 
      body: 'Text message here...'
    }]);
  };

  const updateEmailTemplate = (index: number, field: keyof Template, value: string) => {
    const newTemplates = [...emailTemplates];
    newTemplates[index] = { ...newTemplates[index], [field]: value };
    setEmailTemplates(newTemplates);
  };

  const updateTextTemplate = (index: number, field: keyof Template, value: string) => {
    const newTemplates = [...textTemplates];
    newTemplates[index] = { ...newTemplates[index], [field]: value };
    setTextTemplates(newTemplates);
  };

  const deleteEmailTemplate = (index: number) => {
    if (emailTemplates.length <= 1) {
      alert('Must have at least one email template');
      return;
    }
    setEmailTemplates(emailTemplates.filter((_, i) => i !== index));
  };

  const deleteTextTemplate = (index: number) => {
    if (textTemplates.length <= 1) {
      alert('Must have at least one text template');
      return;
    }
    setTextTemplates(textTemplates.filter((_, i) => i !== index));
  };

  const addEmailFrequency = () => {
    setEmailFrequencies([...emailFrequencies, { 
      id: 'new-' + Date.now(), 
      name: 'Custom Frequency',
      days_interval: 7,
      bg_color: '#d5f0d5',
      text_color: '#2a5a2a',
      type: 'email'
    }]);
  };

  const addTextFrequency = () => {
    setTextFrequencies([...textFrequencies, { 
      id: 'new-' + Date.now(), 
      name: 'Custom Frequency',
      days_interval: 7,
      bg_color: '#e5d5e8',
      text_color: '#4a3a5a',
      type: 'text'
    }]);
  };

  const updateEmailFrequency = (index: number, field: keyof Frequency, value: string | number) => {
    const newFreqs = [...emailFrequencies];
    newFreqs[index] = { ...newFreqs[index], [field]: value };
    setEmailFrequencies(newFreqs);
  };

  const updateTextFrequency = (index: number, field: keyof Frequency, value: string | number) => {
    const newFreqs = [...textFrequencies];
    newFreqs[index] = { ...newFreqs[index], [field]: value };
    setTextFrequencies(newFreqs);
  };

  const deleteEmailFrequency = (index: number) => {
    if (emailFrequencies.length <= 1) {
      alert('Must have at least one email frequency option');
      return;
    }
    setEmailFrequencies(emailFrequencies.filter((_, i) => i !== index));
  };

  const deleteTextFrequency = (index: number) => {
    if (textFrequencies.length <= 1) {
      alert('Must have at least one text frequency option');
      return;
    }
    setTextFrequencies(textFrequencies.filter((_, i) => i !== index));
  };

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="px-4 py-2 text-sm font-medium text-[#6b6b6b] hover:text-[#1a1a1a] transition-colors border border-[#e5e5e5] rounded-md hover:bg-white"
        title="Configure Dashboard"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-lg p-8 max-w-3xl w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-2xl font-bold text-[#1a1a1a] mb-6">Configure Dashboard</h2>

            {/* Tabs */}
            <div className="flex gap-4 mb-6 border-b border-[#e5e5e5]">
              <button
                onClick={() => setActiveTab('stages')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === 'stages'
                    ? 'text-[#1a1a1a] border-b-2 border-[#1a1a1a]'
                    : 'text-[#6b6b6b] hover:text-[#1a1a1a]'
                }`}
              >
                Stages
              </button>
              <button
                onClick={() => setActiveTab('stats')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === 'stats'
                    ? 'text-[#1a1a1a] border-b-2 border-[#1a1a1a]'
                    : 'text-[#6b6b6b] hover:text-[#1a1a1a]'
                }`}
              >
                Stats Cards
              </button>
              <button
                onClick={() => setActiveTab('columns')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === 'columns'
                    ? 'text-[#1a1a1a] border-b-2 border-[#1a1a1a]'
                    : 'text-[#6b6b6b] hover:text-[#1a1a1a]'
                }`}
              >
                Columns
              </button>
              <button
                onClick={() => setActiveTab('templates')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === 'templates'
                    ? 'text-[#1a1a1a] border-b-2 border-[#1a1a1a]'
                    : 'text-[#6b6b6b] hover:text-[#1a1a1a]'
                }`}
              >
                Templates
              </button>
              <button
                onClick={() => setActiveTab('frequencies')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === 'frequencies'
                    ? 'text-[#1a1a1a] border-b-2 border-[#1a1a1a]'
                    : 'text-[#6b6b6b] hover:text-[#1a1a1a]'
                }`}
              >
                Frequencies
              </button>
            </div>

            {/* Stages Tab */}
            {activeTab === 'stages' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center mb-4">
                  <p className="text-sm text-[#6b6b6b]">Manage your lead stages and colors (drag to reorder)</p>
                  <button
                    onClick={addStage}
                    className="px-3 py-1.5 bg-[#1a1a1a] text-white rounded text-xs font-medium hover:bg-[#2a2a2a]"
                  >
                    + Add Stage
                  </button>
                </div>

                {isMounted ? (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleStagesDragEnd}
                  >
                    <SortableContext
                      items={stages.map((_, i) => i.toString())}
                      strategy={verticalListSortingStrategy}
                    >
                      {stages.map((stage, index) => (
                        <SortableStage
                          key={index}
                          stage={stage}
                          index={index}
                          onUpdate={updateStage}
                          onUpdateBgColor={updateStageBgColor}
                          onDelete={deleteStage}
                        />
                      ))}
                    </SortableContext>
                  </DndContext>
                ) : (
                  <>
                    {stages.map((stage, index) => {
                      // Extract colors for preview
                      const bgMatch = stage.color.match(/bg-\[([^\]]+)\]/);
                      const textMatch = stage.color.match(/text-\[([^\]]+)\]/);
                      const currentBg = bgMatch ? bgMatch[1] : '#e5e5e5';
                      const currentText = textMatch ? textMatch[1] : '#4a4a4a';

                      return (
                        <div key={index} className="grid grid-cols-[240px_100px_160px_40px] gap-4 items-end p-4 border border-[#e5e5e5] rounded-md">
                          <div>
                            <label className="block text-xs font-medium text-[#6b6b6b] mb-1">Stage Name</label>
                            <input
                              type="text"
                              value={stage.value}
                              onChange={(e) => updateStage(index, 'value', e.target.value)}
                              className="w-full px-3 py-2 border border-[#e5e5e5] rounded text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-[#6b6b6b] mb-1">Color</label>
                            <input
                              type="color"
                              value={currentBg}
                              onChange={(e) => updateStageBgColor(index, e.target.value)}
                              className="w-full h-10 border border-[#e5e5e5] rounded cursor-pointer"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-[#6b6b6b] mb-1">Preview</label>
                            <div 
                              className="px-2 py-1 text-xs font-medium rounded text-center"
                              style={{ backgroundColor: currentBg, color: currentText }}
                            >
                              {stage.value}
                            </div>
                          </div>
                          <div>
                            <button
                              onClick={() => deleteStage(index)}
                              className="text-[#999] hover:text-[#8a2a2a] transition-colors h-10 flex items-center justify-center"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            )}

            {/* Stats Tab */}
            {activeTab === 'stats' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center mb-4">
                  <p className="text-sm text-[#6b6b6b]">Customize your dashboard stats cards</p>
                  <button
                    onClick={addStat}
                    className="px-3 py-1.5 bg-[#1a1a1a] text-white rounded text-xs font-medium hover:bg-[#2a2a2a]"
                  >
                    + Add Stat
                  </button>
                </div>

                {stats.map((stat, index) => {
                  // Extract current color from Tailwind class
                  const colorMatch = stat.color.match(/text-\[([^\]]+)\]/);
                  const currentColor = colorMatch ? colorMatch[1] : '#1a1a1a';
                  const statType = stat.type || 'count';

                  return (
                    <div key={index} className="flex flex-col gap-3 p-4 border border-[#e5e5e5] rounded-md">
                      <div className="grid grid-cols-[200px_100px_150px_40px] gap-4 items-end">
                        <div>
                          <label className="block text-xs font-medium text-[#6b6b6b] mb-1">Label</label>
                          <input
                            type="text"
                            value={stat.label}
                            onChange={(e) => updateStat(index, 'label', e.target.value)}
                            className="w-full px-3 py-2 border border-[#e5e5e5] rounded text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[#6b6b6b] mb-1">Number Color</label>
                          <input
                            type="color"
                            value={currentColor}
                            onChange={(e) => updateStatColor(index, e.target.value)}
                            className="w-full h-10 border border-[#e5e5e5] rounded cursor-pointer"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[#6b6b6b] mb-1">Type</label>
                          <select
                            value={statType}
                            onChange={(e) => updateStat(index, 'type', e.target.value)}
                            className="w-full px-3 py-2 border border-[#e5e5e5] rounded text-sm"
                          >
                            <option value="count">Count</option>
                            <option value="percentage">Percentage</option>
                          </select>
                        </div>
                        <div>
                          <button
                            onClick={() => deleteStat(index)}
                            className="text-[#999] hover:text-[#8a2a2a] transition-colors h-10 flex items-center justify-center"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      {/* Show different fields based on type */}
                      {statType === 'count' && (
                        <div className="grid grid-cols-1 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-[#6b6b6b] mb-2">Filter by Stages (Optional)</label>
                            <div className="border border-[#e5e5e5] rounded p-3 space-y-2 max-h-[200px] overflow-y-auto">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={!stat.stages || stat.stages.length === 0}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      updateStat(index, 'stages', '');
                                      updateStat(index, 'stage', '');
                                    }
                                  }}
                                  className="cursor-pointer"
                                />
                                <span className="text-sm">All Leads</span>
                              </label>
                              {stages.map((s, idx) => (
                                <label key={`stat-${index}-stage-${idx}`} className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={(stat.stages || []).includes(s.value)}
                                    onChange={(e) => {
                                      const currentStages = stat.stages || [];
                                      let newStages: string[];
                                      if (e.target.checked) {
                                        newStages = [...currentStages, s.value];
                                      } else {
                                        newStages = currentStages.filter(st => st !== s.value);
                                      }
                                      updateStat(index, 'stages', JSON.stringify(newStages));
                                    }}
                                    className="cursor-pointer"
                                  />
                                  <span className="text-sm">{s.value}</span>
                                </label>
                              ))}
                            </div>
                            <p className="text-xs text-[#999] mt-1">Select multiple stages to include in this stat</p>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-[#6b6b6b] mb-1">Format</label>
                            <select
                              value={stat.format || 'count'}
                              onChange={(e) => updateStat(index, 'format', e.target.value)}
                              className="w-full px-3 py-2 border border-[#e5e5e5] rounded text-sm"
                            >
                              <option value="count">Number</option>
                              <option value="currency">Currency ($)</option>
                            </select>
                          </div>
                        </div>
                      )}

                      {statType === 'percentage' && (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-[#6b6b6b] mb-2">Numerator (Completed)</label>
                            <div className="border border-[#e5e5e5] rounded p-3 space-y-2 max-h-[200px] overflow-y-auto">
                              {stages.map((s, idx) => (
                                <label key={`stat-${index}-num-${idx}`} className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={(stat.numeratorStages || []).includes(s.value)}
                                    onChange={(e) => {
                                      const currentStages = stat.numeratorStages || [];
                                      let newStages: string[];
                                      if (e.target.checked) {
                                        newStages = [...currentStages, s.value];
                                      } else {
                                        newStages = currentStages.filter(st => st !== s.value);
                                      }
                                      updateStat(index, 'numeratorStages', JSON.stringify(newStages));
                                    }}
                                    className="cursor-pointer"
                                  />
                                  <span className="text-sm">{s.value}</span>
                                </label>
                              ))}
                            </div>
                            <p className="text-xs text-[#999] mt-1">Completed stages</p>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-[#6b6b6b] mb-2">Denominator (Total)</label>
                            <div className="border border-[#e5e5e5] rounded p-3 space-y-2 max-h-[200px] overflow-y-auto">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={!stat.denominatorStages || stat.denominatorStages.length === 0}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      updateStat(index, 'denominatorStages', '');
                                    }
                                  }}
                                  className="cursor-pointer"
                                />
                                <span className="text-sm font-medium">All Leads</span>
                              </label>
                              {stages.map((s, idx) => (
                                <label key={`stat-${index}-denom-${idx}`} className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={(stat.denominatorStages || []).includes(s.value)}
                                    onChange={(e) => {
                                      const currentStages = stat.denominatorStages || [];
                                      let newStages: string[];
                                      if (e.target.checked) {
                                        newStages = [...currentStages, s.value];
                                      } else {
                                        newStages = currentStages.filter(st => st !== s.value);
                                      }
                                      updateStat(index, 'denominatorStages', JSON.stringify(newStages));
                                    }}
                                    className="cursor-pointer"
                                  />
                                  <span className="text-sm">{s.value}</span>
                                </label>
                              ))}
                            </div>
                            <p className="text-xs text-[#999] mt-1">Total pool stages</p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                <div className="text-xs text-[#6b6b6b] mt-4 p-3 bg-[#f5f5f5] rounded">
                  <strong>Tip:</strong> Use "Count" to count leads in a stage. Use "Percentage" for closing rates (e.g., Contracts Out / All Leads).
                </div>
              </div>
            )}

            {/* Columns Tab */}
            {activeTab === 'columns' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center mb-4">
                  <p className="text-sm text-[#6b6b6b]">Customize column names and widths</p>
                </div>

                {columns.map((column, index) => (
                  <div key={index} className="grid grid-cols-[200px_100px_80px_100px] gap-4 items-end p-4 border border-[#e5e5e5] rounded-md">
                    <div>
                      <label className="block text-xs font-medium text-[#6b6b6b] mb-1">Column Name</label>
                      <input
                        type="text"
                        value={column.label}
                        onChange={(e) => updateColumn(index, 'label', e.target.value)}
                        className="w-full px-3 py-2 border border-[#e5e5e5] rounded text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#6b6b6b] mb-1">Width (px)</label>
                      <input
                        type="number"
                        value={column.width}
                        onChange={(e) => updateColumn(index, 'width', parseInt(e.target.value) || 100)}
                        min="50"
                        max="400"
                        className="w-full px-3 py-2 border border-[#e5e5e5] rounded text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#6b6b6b] mb-1">Show</label>
                      <input
                        type="checkbox"
                        checked={column.visible}
                        onChange={(e) => updateColumn(index, 'visible', e.target.checked)}
                        className="w-5 h-10 cursor-pointer"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#6b6b6b] mb-1">Expandable</label>
                      <input
                        type="checkbox"
                        checked={column.expandable || false}
                        onChange={(e) => updateColumn(index, 'expandable', e.target.checked)}
                        className="w-5 h-10 cursor-pointer"
                        title="Open in a large modal for long text"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#6b6b6b] mb-1">Attachments</label>
                      <input
                        type="checkbox"
                        checked={column.allowAttachments || false}
                        onChange={(e) => updateColumn(index, 'allowAttachments', e.target.checked)}
                        className="w-5 h-10 cursor-pointer"
                        title="Allow file attachments for this column"
                      />
                    </div>
                  </div>
                ))}

                <div className="text-xs text-[#6b6b6b] mt-4 p-3 bg-[#f5f5f5] rounded">
                  <strong>Tip:</strong> Adjust column widths to fit your content. Uncheck "Show" to hide columns. Enable "Expandable" for fields with long text (opens in modal). Enable "Attachments" to upload files.
                </div>
              </div>
            )}

            {/* Templates Tab */}
            {activeTab === 'templates' && (
              <div className="space-y-6">
                {/* Email Templates */}
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-sm font-medium text-[#1a1a1a]">Email Templates</h3>
                    <button
                      onClick={addEmailTemplate}
                      className="px-3 py-1.5 bg-[#1a1a1a] text-white rounded text-xs font-medium hover:bg-[#2a2a2a]"
                    >
                      + Add Email
                    </button>
                  </div>

                  {emailTemplates.map((template, index) => (
                    <div key={index} className="mb-4 p-4 border border-[#e5e5e5] rounded-md">
                      <div className="grid grid-cols-[1fr_40px] gap-4 mb-3">
                        <div>
                          <label className="block text-xs font-medium text-[#6b6b6b] mb-1">Template Name</label>
                          <input
                            type="text"
                            value={template.name}
                            onChange={(e) => updateEmailTemplate(index, 'name', e.target.value)}
                            className="w-full px-3 py-2 border border-[#e5e5e5] rounded text-sm"
                          />
                        </div>
                        <div className="pt-6">
                          <button
                            onClick={() => deleteEmailTemplate(index)}
                            className="text-[#999] hover:text-[#8a2a2a] transition-colors h-10 flex items-center justify-center"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                      <div className="mb-3">
                        <label className="block text-xs font-medium text-[#6b6b6b] mb-1">Subject</label>
                        <input
                          type="text"
                          value={template.subject || ''}
                          onChange={(e) => updateEmailTemplate(index, 'subject', e.target.value)}
                          className="w-full px-3 py-2 border border-[#e5e5e5] rounded text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#6b6b6b] mb-1">Body</label>
                        <textarea
                          value={template.body}
                          onChange={(e) => updateEmailTemplate(index, 'body', e.target.value)}
                          className="w-full px-3 py-2 border border-[#e5e5e5] rounded text-sm min-h-[100px]"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Text Templates */}
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-sm font-medium text-[#1a1a1a]">Text Templates</h3>
                    <button
                      onClick={addTextTemplate}
                      className="px-3 py-1.5 bg-[#1a1a1a] text-white rounded text-xs font-medium hover:bg-[#2a2a2a]"
                    >
                      + Add Text
                    </button>
                  </div>

                  {textTemplates.map((template, index) => (
                    <div key={index} className="mb-4 p-4 border border-[#e5e5e5] rounded-md">
                      <div className="grid grid-cols-[1fr_40px] gap-4 mb-3">
                        <div>
                          <label className="block text-xs font-medium text-[#6b6b6b] mb-1">Template Name</label>
                          <input
                            type="text"
                            value={template.name}
                            onChange={(e) => updateTextTemplate(index, 'name', e.target.value)}
                            className="w-full px-3 py-2 border border-[#e5e5e5] rounded text-sm"
                          />
                        </div>
                        <div className="pt-6">
                          <button
                            onClick={() => deleteTextTemplate(index)}
                            className="text-[#999] hover:text-[#8a2a2a] transition-colors h-10 flex items-center justify-center"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#6b6b6b] mb-1">Message</label>
                        <textarea
                          value={template.body}
                          onChange={(e) => updateTextTemplate(index, 'body', e.target.value)}
                          className="w-full px-3 py-2 border border-[#e5e5e5] rounded text-sm min-h-[80px]"
                          maxLength={160}
                        />
                        <div className="text-xs text-[#999] mt-1">{template.body.length}/160 characters</div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="text-xs text-[#6b6b6b] mt-4 p-3 bg-[#f5f5f5] rounded">
                  <strong>Tip:</strong> Use variables like {`{{name}}`} and {`{{company}}`} in your templates. They'll be replaced with actual lead data.
                </div>
              </div>
            )}

            {/* Frequencies Tab */}
            {activeTab === 'frequencies' && (
              <div className="space-y-6">
                {/* Email Frequencies */}
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-sm font-medium text-[#1a1a1a]">Email Frequencies</h3>
                    <button
                      onClick={addEmailFrequency}
                      className="px-3 py-1.5 bg-[#1a1a1a] text-white rounded text-xs font-medium hover:bg-[#2a2a2a]"
                    >
                      + Add Frequency
                    </button>
                  </div>

                  {emailFrequencies.map((freq, index) => (
                    <div key={index} className="p-4 border border-[#e5e5e5] rounded-md">
                      <div className="grid grid-cols-[200px_100px_100px_100px_40px] gap-4 items-end mb-3">
                        <div>
                          <label className="block text-xs font-medium text-[#6b6b6b] mb-1">Name</label>
                          <input
                            type="text"
                            value={freq.name}
                            onChange={(e) => updateEmailFrequency(index, 'name', e.target.value)}
                            className="w-full px-3 py-2 border border-[#e5e5e5] rounded text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[#6b6b6b] mb-1">Days</label>
                          <input
                            type="number"
                            value={freq.days_interval}
                            onChange={(e) => updateEmailFrequency(index, 'days_interval', parseInt(e.target.value) || 1)}
                            min="0"
                            max="365"
                            className="w-full px-3 py-2 border border-[#e5e5e5] rounded text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[#6b6b6b] mb-1">BG Color</label>
                          <input
                            type="color"
                            value={freq.bg_color}
                            onChange={(e) => updateEmailFrequency(index, 'bg_color', e.target.value)}
                            className="w-full h-10 border border-[#e5e5e5] rounded cursor-pointer"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[#6b6b6b] mb-1">Text Color</label>
                          <input
                            type="color"
                            value={freq.text_color}
                            onChange={(e) => updateEmailFrequency(index, 'text_color', e.target.value)}
                            className="w-full h-10 border border-[#e5e5e5] rounded cursor-pointer"
                          />
                        </div>
                        <div>
                          <button
                            onClick={() => deleteEmailFrequency(index)}
                            className="text-[#999] hover:text-[#8a2a2a] transition-colors h-10 flex items-center justify-center"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#6b6b6b] mb-1">Preview</label>
                        <div 
                          className="px-2 py-1 text-xs rounded inline-block"
                          style={{ backgroundColor: freq.bg_color, color: freq.text_color }}
                        >
                          {freq.name}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Text Frequencies */}
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-sm font-medium text-[#1a1a1a]">Text Frequencies</h3>
                    <button
                      onClick={addTextFrequency}
                      className="px-3 py-1.5 bg-[#1a1a1a] text-white rounded text-xs font-medium hover:bg-[#2a2a2a]"
                    >
                      + Add Frequency
                    </button>
                  </div>

                  {textFrequencies.map((freq, index) => (
                    <div key={index} className="p-4 border border-[#e5e5e5] rounded-md">
                      <div className="grid grid-cols-[200px_100px_100px_100px_40px] gap-4 items-end mb-3">
                        <div>
                          <label className="block text-xs font-medium text-[#6b6b6b] mb-1">Name</label>
                          <input
                            type="text"
                            value={freq.name}
                            onChange={(e) => updateTextFrequency(index, 'name', e.target.value)}
                            className="w-full px-3 py-2 border border-[#e5e5e5] rounded text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[#6b6b6b] mb-1">Days</label>
                          <input
                            type="number"
                            value={freq.days_interval}
                            onChange={(e) => updateTextFrequency(index, 'days_interval', parseInt(e.target.value) || 1)}
                            min="0"
                            max="365"
                            className="w-full px-3 py-2 border border-[#e5e5e5] rounded text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[#6b6b6b] mb-1">BG Color</label>
                          <input
                            type="color"
                            value={freq.bg_color}
                            onChange={(e) => updateTextFrequency(index, 'bg_color', e.target.value)}
                            className="w-full h-10 border border-[#e5e5e5] rounded cursor-pointer"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[#6b6b6b] mb-1">Text Color</label>
                          <input
                            type="color"
                            value={freq.text_color}
                            onChange={(e) => updateTextFrequency(index, 'text_color', e.target.value)}
                            className="w-full h-10 border border-[#e5e5e5] rounded cursor-pointer"
                          />
                        </div>
                        <div>
                          <button
                            onClick={() => deleteTextFrequency(index)}
                            className="text-[#999] hover:text-[#8a2a2a] transition-colors h-10 flex items-center justify-center"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#6b6b6b] mb-1">Preview</label>
                        <div 
                          className="px-2 py-1 text-xs rounded inline-block"
                          style={{ backgroundColor: freq.bg_color, color: freq.text_color }}
                        >
                          {freq.name}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="text-xs text-[#6b6b6b] mt-4 p-3 bg-[#f5f5f5] rounded">
                  <strong>Tip:</strong> Set "Days" to 0 for "Off". Countdown timers will appear in cells when active.
                </div>
              </div>
            )}

            {/* Save Button */}
            <div className="flex gap-3 mt-8">
              <button
                onClick={() => {
                  setShowModal(false);
                  setStages(initialStages);
                  setStats(initialStats);
                  setColumns(initialColumns);
                  setEmailTemplates(initialEmailTemplates);
                  setTextTemplates(initialTextTemplates);
                  setEmailFrequencies(initialEmailFreqs);
                  setTextFrequencies(initialTextFreqs);
                }}
                className="flex-1 px-4 py-2 border border-[#e5e5e5] text-[#1a1a1a] rounded-md text-sm font-medium hover:bg-[#f5f5f5] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveConfig}
                className="flex-1 px-4 py-2 bg-[#1a1a1a] text-white rounded-md text-sm font-medium hover:bg-[#2a2a2a] transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
