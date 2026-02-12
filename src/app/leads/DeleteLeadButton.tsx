'use client';

import { useState } from 'react';

interface DeleteLeadButtonProps {
  leadId: string;
  deleteLead: (formData: FormData) => Promise<void>;
}

export default function DeleteLeadButton({ leadId, deleteLead }: DeleteLeadButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this lead?')) {
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('leadId', leadId);
      await deleteLead(formData);
    } catch (error) {
      console.error('Error deleting lead:', error);
      alert('Failed to delete lead');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className="text-red-600 hover:text-red-800 text-sm disabled:opacity-50"
    >
      {loading ? 'Deleting...' : 'Delete'}
    </button>
  );
}
