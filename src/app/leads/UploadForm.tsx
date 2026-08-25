'use client';

import { useState, useRef } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import Papa from 'papaparse';
import { useRouter } from 'next/navigation';
import JSZip from 'jszip';
import { parseLeadPasteText } from '@/lib/parse-lead-paste';

interface UploadFormProps {
  selectedListId?: string;
}

interface ParsedLead {
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  notes: string | null;
}

export default function UploadForm({ selectedListId }: UploadFormProps) {
  const [mode, setMode] = useState<'file' | 'paste' | 'zip' | 'quick'>('file');
  const [file, setFile] = useState<File | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [parsedPreview, setParsedPreview] = useState<ParsedLead[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  // Quick Paste state
  const [quickText, setQuickText] = useState('');
  const [quickPreview, setQuickPreview] = useState<ParsedLead[]>([]);

  // ZIP pack state
  const [zipDragging, setZipDragging] = useState(false);
  const [zipPreview, setZipPreview] = useState<ParsedLead[]>([]);
  const [zipParsing, setZipParsing] = useState(false);
  const [zipProgress, setZipProgress] = useState('');
  const zipInputRef = useRef<HTMLInputElement>(null);
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
    const v = value.trim();
    // Exclude SSN format (XXX-XX-XXXX or XXX XX XXXX)
    if (/^\d{3}[-\s]\d{2}[-\s]\d{4}$/.test(v)) return false;
    // Exclude dates (YYYY-MM-DD or MM/DD/YYYY etc.)
    if (/^\d{4}[-\/]\d{2}[-\/]\d{2}$/.test(v) || /^\d{2}[-\/]\d{2}[-\/]\d{4}$/.test(v)) return false;
    // Exclude ZIP codes (exactly 5 digits)
    if (/^\d{5}$/.test(v)) return false;
    // Must contain at least 10 digits (standard US phone)
    const digitsOnly = v.replace(/\D/g, '');
    if (digitsOnly.length < 10 || digitsOnly.length > 15) return false;
    // Must look like a phone: only digits, spaces, dashes, parens, dots, plus
    return /^[\d\s\-\(\)\+\.]+$/.test(v);
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

    // Find email and ALL phone positions
    let emailIndex = -1;
    const phoneIndices: number[] = [];

    row.forEach((value, index) => {
      const trimmed = String(value || '').trim();
      if (isEmail(trimmed)) {
        emailIndex = index;
        result.email = trimmed;
      } else if (isPhone(trimmed)) {
        phoneIndices.push(index);
      }
    });

    // Primary phone = first phone found; extras go to notes
    const phoneIndex = phoneIndices[0] ?? -1;
    if (phoneIndex !== -1) result.phone = String(row[phoneIndex] || '').trim();
    const extraPhones = phoneIndices.slice(1).map(i => String(row[i] || '').trim()).filter(Boolean);

    // Find the key anchor point (email or first phone, whichever comes first)
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
    const usedIndices = [emailIndex, ...phoneIndices, companyIndex, ...namePartIndices].filter(i => i !== -1);
    const remaining = row
      .map((val, idx) => ({ val: String(val || '').trim(), idx }))
      .filter(item => !usedIndices.includes(item.idx) && item.val);

    // If company not found yet, look after email/phone
    if (!result.company && remaining.length > 0) {
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
        const leftover = afterKeyColumns.slice(1).map(r => r.val);
        result.notes = [...extraPhones, ...leftover].join(' | ') || null;
      } else if (remaining.length > 0) {
        result.company = remaining[0].val;
        const leftover = remaining.slice(1).map(r => r.val);
        result.notes = [...extraPhones, ...leftover].join(' | ') || null;
      } else {
        result.notes = extraPhones.join(' | ') || null;
      }
    } else {
      // Company already found, remaining columns + extra phones go to notes
      const leftover = remaining.map(r => r.val);
      result.notes = [...extraPhones, ...leftover].join(' | ') || null;
    }

    return result;
  };

  // Smart column mapper - finds the right value regardless of column name or order
  const smartColumnMapper = (row: any): any => {
    const rowKeys = Object.keys(row);

    const findColumn = (possibleNames: string[]): string | null => {
      for (const key of rowKeys) {
        const lowerKey = key.toLowerCase().trim();
        if (possibleNames.some(name => lowerKey.includes(name.toLowerCase()))) {
          return String(row[key] || '').trim() || null;
        }
      }
      return null;
    };

    // Find ALL phone columns (primary + alternates like "phone2", "alt phone", "mobile")
    const phoneKeys = rowKeys.filter(key => {
      const k = key.toLowerCase().trim();
      return ['phone', 'telephone', 'tel', 'mobile', 'cell', 'contact number'].some(p => k.includes(p));
    });
    const phoneValues = phoneKeys.map(k => String(row[k] || '').trim()).filter(v => v && isPhone(v));
    const primaryPhone = phoneValues[0] || null;
    const extraPhoneNote = phoneValues.slice(1).join(' | ');

    const name = findColumn(['name', 'full name', 'fullname', 'contact name', 'contact', 'first name', 'firstname', 'lead name', 'person']);
    const email = findColumn(['email', 'e-mail', 'email address', 'emailaddress', 'contact email', 'mail', 'email_address']);
    const company = findColumn(['company', 'organization', 'org', 'business', 'company name', 'companyname', 'employer', 'account']);
    const baseNotes = findColumn(['notes', 'note', 'comments', 'comment', 'description', 'details', 'memo', 'remarks', 'message']);

    const combinedNotes = [extraPhoneNote, baseNotes].filter(Boolean).join(' | ') || null;

    return {
      name: name || '',
      email: email || '',
      phone: primaryPhone,
      company: company || null,
      notes: combinedNotes,
    };
  };

  const detectHeaders = (firstRow: any): boolean => {
    // Check if first row looks like headers or data
    const values = Object.values(firstRow).map(v => String(v || '').trim());
    
    // If any value in first row is an email or phone, it's data (no headers)
    const hasEmailOrPhone = values.some(v => isEmail(v) || isPhone(v));
    
    return !hasEmailOrPhone;
  };

  // Parse raw pasted text (tab or comma separated) into leads
  const parsePastedText = (text: string): ParsedLead[] => {
    if (!text.trim()) return [];

    // Detect delimiter: if most lines have tabs, use tab; else comma
    const lines = text.trim().split('\n');
    const tabCount = lines[0]?.split('\t').length ?? 1;
    const commaCount = lines[0]?.split(',').length ?? 1;
    const delimiter = tabCount >= commaCount ? '\t' : ',';

    const result = Papa.parse<string[]>(text.trim(), {
      delimiter,
      skipEmptyLines: true,
      header: false,
    });

    if (!result.data || result.data.length === 0) return [];

    // Check if first row looks like headers
    const firstRow = result.data[0] as string[];
    const headerKeywords = ['name', 'email', 'phone', 'company', 'notes', 'contact', 'first', 'last', 'organization', 'mobile'];
    const hasHeaders = firstRow.some(v =>
      headerKeywords.some(k => String(v).trim().toLowerCase().includes(k))
    );

    const dataRows = hasHeaders ? result.data.slice(1) : result.data;

    if (hasHeaders) {
      // Build a header-keyed object per row
      const headers = firstRow.map(h => String(h).trim().toLowerCase());
      return dataRows
        .map(row => {
          const obj: Record<string, string> = {};
          (row as string[]).forEach((val, i) => { obj[headers[i] || `col${i}`] = String(val || '').trim(); });
          return smartColumnMapper(obj);
        })
        .filter(l => l.name || l.email || l.phone);
    } else {
      return dataRows
        .map(row => positionalColumnMapper((row as string[]).map(v => String(v || '').trim())))
        .filter(l => l.name || l.email || l.phone);
    }
  };

  const handlePasteChange = (text: string) => {
    setPasteText(text);
    setMessage('');
    if (text.trim()) {
      const parsed = parsePastedText(text);
      setParsedPreview(parsed);
    } else {
      setParsedPreview([]);
    }
  };

  const handlePasteUpload = async () => {
    if (parsedPreview.length === 0) {
      setMessage('No leads detected. Paste data from Excel first.');
      return;
    }
    setLoading(true);
    setMessage('');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setMessage('Not authenticated'); setLoading(false); return; }

    const now = new Date().toISOString();
    const leads = parsedPreview.map(l => ({
      user_id: user.id,
      name: l.name || (l.email ? l.email.split('@')[0] : 'Unknown'),
      email: l.email || '',
      phone: l.phone || null,
      company: l.company || null,
      notes: l.notes || null,
      list_id: selectedListId && selectedListId !== 'unlisted' ? selectedListId : null,
      last_contact: now,
    }));

    const { error } = await supabase.from('leads').insert(leads);
    if (error) {
      setMessage(`Error: ${error.message}`);
    } else {
      setMessage(`✓ Imported ${leads.length} lead${leads.length !== 1 ? 's' : ''}`);
      setPasteText('');
      setParsedPreview([]);
      setTimeout(() => router.refresh(), 800);
    }
    setLoading(false);
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
            const uploadTime = new Date().toISOString();
            let leads;

            if (hasHeaders) {
              // Use smart column mapper for files WITH headers
              leads = results.data
                .map((row: any, index: number) => {
                  const mapped = smartColumnMapper(row);
                  
                  // Debug logging for first 3 rows
                  if (index < 3) {
                    console.log(`Row ${index + 1} mapped:`, mapped);
                  }
                  
                  // Skip rows without email (required field)
                  // Allow name to be empty and we'll use email prefix
                  if (!mapped.email) {
                    return null;
                  }

                  return {
                    user_id: user.id,
                    name: mapped.name || mapped.email.split('@')[0],
                    email: mapped.email,
                    phone: mapped.phone,
                    company: mapped.company,
                    notes: mapped.notes,
                    list_id: selectedListId && selectedListId !== 'unlisted' ? selectedListId : null,
                    last_contact: uploadTime,
                  };
                })
                .filter((lead: any) => lead !== null);
            } else {
              // Use positional mapper for files WITHOUT headers
              leads = results.data
                .map((row: any, index: number) => {
                  const rowArray = Array.isArray(row) ? row : Object.values(row);
                  const mapped = positionalColumnMapper(rowArray);
                  
                  if (index < 3) {
                    console.log(`Row ${index + 1} raw:`, rowArray);
                    console.log(`Row ${index + 1} mapped:`, mapped);
                  }
                  
                  if (!mapped.email) {
                    return null;
                  }

                  return {
                    user_id: user.id,
                    name: mapped.name || mapped.email.split('@')[0],
                    email: mapped.email,
                    phone: mapped.phone,
                    company: mapped.company,
                    notes: mapped.notes,
                    list_id: selectedListId && selectedListId !== 'unlisted' ? selectedListId : null,
                    last_contact: uploadTime,
                  };
                })
                .filter((lead: any) => lead !== null);
            }

            if (leads.length === 0) {
              console.log('No leads found. Check console logs above for mapping details.');
              setMessage('❌ No valid leads found. Check browser console for details, or ensure your file has email addresses.');
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

  // ── Quick Paste parser ────────────────────────────────────────────────────
  const parseQuickText = (raw: string): ParsedLead[] => {
    if (!raw.trim()) return [];

    // Split into individual contact blocks by 2+ blank lines or obvious separators
    const blocks = raw
      .split(/\n{2,}|---+|\*\*\*+/)
      .map(b => b.trim())
      .filter(b => b.length > 2);

    return blocks.map(block => {
      const parsed = parseLeadPasteText(block);

      // Build notes from remainder — also grab secondary phone/email if present
      const notesParts: string[] = [];
      if (parsed.remainder) notesParts.push(parsed.remainder);

      // Find extra emails beyond the first
      const allEmails = block.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g) || [];
      const extraEmails = allEmails.filter(e => e !== parsed.email);
      if (extraEmails.length) notesParts.push(`Alt email: ${extraEmails.join(', ')}`);

      // Find extra phones beyond the first
      const allPhones = block.match(/(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/g) || [];
      const extraPhones = allPhones.filter(p => !parsed.phone.includes(p.replace(/\D/g, '').slice(-7)));
      if (extraPhones.length) notesParts.push(`Alt phone: ${extraPhones.join(', ')}`);

      return {
        name: parsed.name || '',
        email: parsed.email || '',
        phone: parsed.phone || null,
        company: parsed.company || null,
        notes: notesParts.join(' | ') || null,
      };
    }).filter(l => l.name || l.email || l.phone || l.company);
  };

  const handleQuickChange = (text: string) => {
    setQuickText(text);
    setQuickPreview(parseQuickText(text));
  };

  const handleQuickImport = async () => {
    if (quickPreview.length === 0) return;
    setLoading(true);
    setMessage('');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setMessage('Not authenticated'); setLoading(false); return; }

    const now = new Date().toISOString();
    const leads = quickPreview.map(l => ({
      user_id: user.id,
      name: l.name || '',
      email: l.email || '',
      phone: l.phone || null,
      company: l.company || null,
      notes: l.notes || null,
      list_id: selectedListId && selectedListId !== 'unlisted' ? selectedListId : null,
      last_contact: now,
    }));

    const { error } = await supabase.from('leads').insert(leads);
    if (error) {
      setMessage(`Error: ${error.message}`);
    } else {
      setMessage(`✓ Imported ${leads.length} lead${leads.length !== 1 ? 's' : ''}`);
      setQuickText('');
      setQuickPreview([]);
      setTimeout(() => router.refresh(), 800);
    }
    setLoading(false);
  };
  // ─────────────────────────────────────────────────────────────────────────

  // ── ZIP Deal Pack parser ──────────────────────────────────────────────────
  const extractTextFromPdf = async (arrayBuffer: ArrayBuffer): Promise<string> => {
    try {
      const pdfjsLib = (window as any).pdfjsLib;
      if (!pdfjsLib) return '';
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let text = '';
      for (let i = 1; i <= Math.min(pdf.numPages, 3); i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map((item: any) => item.str).join(' ') + '\n';
      }
      return text;
    } catch { return ''; }
  };

  const parseAppPdf = (text: string): { name: string; phone: string | null; email: string | null } => {
    const lines = text.split(/[\n\r]+/).map(l => l.trim()).filter(Boolean);
    let name = '';
    let phone: string | null = null;
    let email: string | null = null;

    // Email
    const emailMatch = text.match(/[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) email = emailMatch[0];

    // Phone: 10 digits, US format
    const phoneMatch = text.match(/\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}/);
    if (phoneMatch) phone = phoneMatch[0];

    // Name: look for "Owner", "Applicant", "Contact" label then grab next non-company line
    const nameTriggers = ['owner name', 'applicant name', 'contact name', 'principal name', 'signer name', 'guarantor'];
    for (let i = 0; i < lines.length; i++) {
      const lower = lines[i].toLowerCase();
      if (nameTriggers.some(t => lower.includes(t))) {
        // Next non-empty line is likely the name
        const candidate = lines[i + 1] || lines[i + 2] || '';
        if (candidate && candidate.length < 60 && !/\d{5}/.test(candidate)) {
          name = candidate;
          break;
        }
      }
    }

    return { name, phone, email };
  };

  const handleZipFile = async (zipFile: File) => {
    setZipParsing(true);
    setZipPreview([]);
    setMessage('');

    // Load PDF.js from CDN if not loaded
    if (!(window as any).pdfjsLib) {
      await new Promise<void>((resolve) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        script.onload = () => {
          (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          resolve();
        };
        document.head.appendChild(script);
      });
    }

    try {
      const zip = await JSZip.loadAsync(zipFile);

      // Group files by top-level folder (each folder = one business/lead)
      const folderMap: Record<string, JSZip.JSZipObject[]> = {};
      zip.forEach((relativePath, zipEntry) => {
        if (zipEntry.dir) return;
        // Path format: "root folder/Business Name/file.pdf"
        const parts = relativePath.split('/');
        // Skip the outer wrapper folder, use the second level as business name
        const businessName = parts.length >= 3 ? parts[1] : parts.length === 2 ? parts[0] : null;
        if (!businessName) return;
        if (!folderMap[businessName]) folderMap[businessName] = [];
        folderMap[businessName].push(zipEntry);
      });

      const businesses = Object.keys(folderMap);
      const leads: ParsedLead[] = [];

      for (let i = 0; i < businesses.length; i++) {
        const businessName = businesses[i];
        setZipProgress(`Parsing ${i + 1} of ${businesses.length}: ${businessName}`);

        const files = folderMap[businessName];
        // Look for an app/application PDF
        const appFile = files.find(f => {
          const fname = f.name.split('/').pop()?.toLowerCase() || '';
          return fname.includes('app') || fname.includes('application');
        });

        let parsedName = '';
        let parsedPhone: string | null = null;
        let parsedEmail: string | null = null;

        if (appFile) {
          try {
            const buf = await appFile.async('arraybuffer');
            const text = await extractTextFromPdf(buf);
            if (text) {
              const parsed = parseAppPdf(text);
              parsedName = parsed.name;
              parsedPhone = parsed.phone;
              parsedEmail = parsed.email;
            }
          } catch { /* skip if unreadable */ }
        }

        leads.push({
          name: parsedName || '',
          email: parsedEmail || '',
          phone: parsedPhone,
          company: businessName,
          notes: null,
        });
      }

      setZipPreview(leads);
      setZipProgress('');
    } catch (err: any) {
      setMessage(`Error reading ZIP: ${err.message}`);
    }
    setZipParsing(false);
  };

  const handleZipImport = async () => {
    if (zipPreview.length === 0) return;
    setLoading(true);
    setMessage('');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setMessage('Not authenticated'); setLoading(false); return; }

    const now = new Date().toISOString();
    const leads = zipPreview.map(l => ({
      user_id: user.id,
      name: l.name || '',
      email: l.email || '',
      phone: l.phone || null,
      company: l.company || null,
      notes: l.notes || null,
      list_id: selectedListId && selectedListId !== 'unlisted' ? selectedListId : null,
      last_contact: now,
    }));

    const { error } = await supabase.from('leads').insert(leads);
    if (error) {
      setMessage(`Error: ${error.message}`);
    } else {
      setMessage(`✓ Imported ${leads.length} lead${leads.length !== 1 ? 's' : ''}`);
      setZipPreview([]);
      setTimeout(() => router.refresh(), 800);
    }
    setLoading(false);
  };
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        <button
          type="button"
          onClick={() => { setMode('file'); setMessage(''); }}
          className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
            mode === 'file' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Upload File
        </button>
        <button
          type="button"
          onClick={() => { setMode('paste'); setMessage(''); }}
          className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
            mode === 'paste' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Paste from Excel
        </button>
        <button
          type="button"
          onClick={() => { setMode('zip'); setMessage(''); }}
          className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
            mode === 'zip' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Deal Pack ZIP
        </button>
        <button
          type="button"
          onClick={() => { setMode('quick'); setMessage(''); }}
          className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
            mode === 'quick' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Quick Paste
        </button>
      </div>

      {mode === 'file' && (
        <>
          <div>
            <label className="block text-sm font-bold text-[#1a1a1a] mb-3 tracking-tight">CSV or TXT File</label>
            <div className="flex items-center gap-4">
              <label className="px-5 py-2.5 bg-white border border-[#e5e5e5] rounded-md text-[#1a1a1a] text-sm font-medium hover:border-[#1a1a1a] cursor-pointer transition-colors">
                Choose File
                <input type="file" accept=".csv,.txt" onChange={handleFileChange} className="hidden" />
              </label>
              <span className="text-sm text-[#6b6b6b]">{file ? file.name : 'No file chosen'}</span>
            </div>
            <p className="mt-3 text-xs text-[#6b6b6b]"><strong className="text-[#1a1a1a]">Required:</strong> Name, Email (with or without headers)</p>
            <p className="mt-1 text-xs text-[#6b6b6b]"><strong className="text-[#1a1a1a]">Optional:</strong> Phone, Company, Notes</p>
            <p className="mt-1 text-xs text-[#999]">Auto-detects: Headers, column order, delimiters, and data patterns</p>
          </div>
          <button
            onClick={handleUpload}
            disabled={loading || !file}
            className="w-full px-6 py-3 bg-[#1a1a1a] text-white rounded-md font-medium hover:bg-[#2a2a2a] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Uploading…' : 'Upload Leads'}
          </button>
        </>
      )}

      {mode === 'paste' && (
        <>
          <div>
            <p className="text-xs text-gray-500 mb-2">
              Select cells in Excel → Copy (⌘C) → Paste below. Works with or without column headers.
            </p>
            <textarea
              value={pasteText}
              onChange={e => handlePasteChange(e.target.value)}
              onPaste={e => {
                // Let the paste happen then immediately parse
                setTimeout(() => {
                  const ta = e.target as HTMLTextAreaElement;
                  handlePasteChange(ta.value);
                }, 0);
              }}
              rows={6}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none placeholder-gray-300"
              placeholder={"Name\tEmail\tPhone\tCompany\nJohn Smith\tjohn@acme.com\t555-1234\tAcme LLC\n..."}
            />
          </div>

          {/* Live preview */}
          {parsedPreview.length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-700">
                  {parsedPreview.length} lead{parsedPreview.length !== 1 ? 's' : ''} detected
                </p>
                <p className="text-xs text-gray-400">Scroll to see all</p>
              </div>
              <div className="max-h-48 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      {['Name', 'Email', 'Phone', 'Company'].map(h => (
                        <th key={h} className="px-3 py-1.5 text-left font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {parsedPreview.map((lead, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-1.5 text-gray-900 font-medium truncate max-w-[100px]">{lead.name || '—'}</td>
                        <td className="px-3 py-1.5 text-gray-600 truncate max-w-[140px]">{lead.email || '—'}</td>
                        <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{lead.phone || '—'}</td>
                        <td className="px-3 py-1.5 text-gray-600 truncate max-w-[120px]">{lead.company || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <button
            onClick={handlePasteUpload}
            disabled={loading || parsedPreview.length === 0}
            className="w-full px-6 py-3 bg-[#1a1a1a] text-white rounded-md font-medium hover:bg-[#2a2a2a] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Importing…' : parsedPreview.length > 0 ? `Import ${parsedPreview.length} Lead${parsedPreview.length !== 1 ? 's' : ''}` : 'Paste data above'}
          </button>
        </>
      )}

      {mode === 'zip' && (
        <>
          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setZipDragging(true); }}
            onDragLeave={() => setZipDragging(false)}
            onDrop={e => {
              e.preventDefault();
              setZipDragging(false);
              const f = e.dataTransfer.files[0];
              if (f && f.name.endsWith('.zip')) handleZipFile(f);
              else setMessage('Please drop a .zip file');
            }}
            onClick={() => zipInputRef.current?.click()}
            className={`flex flex-col items-center justify-center gap-2 py-6 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
              zipDragging ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:border-gray-400'
            }`}
          >
            <span className="text-2xl">📦</span>
            <p className="text-sm font-medium text-gray-700">Drop your deal pack ZIP here</p>
            <p className="text-xs text-gray-400">or click to choose file</p>
            <input
              ref={zipInputRef}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) handleZipFile(f);
              }}
            />
          </div>

          {/* Progress */}
          {zipParsing && (
            <div className="text-xs text-gray-500 text-center animate-pulse">
              {zipProgress || 'Reading ZIP…'}
            </div>
          )}

          {/* Preview table */}
          {zipPreview.length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-700">
                  {zipPreview.length} business{zipPreview.length !== 1 ? 'es' : ''} found
                </p>
                <p className="text-xs text-gray-400">Company name from folder • other fields from app.pdf</p>
              </div>
              <div className="max-h-56 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      {['Company', 'Contact Name', 'Phone', 'Email'].map(h => (
                        <th key={h} className="px-3 py-1.5 text-left font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {zipPreview.map((lead, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-1.5 font-medium text-gray-900 truncate max-w-[160px]">{lead.company || '—'}</td>
                        <td className="px-3 py-1.5 text-gray-600 truncate max-w-[100px]">{lead.name || <span className="text-gray-300">not found</span>}</td>
                        <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{lead.phone || <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-1.5 text-gray-600 truncate max-w-[120px]">{lead.email || <span className="text-gray-300">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <button
            onClick={handleZipImport}
            disabled={loading || zipPreview.length === 0}
            className="w-full px-6 py-3 bg-[#1a1a1a] text-white rounded-md font-medium hover:bg-[#2a2a2a] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Importing…' : zipPreview.length > 0 ? `Import ${zipPreview.length} Lead${zipPreview.length !== 1 ? 's' : ''}` : 'Drop a ZIP above'}
          </button>
        </>
      )}

      {/* ── Quick Paste panel ── */}
      {mode === 'quick' && (
        <>
          <div>
            <p className="text-xs text-gray-500 mb-1 leading-relaxed">
              Paste anything — an email signature, vCard, broker notes, copied rows, or free text.<br />
              Name, company, email &amp; phone are extracted automatically. <strong>Everything else goes into Notes.</strong><br />
              Separate multiple contacts with a blank line.
            </p>
            <textarea
              value={quickText}
              onChange={e => handleQuickChange(e.target.value)}
              onPaste={e => {
                setTimeout(() => {
                  const ta = e.target as HTMLTextAreaElement;
                  handleQuickChange(ta.value);
                }, 0);
              }}
              rows={8}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none placeholder-gray-300"
              placeholder={
                "John Smith\nThe Big Beard LLC\njohn@example.com\n(513) 291-0726\n362-02-5204 (SSN)\n110 South Washington Blvd\n\nJane Doe\nAcme Corp\njane@acme.com\n..."
              }
            />
          </div>

          {/* Live preview */}
          {quickPreview.length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-700">
                  {quickPreview.length} contact{quickPreview.length !== 1 ? 's' : ''} detected
                </p>
                <p className="text-xs text-gray-400">Unmapped data → Notes</p>
              </div>
              <div className="max-h-56 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      {['Name', 'Company', 'Phone', 'Email', 'Notes'].map(h => (
                        <th key={h} className="px-2 py-1.5 text-left font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {quickPreview.map((lead, i) => (
                      <tr key={i} className={`hover:bg-gray-50 ${!lead.name && !lead.email ? 'opacity-40' : ''}`}>
                        <td className="px-2 py-1.5 font-medium text-gray-900 max-w-[90px] truncate">{lead.name || <span className="text-gray-300 italic">—</span>}</td>
                        <td className="px-2 py-1.5 text-gray-600 max-w-[100px] truncate">{lead.company || <span className="text-gray-300">—</span>}</td>
                        <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap">{lead.phone || <span className="text-gray-300">—</span>}</td>
                        <td className="px-2 py-1.5 text-gray-600 max-w-[120px] truncate">{lead.email || <span className="text-gray-300">—</span>}</td>
                        <td className="px-2 py-1.5 text-gray-400 max-w-[140px] truncate italic" title={lead.notes || ''}>{lead.notes || <span className="text-gray-200">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <button
            onClick={handleQuickImport}
            disabled={loading || quickPreview.length === 0}
            className="w-full px-6 py-3 bg-[#1a1a1a] text-white rounded-md font-medium hover:bg-[#2a2a2a] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Importing…' : quickPreview.length > 0
              ? `Import ${quickPreview.length} Lead${quickPreview.length !== 1 ? 's' : ''}`
              : 'Paste contacts above'}
          </button>
        </>
      )}

      {message && (
        <div className={`text-sm text-center ${message.startsWith('✓') ? 'text-green-700' : 'text-red-700'}`}>
          {message}
        </div>
      )}
    </div>
  );
}
