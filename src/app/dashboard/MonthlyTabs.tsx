'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface MonthData {
  monthKey: string;
  customName: string;
}

interface MonthlyTabsProps {
  availableMonths: MonthData[];
  currentMonth: string;
  onMonthChange: (month: string) => void;
}

export default function MonthlyTabs({ availableMonths, currentMonth, onMonthChange }: MonthlyTabsProps) {
  const [showNewMonthModal, setShowNewMonthModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingMonth, setEditingMonth] = useState<{ monthKey: string; currentName: string } | null>(null);
  const [newMonthName, setNewMonthName] = useState('');
  const [editMonthName, setEditMonthName] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; monthKey: string } | null>(null);
  const router = useRouter();

  const createNewMonth = async () => {
    if (!newMonthName.trim()) {
      alert('Please enter a name');
      return;
    }

    try {
      const res = await fetch('/api/dashboard/create-month', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customName: newMonthName }),
      });

      if (res.ok) {
        const { monthlyDashboard } = await res.json();
        setShowNewMonthModal(false);
        setNewMonthName('');
        router.refresh();
        onMonthChange(monthlyDashboard.month_key);
      } else {
        alert('Failed to create page');
      }
    } catch (error) {
      console.error('Error creating page:', error);
      alert('Failed to create page');
    }
  };

  const handleContextMenu = (e: React.MouseEvent, monthKey: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, monthKey });
  };

  const handleEditMonth = (monthKey: string) => {
    const month = availableMonths.find(m => m.monthKey === monthKey);
    if (month) {
      setEditingMonth({ monthKey, currentName: month.customName });
      setEditMonthName(month.customName);
      setShowEditModal(true);
    }
    setContextMenu(null);
  };

  const saveEditMonth = async () => {
    if (!editMonthName.trim()) {
      alert('Please enter a name');
      return;
    }

    if (!editingMonth) return;

    try {
      const res = await fetch('/api/dashboard/update-month', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          monthKey: editingMonth.monthKey, 
          customName: editMonthName 
        }),
      });

      if (res.ok) {
        setShowEditModal(false);
        setEditingMonth(null);
        setEditMonthName('');
        router.refresh();
      } else {
        alert('Failed to update page name');
      }
    } catch (error) {
      console.error('Error updating page:', error);
      alert('Failed to update page name');
    }
  };

  const handleDeleteMonth = async (monthKey: string) => {
    if (availableMonths.length <= 1) {
      alert('Cannot delete the last page');
      return;
    }

    if (!confirm('Are you sure you want to delete this page? All leads in this page will remain but will need to be reassigned.')) {
      return;
    }

    try {
      const res = await fetch('/api/dashboard/delete-month', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthKey }),
      });

      if (res.ok) {
        // Switch to first available month if deleting current month
        if (monthKey === currentMonth) {
          const nextMonth = availableMonths.find(m => m.monthKey !== monthKey);
          if (nextMonth) {
            onMonthChange(nextMonth.monthKey);
          }
        }
        router.refresh();
      } else {
        alert('Failed to delete page');
      }
    } catch (error) {
      console.error('Error deleting page:', error);
      alert('Failed to delete page');
    }
    
    setContextMenu(null);
  };

  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu]);

  return (
    <>
      <div className="flex items-center gap-2 mb-4 border-b border-[#e5e5e5]">
        {availableMonths.map(month => (
          <button
            key={month.monthKey}
            onClick={() => onMonthChange(month.monthKey)}
            onContextMenu={(e) => handleContextMenu(e, month.monthKey)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              month.monthKey === currentMonth
                ? 'text-[#1a1a1a] border-b-2 border-[#1a1a1a]'
                : 'text-[#6b6b6b] hover:text-[#1a1a1a]'
            }`}
          >
            {month.customName}
          </button>
        ))}
        
        <button
          onClick={() => setShowNewMonthModal(true)}
          className="px-4 py-2 text-sm font-medium text-[#6b6b6b] hover:text-[#1a1a1a] transition-colors"
        >
          + New
        </button>
      </div>

      {/* Context Menu for Edit/Delete */}
      {contextMenu && (
        <div
          className="fixed bg-white border border-[#e5e5e5] rounded-md shadow-lg py-1 z-50"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button
            onClick={() => handleEditMonth(contextMenu.monthKey)}
            className="w-full px-4 py-2 text-sm text-left text-[#1a1a1a] hover:bg-[#f5f5f5] transition-colors"
          >
            Edit Name
          </button>
          <button
            onClick={() => handleDeleteMonth(contextMenu.monthKey)}
            className="w-full px-4 py-2 text-sm text-left text-[#8a2a2a] hover:bg-[#f5f5f5] transition-colors"
          >
            Delete Page
          </button>
        </div>
      )}

      {/* New Page Modal */}
      {showNewMonthModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowNewMonthModal(false)}>
          <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-[#1a1a1a] mb-6">Create new page</h2>
            
            <div className="mb-6">
              <label className="block text-sm font-medium text-[#1a1a1a] mb-2">
                Page Name
              </label>
              <input
                type="text"
                value={newMonthName}
                onChange={(e) => setNewMonthName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createNewMonth()}
                className="w-full px-3 py-2 border border-[#e5e5e5] rounded-md text-sm"
                placeholder="e.g. March 2026, Q1 Pipeline, etc."
                autoFocus
              />
              <p className="text-xs text-[#6b6b6b] mt-1">
                This will create a new tab for tracking leads separately
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowNewMonthModal(false);
                  setNewMonthName('');
                }}
                className="flex-1 px-4 py-2 border border-[#e5e5e5] text-[#1a1a1a] rounded-md text-sm font-medium hover:bg-[#f5f5f5] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createNewMonth}
                className="flex-1 px-4 py-2 bg-[#1a1a1a] text-white rounded-md text-sm font-medium hover:bg-[#2a2a2a] transition-colors"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Page Modal */}
      {showEditModal && editingMonth && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowEditModal(false)}>
          <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-[#1a1a1a] mb-6">Edit page name</h2>
            
            <div className="mb-6">
              <label className="block text-sm font-medium text-[#1a1a1a] mb-2">
                Page Name
              </label>
              <input
                type="text"
                value={editMonthName}
                onChange={(e) => setEditMonthName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveEditMonth()}
                className="w-full px-3 py-2 border border-[#e5e5e5] rounded-md text-sm"
                placeholder="e.g. March 2026, Q1 Pipeline, etc."
                autoFocus
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingMonth(null);
                  setEditMonthName('');
                }}
                className="flex-1 px-4 py-2 border border-[#e5e5e5] text-[#1a1a1a] rounded-md text-sm font-medium hover:bg-[#f5f5f5] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveEditMonth}
                className="flex-1 px-4 py-2 bg-[#1a1a1a] text-white rounded-md text-sm font-medium hover:bg-[#2a2a2a] transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
