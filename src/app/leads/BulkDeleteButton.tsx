'use client';

import { useState } from 'react';

interface BulkDeleteButtonProps {
  selectedLeads: string[];
  onClearSelection: () => void;
  deleteMultipleLeads: (formData: FormData) => Promise<void>;
}

export default function BulkDeleteButton({ 
  selectedLeads, 
  onClearSelection,
  deleteMultipleLeads 
}: BulkDeleteButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleBulkDelete = async () => {
    if (selectedLeads.length === 0) return;
    
    const count = selectedLeads.length;
    if (!confirm(`Are you sure you want to delete ${count} lead${count > 1 ? 's' : ''}?`)) {
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      selectedLeads.forEach(id => {
        formData.append('leadIds[]', id);
      });
      await deleteMultipleLeads(formData);
      onClearSelection();
    } catch (error) {
      console.error('Error deleting leads:', error);
      alert('Failed to delete leads');
    } finally {
      setLoading(false);
    }
  };

  if (selectedLeads.length === 0) return null;

  return (
    <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 bg-black text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-4 z-50">
      <span className="text-sm font-medium">
        {selectedLeads.length} lead{selectedLeads.length > 1 ? 's' : ''} selected
      </span>
      <button
        onClick={handleBulkDelete}
        disabled={loading}
        className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
      >
        {loading ? 'Deleting...' : 'Delete Selected'}
      </button>
      <button
        onClick={onClearSelection}
        className="px-4 py-2 bg-gray-600 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}
