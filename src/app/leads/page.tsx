'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import Papa from 'papaparse';
import Link from 'next/link';

export default function LeadsUploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    setSuccess(false);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const csv = event.target?.result as string;
      const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });

      if (parsed.errors.length > 0) {
        setError('Invalid CSV format');
        setUploading(false);
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('Not logged in');
        setUploading(false);
        return;
      }

      const leads = parsed.data.map((row: any) => ({
        user_id: user.id,
        name: row.Name || row.name || '',
        company: row.Company || row.company || '',
        email: row.Email || row.email || '',
        phone: row.Phone || row.phone || '',
        notes: row.Notes || row.notes || '',
      }));

      const { error } = await supabase.from('Leads').insert(leads);

      setUploading(false);

      if (error) {
        setError(error.message);
      } else {
        setSuccess(true);
      }
    };

    reader.readAsText(file);
  };

  return (
    <main className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4">
        {/* Back button at the top */}
        <div className="mb-8">
          <Link
            href="/dashboard"
            className="inline-flex items-center px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition"
          >
            ← Back to Dashboard
          </Link>
        </div>

        <h1 className="text-3xl font-bold mb-8">Upload Your Leads</h1>

        <div className="bg-white p-8 rounded-lg shadow">
          <input
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            className="mb-4 block w-full text-sm text-gray-500
              file:mr-4 file:py-2 file:px-4
              file:rounded-full file:border-0
              file:text-sm file:font-semibold
              file:bg-blue-50 file:text-blue-700
              hover:file:bg-blue-100"
          />

          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="mt-4 px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {uploading ? 'Uploading...' : 'Upload CSV'}
          </button>

          {error && <p className="mt-4 text-red-600">{error}</p>}
          {success && <p className="mt-4 text-green-600">Leads uploaded successfully!</p>}
        </div>
      </div>
    </main>
  );
}