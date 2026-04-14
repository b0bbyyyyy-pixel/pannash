'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

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
  const [finding, setFinding] = useState(false);
  const router = useRouter();

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

  const handleAIEmailFinder = async () => {
    if (selectedLeads.length === 0) return;

    setFinding(true);
    try {
      const response = await fetch('/api/leads/find-emails-by-ids', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadIds: selectedLeads }),
      });

      const data = await response.json();
      
      if (response.ok) {
        if (data.suggestions && data.suggestions.length > 0) {
          alert(
            `✅ AI Email Finder complete!\n\n` +
            `Updated ${data.suggestions.length} lead(s) with AI-suggested emails.\n\n` +
            `${data.skipped > 0 ? `Skipped ${data.skipped} lead(s) (already have valid emails or missing name/company).\n\n` : ''}` +
            `The invalid/missing emails have been replaced.`
          );
          router.refresh();
          onClearSelection();
        } else {
          alert(
            data.skipped > 0 
              ? `No email suggestions made.\n\n${data.skipped} lead(s) were skipped (already have valid emails or missing name/company).`
              : '✅ All selected leads already have valid emails!'
          );
        }
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Error finding emails:', error);
      alert('Failed to find emails');
    } finally {
      setFinding(false);
    }
  };

  if (selectedLeads.length === 0) return null;

  return (
    <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 bg-black text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-4 z-50">
      <span className="text-sm font-medium">
        {selectedLeads.length} lead{selectedLeads.length > 1 ? 's' : ''} selected
      </span>
      <button
        onClick={handleAIEmailFinder}
        disabled={finding || loading}
        className="px-4 py-2 bg-[#722F37] text-white rounded-lg text-sm font-medium hover:bg-[#8A9A5B] disabled:opacity-50 transition-colors"
      >
        {finding ? 'Finding...' : 'AI Email Finder'}
      </button>
      <button
        onClick={handleBulkDelete}
        disabled={loading || finding}
        className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
      >
        {loading ? 'Deleting...' : 'Delete Selected'}
      </button>
      <button
        onClick={onClearSelection}
        disabled={loading || finding}
        className="px-4 py-2 bg-gray-600 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}
