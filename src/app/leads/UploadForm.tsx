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
      const selectedFile = e.target.files[0];
      const extension = selectedFile.name.split('.').pop()?.toLowerCase();
      
      if (extension !== 'csv' && extension !== 'txt') {
        setMessage('Please select a CSV or TXT file');
        return;
      }
      
      setFile(selectedFile);
      setMessage('');
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setMessage('Please select a CSV or TXT file');
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

    // Detect delimiter based on file extension or content
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    let delimiter = ','; // default for CSV

    // For .txt files, try to auto-detect delimiter
    if (fileExtension === 'txt') {
      // Read first line to detect delimiter
      const reader = new FileReader();
      reader.onload = async (e) => {
        const text = e.target?.result as string;
        const firstLine = text.split('\n')[0];
        
        // Auto-detect delimiter: prefer tab, fallback to comma
        if (firstLine.includes('\t')) {
          delimiter = '\t';
        } else if (firstLine.includes(',')) {
          delimiter = ',';
        } else if (firstLine.includes('|')) {
          delimiter = '|';
        }

        // Parse with detected delimiter
        parseFile(file, delimiter, user);
      };
      reader.readAsText(file);
    } else {
      // CSV file - use comma delimiter
      parseFile(file, delimiter, user);
    }
  };

  // Pattern detection helpers
  const isEmail = (value: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value);
  };

  const isPhone = (value: string): boolean => {
    const phoneRegex = /^[\d\s\-\(\)\+\.]{7,}$/;
    return phoneRegex.test(value);
  };

  const isLikelyName = (value: string): boolean => {
    // Names are typically 2-4 words, contain letters, possibly spaces
    return /^[a-zA-Z\s\-\.]{2,50}$/.test(value) && value.split(' ').length <= 4;
  };

  const isLikelyCompany = (value: string): boolean => {
    // Company names often have these indicators
    const companyKeywords = [
      'inc', 'llc', 'corp', 'ltd', 'limited', 'company', 'co', 'group',
      'enterprises', 'solutions', 'services', 'consulting', 'partners',
      'agency', 'studio', 'industries', 'holdings', 'ventures', 'capital',
      'technologies', 'tech', 'systems', 'associates', 'international'
    ];
    
    const lowerValue = value.toLowerCase();
    return companyKeywords.some(keyword => lowerValue.includes(keyword)) ||
           value.split(' ').length > 4; // Companies often have longer names
  };

  const isShortName = (value: string): boolean => {
    // Short single words are likely first or last names
    const trimmed = value.trim();
    return trimmed.length > 1 && trimmed.length < 20 && !trimmed.includes(' ');
  };

  // Positional column mapper for files WITHOUT headers
  const positionalColumnMapper = (row: string[]): any => {
    const result: any = {
      name: '',
      email: '',
      phone: null,
      company: null,
      notes: null,
    };

    // Find email and phone positions (most reliable identifiers)
    let emailIndex = -1;
    let phoneIndex = -1;

    row.forEach((value, index) => {
      const trimmed = String(value || '').trim();
      if (isEmail(trimmed)) {
        emailIndex = index;
        result.email = trimmed;
      } else if (isPhone(trimmed)) {
        phoneIndex = index;
        result.phone = trimmed;
      }
    });

    // Find the key anchor point (email or phone, whichever comes first)
    const keyIndex = Math.min(
      ...[emailIndex, phoneIndex].filter(i => i !== -1)
    );

    // Analyze text columns BEFORE email/phone
    const namePartIndices: number[] = [];
    let companyIndex = -1;

    if (keyIndex !== Infinity) {
      // Look at columns before email/phone
      for (let i = 0; i < keyIndex; i++) {
        const trimmed = String(row[i] || '').trim();
        if (trimmed && !isPhone(trimmed) && !isEmail(trimmed)) {
          // Check if it's text
          if (/^[a-zA-Z\s\-\.&,']+$/.test(trimmed)) {
            // Determine if it's a company or person name
            if (isLikelyCompany(trimmed)) {
              // This looks like a company name
              if (companyIndex === -1) {
                companyIndex = i;
              }
            } else if (isShortName(trimmed) || namePartIndices.length < 2) {
              // Short names (like "John", "Smith") are likely person name parts
              // Or if we haven't found 2 name parts yet, keep collecting
              namePartIndices.push(i);
            } else {
              // If we already have 2 name parts and this is a longer text, it's probably company
              if (companyIndex === -1) {
                companyIndex = i;
              }
            }
          }
        }
      }
    } else {
      // No email/phone found, use heuristics on first few columns
      for (let i = 0; i < Math.min(4, row.length); i++) {
        const trimmed = String(row[i] || '').trim();
        if (trimmed && /^[a-zA-Z\s\-\.&,']+$/.test(trimmed)) {
          if (isLikelyCompany(trimmed) && companyIndex === -1) {
            companyIndex = i;
          } else if (namePartIndices.length < 2 && !isLikelyCompany(trimmed)) {
            namePartIndices.push(i);
          }
        }
      }
    }

    // Build name from collected name parts (typically first and last name)
    if (namePartIndices.length > 0) {
      result.name = namePartIndices
        .slice(0, 3) // Max 3 name parts (e.g., First Middle Last)
        .map(idx => String(row[idx] || '').trim())
        .filter(part => part)
        .join(' ');
    }

    // Set company if found before email/phone
    if (companyIndex !== -1) {
      result.company = String(row[companyIndex] || '').trim();
    }

    // Find additional company/notes from columns AFTER email/phone
    const usedIndices = [emailIndex, phoneIndex, companyIndex, ...namePartIndices].filter(i => i !== -1);
    const remaining = row
      .map((val, idx) => ({ val: String(val || '').trim(), idx }))
      .filter(item => !usedIndices.includes(item.idx) && item.val);

    // If company not found yet, look after email/phone
    if (!result.company && remaining.length > 0) {
      // Prioritize columns after the key identifiers
      const afterKeyColumns = remaining.filter(item => {
        if (emailIndex !== -1 && phoneIndex !== -1) {
          return item.idx > Math.max(emailIndex, phoneIndex);
        } else if (emailIndex !== -1) {
          return item.idx > emailIndex;
        } else if (phoneIndex !== -1) {
          return item.idx > phoneIndex;
        }
        return true;
      });

      if (afterKeyColumns.length > 0) {
        result.company = afterKeyColumns[0].val;
        if (afterKeyColumns.length > 1) {
          result.notes = afterKeyColumns.slice(1).map(r => r.val).join(' | ');
        }
      } else if (remaining.length > 0) {
        result.company = remaining[0].val;
        if (remaining.length > 1) {
          result.notes = remaining.slice(1).map(r => r.val).join(' | ');
        }
      }
    } else if (remaining.length > 0) {
      // Company already found, remaining columns are notes
      result.notes = remaining.map(r => r.val).join(' | ');
    }

    return result;
  };

  // Smart column mapper - finds the right value regardless of column name or order
  const smartColumnMapper = (row: any): any => {
    const rowKeys = Object.keys(row);
    
    // Helper to find column by multiple possible names (case-insensitive)
    const findColumn = (possibleNames: string[]): string | null => {
      for (const key of rowKeys) {
        const lowerKey = key.toLowerCase().trim();
        if (possibleNames.some(name => lowerKey.includes(name.toLowerCase()))) {
          return row[key];
        }
      }
      return null;
    };

    // Map each field with various possible column names
    const name = findColumn([
      'name', 'full name', 'fullname', 'contact name', 'contact', 
      'first name', 'firstname', 'lead name', 'person'
    ]);

    const email = findColumn([
      'email', 'e-mail', 'email address', 'emailaddress', 
      'contact email', 'mail', 'email_address'
    ]);

    const phone = findColumn([
      'phone', 'telephone', 'tel', 'mobile', 'cell', 
      'phone number', 'phonenumber', 'contact number', 'phone_number'
    ]);

    const company = findColumn([
      'company', 'organization', 'org', 'business', 
      'company name', 'companyname', 'employer', 'account'
    ]);

    const notes = findColumn([
      'notes', 'note', 'comments', 'comment', 'description', 
      'details', 'memo', 'remarks', 'message'
    ]);

    return {
      name: name || '',
      email: email || '',
      phone: phone || null,
      company: company || null,
      notes: notes || null,
    };
  };

  const detectHeaders = (firstRow: any): boolean => {
    // Check if first row looks like headers or data
    const values = Object.values(firstRow).map(v => String(v || '').trim());
    
    // If any value in first row is an email or phone, it's data (no headers)
    const hasEmailOrPhone = values.some(v => isEmail(v) || isPhone(v));
    
    return !hasEmailOrPhone;
  };

  const parseFile = (file: File, delimiter: string, user: any) => {
    // First parse without header to check if file has headers
    Papa.parse(file, {
      header: false,
      skipEmptyLines: true,
      delimiter: delimiter,
      preview: 1, // Only read first row
      complete: (previewResults) => {
        const firstRowArray = previewResults.data[0] as string[];
        const hasHeaders = firstRowArray && firstRowArray.some(val => {
          const v = String(val || '').trim().toLowerCase();
          return ['name', 'email', 'phone', 'company', 'notes', 'contact', 'organization'].some(
            keyword => v.includes(keyword)
          );
        });

        // Now parse the full file
        Papa.parse(file, {
          header: hasHeaders,
          skipEmptyLines: true,
          delimiter: delimiter,
          complete: async (results) => {
            let leads;

            if (hasHeaders) {
              // Use smart column mapper for files WITH headers
              leads = results.data
                .map((row: any) => {
                  const mapped = smartColumnMapper(row);
                  
                  // Skip rows without name or email (required fields)
                  if (!mapped.name || !mapped.email) {
                    return null;
                  }

                  return {
                    user_id: user.id,
                    name: mapped.name,
                    email: mapped.email,
                    phone: mapped.phone,
                    company: mapped.company,
                    notes: mapped.notes,
                    list_id: selectedListId && selectedListId !== 'unlisted' ? selectedListId : null,
                  };
                })
                .filter((lead: any) => lead !== null);
            } else {
              // Use positional mapper for files WITHOUT headers
              leads = results.data
                .map((row: any) => {
                  // row is an array of values
                  const rowArray = Array.isArray(row) ? row : Object.values(row);
                  const mapped = positionalColumnMapper(rowArray);
                  
                  // Skip rows without name or email (required fields)
                  if (!mapped.name || !mapped.email) {
                    return null;
                  }

                  return {
                    user_id: user.id,
                    name: mapped.name,
                    email: mapped.email,
                    phone: mapped.phone,
                    company: mapped.company,
                    notes: mapped.notes,
                    list_id: selectedListId && selectedListId !== 'unlisted' ? selectedListId : null,
                  };
                })
                .filter((lead: any) => lead !== null);
            }

            if (leads.length === 0) {
              setMessage('❌ No valid leads found. Make sure your file has Name and Email data.');
              setLoading(false);
              return;
            }

            const { error } = await supabase.from('leads').insert(leads);

            if (error) {
              setMessage(`Error: ${error.message}`);
            } else {
              setMessage(`✓ Successfully uploaded ${leads.length} leads`);
              setFile(null);
              setTimeout(() => {
                router.refresh();
              }, 1000);
            }
            setLoading(false);
          },
          error: (error) => {
            setMessage(`Error parsing file: ${error.message}`);
            setLoading(false);
          },
        });
      },
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          CSV or TXT File
        </label>
        <div className="flex items-center space-x-4">
          <label className="px-6 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 cursor-pointer transition-colors">
            Choose File
            <input
              type="file"
              accept=".csv,.txt"
              onChange={handleFileChange}
              className="hidden"
            />
          </label>
          <span className="text-sm text-gray-600">
            {file ? file.name : 'No file chosen'}
          </span>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          <strong>Required:</strong> Name, Email (with or without headers)
        </p>
        <p className="mt-1 text-xs text-gray-500">
          <strong>Optional:</strong> Phone, Company, Notes
        </p>
        <p className="mt-1 text-xs text-gray-400">
          ✨ Auto-detects: Headers, column order, delimiters, and data patterns
        </p>
      </div>

      <button
        onClick={handleUpload}
        disabled={loading || !file}
        className="w-full px-6 py-3 bg-black text-white rounded-lg font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Uploading...' : 'Upload Leads'}
      </button>

      {message && (
        <div className={`text-sm text-center ${message.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>
          {message}
        </div>
      )}
    </div>
  );
}
