'use client';

import { useState } from 'react';

interface Lead {
  name: string;
  email: string;
  phone?: string;
  company?: string;
  notes?: string;
}

interface ExportListButtonProps {
  leads: Lead[];
  listName: string;
}

export default function ExportListButton({ leads, listName }: ExportListButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleExport = () => {
    if (leads.length === 0) {
      alert('No leads to export');
      return;
    }

    setLoading(true);

    try {
      // Create CSV content
      const headers = ['Name', 'Email', 'Phone', 'Company', 'Notes'];
      const csvRows = [
        headers.join(','),
        ...leads.map(lead => [
          `"${lead.name || ''}"`,
          `"${lead.email || ''}"`,
          `"${lead.phone || ''}"`,
          `"${lead.company || ''}"`,
          `"${lead.notes || ''}"`,
        ].join(','))
      ];

      const csvContent = csvRows.join('\n');
      
      // Create blob and download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      link.setAttribute('href', url);
      link.setAttribute('download', `${listName.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.csv`);
      link.style.visibility = 'hidden';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting leads:', error);
      alert('Failed to export leads');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={loading || leads.length === 0}
      className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {loading ? 'Exporting...' : '↓ Export List'}
    </button>
  );
}
