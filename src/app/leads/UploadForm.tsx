'use client';

import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import Papa from 'papaparse';
import { useRouter } from 'next/navigation';

interface UploadFormProps {
  selectedListId?: string;
}

export default function UploadForm({ selectedListId }: UploadFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const router = useRouter();

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setMessage('Please select a CSV file');
      return;
    }

    setLoading(true);
    setMessage('');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setMessage('Not authenticated');
      setLoading(false);
      return;
    }

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const leads = results.data.map((row: any) => ({
          user_id: user.id,
          name: row.Name || row.name,
          email: row.Email || row.email,
          phone: row.Phone || row.phone || null,
          company: row.Company || row.company || null,
          notes: row.Notes || row.notes || null,
          status: 'new',
          list_id: selectedListId && selectedListId !== 'unlisted' ? selectedListId : null,
        }));

        const { error } = await supabase.from('leads').insert(leads);

        if (error) {
          setMessage(`Error: ${error.message}`);
        } else {
          setMessage(`✓ Successfully uploaded ${leads.length} leads`);
          setFile(null);
          setListName('');
          setTimeout(() => {
            router.refresh();
          }, 1000);
        }
        setLoading(false);
      },
      error: (error) => {
        setMessage(`Error parsing CSV: ${error.message}`);
        setLoading(false);
      },
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          CSV File
        </label>
        <div className="flex items-center space-x-4">
          <label className="px-6 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 cursor-pointer transition-colors">
            Choose File
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
            />
          </label>
          <span className="text-sm text-gray-600">
            {file ? file.name : 'No file chosen'}
          </span>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          CSV should have columns: Name, Email, Phone, Company, Notes
        </p>
      </div>

      <button
        onClick={handleUpload}
        disabled={loading || !file}
        className="w-full px-6 py-3 bg-black text-white rounded-lg font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Uploading...' : 'Upload CSV'}
      </button>

      {message && (
        <div className={`text-sm text-center ${message.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>
          {message}
        </div>
      )}
    </div>
  );
}
