'use client';

interface Lead {
  id: string;
  name: string;
  email: string;
  company?: string;
}

export default function LeadSelector({ leads }: { leads: Lead[] }) {
  return (
    <div className="space-y-2 max-h-96 overflow-y-auto">
      <div className="mb-4">
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <input
            type="checkbox"
            className="w-4 h-4 text-blue-600 rounded"
            onChange={(e) => {
              const checkboxes = document.querySelectorAll('input[name="leads[]"]');
              checkboxes.forEach((checkbox: any) => {
                checkbox.checked = e.currentTarget.checked;
              });
            }}
          />
          Select All ({leads.length} leads)
        </label>
      </div>
      {leads.map((lead) => (
        <label
          key={lead.id}
          className="flex items-center gap-2 p-3 border border-gray-200 rounded-md hover:bg-gray-50 cursor-pointer"
        >
          <input
            type="checkbox"
            name="leads[]"
            value={lead.id}
            className="w-4 h-4 text-blue-600 rounded"
          />
          <div className="flex-1">
            <div className="font-medium text-gray-900">{lead.name}</div>
            <div className="text-sm text-gray-600">
              {lead.company && `${lead.company} • `}
              {lead.email}
            </div>
          </div>
        </label>
      ))}
    </div>
  );
}
