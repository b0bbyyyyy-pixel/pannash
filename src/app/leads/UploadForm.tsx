'use client';

import { useState, useRef, useCallback } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import Papa from 'papaparse';
import { useRouter } from 'next/navigation';
import JSZip from 'jszip';
import { parseLeadPasteText } from '@/lib/parse-lead-paste';
import { toE164 } from '@/lib/dialer/e164';

interface UploadFormProps {
  selectedListId?: string;
  onSuccess?: () => void;
}

interface ParsedLead {
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  notes: string | null;
}

export default function UploadForm({ selectedListId, onSuccess }: UploadFormProps) {
  const [mode, setMode] = useState<'file' | 'paste' | 'zip' | 'quick' | 'sheets'>('file');
  const [file, setFile] = useState<File | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [parsedPreview, setParsedPreview] = useState<ParsedLead[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  // Quick Paste state
  const [quickText, setQuickText] = useState('');
  const [quickPreview, setQuickPreview] = useState<ParsedLead[]>([]);
  // Google Sheets state
  const [sheetsUrl, setSheetsUrl] = useState('');
  const [sheetsAllRows, setSheetsAllRows] = useState<ParsedLead[]>([]); // full parsed data
  const [sheetsPreview, setSheetsPreview] = useState<ParsedLead[]>([]); // filtered slice
  const [sheetsLoading, setSheetsLoading] = useState(false);
  const [sheetsAddToDialer, setSheetsAddToDialer] = useState(false);
  const [rawSheetsCsv, setRawSheetsCsv] = useState<string>(''); // original CSV for AI re-parse
  const [aiParsing, setAiParsing] = useState(false);
  const [aiParseError, setAiParseError] = useState<string>('');
  const [rangeFrom, setRangeFrom] = useState<string>('1');
  const [rangeTo, setRangeTo] = useState<string>('');
  // Google OAuth state
  const [googleStatus, setGoogleStatus] = useState<{ connected: boolean; email?: string } | null>(null);
  const [googleStatusLoading, setGoogleStatusLoading] = useState(false);
  const [driveSheets, setDriveSheets] = useState<{ id: string; name: string; modifiedTime: string }[]>([]);
  const [driveSheetsLoading, setDriveSheetsLoading] = useState(false);
  const [driveSheetsError, setDriveSheetsError] = useState<string>('');
  const [selectedDriveSheet, setSelectedDriveSheet] = useState<string>(''); // sheetId
  const [driveTabs, setDriveTabs] = useState<{ gid: string; title: string; index: number }[]>([]);
  const [driveSheetsTabsLoading, setDriveSheetsTabsLoading] = useState(false);
  const [selectedTab, setSelectedTab] = useState<string>('0'); // gid

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
  /**
   * Detect "Business Name/Category PersonFirst PersonLast" combined strings
   * (common in Tracers exports) and extract just the person name.
   */
  const extractPersonName = (raw: string | null): string | null => {
    if (!raw) return null;
    const words = raw.trim().split(/\s+/);
    if (words.length < 3) return raw;
    const last       = words[words.length - 1];
    const secondLast = words[words.length - 2];
    const isNameWord = (w: string) =>
      /^[A-Z][a-zA-Z'\-]{1,}$/.test(w) &&
      !/^(LLC|Inc|Corp|Ltd|PLC|Co|LLP|LP|PC)\.?$/i.test(w);
    if (!isNameWord(last) || !isNameWord(secondLast)) return raw;
    const prefix = words.slice(0, -2).join(' ');
    const hasBusinessIndicator =
      /L\.?L\.?C\.?|Inc\.?|Corp\.?|Ltd\.?|PLC|L\.?P\.?/i.test(prefix) ||
      prefix.includes('&') ||
      /\b[A-Z]{2,5}\b/.test(prefix) ||
      prefix === prefix.toUpperCase() ||
      prefix.split(/\s+/).length >= 3;
    return hasBusinessIndicator ? `${secondLast} ${last}` : raw;
  };

  const smartColumnMapper = (row: any): any => {
    const rowKeys = Object.keys(row);

    // Get a cell value, treating "-" and blank as empty
    const cellVal = (key: string): string | null => {
      const v = String(row[key] || '').trim();
      return v && v !== '-' && v !== '--' ? v : null;
    };

    const findColumn = (possibleNames: string[]): string | null => {
      for (const key of rowKeys) {
        const lowerKey = key.toLowerCase().trim();
        if (possibleNames.some(n => lowerKey === n.toLowerCase() || lowerKey.includes(n.toLowerCase()))) {
          return cellVal(key);
        }
      }
      return null;
    };

    // Combine "First name" + "Last Name" into a full name when available
    const findExact = (possibleNames: string[]): string | null => {
      for (const key of rowKeys) {
        const lowerKey = key.toLowerCase().trim();
        if (possibleNames.some(n => lowerKey === n.toLowerCase())) {
          return cellVal(key);
        }
      }
      return null;
    };

    // Substring header matcher with value validation — catches variants like
    // "Owner First Name", "Contact First", "FIRST_NAME", etc. The value must
    // look like an actual name (letters only) to count.
    const findNameByContains = (subs: string[]): string | null => {
      for (const key of rowKeys) {
        const lowerKey = key.toLowerCase().trim();
        if (subs.some(n => lowerKey.includes(n))) {
          const v = cellVal(key);
          if (v && /^[a-zA-Z\s\-\.']{1,40}$/.test(v)) return v;
        }
      }
      return null;
    };

    const firstName = findExact(['first name', 'firstname', 'first_name', 'fname', 'given name', 'first'])
      || findNameByContains(['first name', 'firstname', 'first_name', 'fname']);
    const lastName  = findExact(['last name', 'lastname', 'last_name', 'lname', 'surname', 'family name', 'last'])
      || findNameByContains(['last name', 'lastname', 'last_name', 'lname', 'surname']);
    let name: string | null = null;
    if (firstName && lastName) {
      name = `${firstName} ${lastName}`.trim();
    } else if (firstName || lastName) {
      name = (firstName || lastName);
    } else {
      // Fall back to a single combined name column.
      // Note: 'tracers name' intentionally excluded — it contains "Business Person"
      // combined strings that need post-processing below.
      name = findColumn(['full name', 'fullname', 'contact name', 'lead name', 'person name', 'owner name'])
        // Generic single-word headers like "Name", "Owner", "Contact" (exact match
        // only, so "Business Name" still maps to company, not here)
        || findExact(['name', 'owner', 'contact', 'lead'])
        // Tracers Name last — only after all others fail, and we'll clean it below
        || findColumn(['tracers name']);
    }

    // Last resort: many exports put First / Last right before the Email column.
    // Grab up to two short alphabetic values immediately preceding the email.
    if (!name) {
      const emailKeyIdx = rowKeys.findIndex(k => {
        const v = cellVal(k);
        return !!v && isEmail(v);
      });
      if (emailKeyIdx > 0) {
        const parts: string[] = [];
        for (let i = Math.max(0, emailKeyIdx - 2); i < emailKeyIdx; i++) {
          const v = cellVal(rowKeys[i]);
          if (v && /^[a-zA-Z\-\.']{2,20}$/.test(v)) parts.push(v);
        }
        if (parts.length > 0) name = parts.join(' ');
      }
    }

    // Phone — Step 1: look for columns whose NAME suggests a phone field (broad list)
    const phoneNameKeywords = [
      'phone', 'telephone', 'tel', 'mobile', 'cell', 'contact number',
      'direct', 'fax', 'ph ', ' ph', 'phone #', 'phone number',
      'work phone', 'home phone', 'bus phone', 'business phone',
      'contact phone', 'primary phone', 'number', 'contact #',
    ];
    const phoneKeys = rowKeys.filter(key => {
      const k = key.toLowerCase().trim();
      return phoneNameKeywords.some(p => k === p || k.includes(p));
    });
    const namedPhoneValues = phoneKeys
      .map(k => cellVal(k))
      .filter((v): v is string => !!v && isPhone(v));

    // Phone — Step 2: if still no phone found by column name, scan EVERY column's value
    // This handles sheets where the phone is in a column named "Contact", "Lead #", etc.
    let allPhoneValues = namedPhoneValues;
    if (namedPhoneValues.length === 0) {
      const valuePhones = rowKeys
        .filter(k => !phoneKeys.includes(k)) // don't double-count
        .map(k => cellVal(k))
        .filter((v): v is string => !!v && isPhone(v));
      allPhoneValues = valuePhones;
    }

    const primaryPhone = allPhoneValues[0] || null;
    const extraPhoneNote = allPhoneValues.slice(1).join(' | ');

    // Email: ignore obvious placeholder emails
    const rawEmail = findColumn(['email', 'e-mail', 'email address', 'emailaddress', 'contact email', 'mail']);
    const email = rawEmail && !rawEmail.toLowerCase().includes('noemail') ? rawEmail : null;

    // Words that are phone-type labels, not company names — reject these
    const PHONE_TYPE_LABELS = new Set([
      'mobile', 'cell', 'home', 'work', 'office', 'fax', 'direct',
      'main', 'other', 'business', 'personal', 'landline', 'voip',
    ]);
    const isValidCompany = (v: string | null): string | null => {
      if (!v) return null;
      const trimmed = v.trim();
      if (trimmed.length < 2) return null;
      if (PHONE_TYPE_LABELS.has(trimmed.toLowerCase())) return null;
      if (isPhone(trimmed)) return null; // reject if it's actually a phone number
      return trimmed;
    };

    // Company: prefer "Business Name" then "Company Name" then generic
    const company = isValidCompany(
      findExact(['business name', 'business_name', 'dba', 'dba name']) ||
      findExact(['company name', 'company_name', 'companyname']) ||
      findColumn(['organization', 'org', 'employer', 'account'])
    );

    // Pass the name through the combined-string extractor.
    // This handles "Business Category PersonFirst PersonLast" patterns from
    // Tracers exports and similar data sources.
    if (name) {
      name = extractPersonName(name);
    }

    // If the combined fallback name still begins with the company name, strip it.
    // e.g. "Aircules Mechanical Abel Ybarra" → "Abel Ybarra" when company="Aircules Mechanical"
    if (name && company) {
      const escaped = company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const stripped = name.replace(new RegExp(`^${escaped}\\s*`, 'i'), '').trim();
      if (stripped && stripped !== name && stripped.split(' ').length <= 4 && !isLikelyCompany(stripped)) {
        name = stripped;
      }
    }

    const baseNotes = findColumn(['notes', 'note', 'comments', 'comment', 'description', 'details', 'memo', 'remarks']);

    // Columns to skip entirely (already mapped or not useful)
    const SKIP_LABELS = new Set([
      'name','full name','fullname','first name','firstname','first_name','fname','given name',
      'last name','lastname','last_name','lname','surname','family name',
      'email','e-mail','email address','emailaddress','mail',
      'business name','business_name','company name','company_name','companyname',
      'organization','org','employer','account','dba','dba name',
      'notes','note','comments','comment','description','details','memo','remarks',
      // phone-type labels that leak as company / notes
      'mobile','cell','home','work','office','direct','landline','voip','personal',
    ]);
    const isPhoneKey = (k: string) =>
      ['phone','telephone','tel','mobile','cell','contact number','direct','fax','number'].some(p => k.includes(p));

    // Collect all remaining non-empty columns as extra notes
    // If the value-scan fallback found the phone, exclude those values from notes too
    const usedPhoneValues = new Set(allPhoneValues);
    const extraCols: string[] = [];
    for (const key of rowKeys) {
      const lowerKey = key.toLowerCase().trim();
      if (SKIP_LABELS.has(lowerKey)) continue;
      if (isPhoneKey(lowerKey)) continue; // phones already handled
      const v = cellVal(key);
      if (!v) continue;
      // If this value was picked up by the phone value-scan fallback, skip it from notes
      if (usedPhoneValues.has(v)) continue;
      extraCols.push(`${key}: ${v}`);
    }

    const combinedNotes = [extraPhoneNote, baseNotes, ...extraCols].filter(Boolean).join(' | ') || null;

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
      name: l.name || l.company || (l.email ? l.email.split('@')[0] : 'Unknown'),
      email: l.email || '',
      phone: l.phone || null,
      phone_e164: toE164(l.phone),
      company: l.company || null,
      notes: l.notes || null,
      list_id: selectedListId && selectedListId !== 'unlisted' ? selectedListId : null,
      month_key: null,      // keep campaign uploads OUT of the pipeline
      in_pipeline: false,
    }));

    const { error } = await supabase.from('leads').insert(leads);
    if (error) {
      setMessage(`Error: ${error.message}`);
    } else {
      setMessage(`✓ Imported ${leads.length} lead${leads.length !== 1 ? 's' : ''}`);
      setPasteText('');
      setParsedPreview([]);
      setTimeout(() => { router.refresh(); onSuccess?.(); }, 800);
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
                    name: mapped.name || mapped.company || mapped.email.split('@')[0],
                    email: mapped.email,
                    phone: mapped.phone,
                    phone_e164: toE164(mapped.phone),
                    company: mapped.company,
                    notes: mapped.notes,
                    list_id: selectedListId && selectedListId !== 'unlisted' ? selectedListId : null,
                    month_key: null,      // keep campaign uploads OUT of the pipeline
                    in_pipeline: false,
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
                    name: mapped.name || mapped.company || mapped.email.split('@')[0],
                    email: mapped.email,
                    phone: mapped.phone,
                    phone_e164: toE164(mapped.phone),
                    company: mapped.company,
                    notes: mapped.notes,
                    list_id: selectedListId && selectedListId !== 'unlisted' ? selectedListId : null,
                    month_key: null,      // keep campaign uploads OUT of the pipeline
                    in_pipeline: false,
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

            const { error } = await supabase.from('leads').insert(leads.filter(Boolean) as NonNullable<typeof leads[0]>[]);

            if (error) {
              setMessage(`Error: ${error.message}`);
            } else {
              setMessage(`✓ Successfully uploaded ${leads.length} leads`);
              setFile(null);
              setTimeout(() => {
                router.refresh();
                onSuccess?.();
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
      name: l.name || l.company || (l.email ? l.email.split('@')[0] : ''),
      email: l.email || '',
      phone: l.phone || null,
      phone_e164: toE164(l.phone),
      company: l.company || null,
      notes: l.notes || null,
      list_id: selectedListId && selectedListId !== 'unlisted' ? selectedListId : null,
      month_key: null,      // keep campaign uploads OUT of the pipeline
      in_pipeline: false,
    }));

    const { error } = await supabase.from('leads').insert(leads);
    if (error) {
      setMessage(`Error: ${error.message}`);
    } else {
      setMessage(`✓ Imported ${leads.length} lead${leads.length !== 1 ? 's' : ''}`);
      setQuickText('');
      setQuickPreview([]);
      setTimeout(() => { router.refresh(); onSuccess?.(); }, 800);
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
      const lines: string[] = [];
      for (let i = 1; i <= Math.min(pdf.numPages, 3); i++) {
        const page = await pdf.getPage(i);

        // Each text item gets its own line so label/value pairs stay separable
        const content = await page.getTextContent();
        for (const item of content.items as any[]) {
          const s = item.str?.trim();
          if (s) lines.push(s);
        }

        // AcroForm field values (PDF form inputs)
        try {
          const annotations = await page.getAnnotations();
          for (const ann of annotations) {
            if (ann.fieldType && ann.fieldValue != null && String(ann.fieldValue).trim()) {
              const label = (ann.fieldName || ann.alternativeText || '').replace(/[_\-]/g, ' ');
              lines.push(`${label}: ${ann.fieldValue}`);
            }
          }
        } catch { /* no annotations */ }
      }
      return lines.join('\n');
    } catch { return ''; }
  };

  const parseAppPdf = (text: string): { name: string; phone: string | null; email: string | null } => {
    const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
    let name = '';
    let phone: string | null = null;
    let email: string | null = null;

    // Email - anywhere in text
    const emailMatch = text.match(/[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) email = emailMatch[0];

    // Phone - 10-digit US format
    const phoneMatch = text.match(/\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}/);
    if (phoneMatch) phone = phoneMatch[0];

    // Common form-field label words that should never be treated as person names
    const LABEL_WORDS = new Set([
      'first','last','full','legal','given','middle','owner','owners','applicant','principal',
      'contact','guarantor','signer','authorized','primary','business','company','entity',
      'information','info','detail','section','name','phone','email','address','city','state',
      'zip','date','birth','sign','signature','yes','no','na','none','fico','score','credit',
      'ssn','ein','tax','id','type','number','amount','term','rate','form','field','print',
      'please','enter','input','select','check','note','notes','add','new','other','edit',
      // Business/industry types
      'real','estate','realty','property','properties','trucking','transport','transportation',
      'landscaping','construction','services','service','piano','music','restaurant','retail',
      'wholesale','medical','dental','legal','consulting','management','financial','insurance',
      // Common form section labels
      'year','acquired','started','formed','incorporated','established','founded',
      'requested','approved','amount','funding','advance','loan','payment','balance',
      'monthly','annual','weekly','daily','total','net','gross','revenue','income',
      'position','existing','current','previous','new','additional',
      // Financial / form section terms
      'purchase','price','cost','value','sale','sales','deposit','payment','payments',
      'collateral','equity','asset','assets','liability','liabilities','debt','debts',
      'profit','loss','cash','flow','market','product','industry','sector','category',
      // Property / loan form labels
      'title','holder','lender','balance','loan','advance','acquired','property',
      'current','lien','judgment','bankruptcy','status','incorporated','website',
      'qualifying','questions','certify','authorize','undersigned','guarantor',
      'partner','proprietor','corporation','ownership','percentage',
    ]);

    const toTitleCase = (s: string) => s.replace(/\b\w/g, c => c.toUpperCase());

    // Strict check for Strategy 4 (no label context — must look like a real name)
    const isPersonName = (s: string) => {
      if (!s || s.length < 5 || s.length > 60) return false;
      if (/\b(LLC|Inc|Corp|Ltd|Co\.|DBA|Street|Ave|Blvd|Rd|Dr|Trucking|Landscaping|Construction|Services|Piano|Realty|Real\s+Estate|Real\s+State|Working\s+Capital)\b/i.test(s)) return false;
      if (/\d/.test(s)) return false;
      if (!/^[A-Za-z\s'\-\.]+$/.test(s)) return false;
      const words = s.trim().split(/\s+/);
      if (words.length < 2 || words.length > 4) return false;
      // Require title-case — blocks ALL-CAPS labels and purely lowercase strings
      if (!words.every(w => /^[A-Z][a-z]/.test(w))) return false;
      if (words.some(w => LABEL_WORDS.has(w.toLowerCase()))) return false;
      return true;
    };

    // Looser check for label-triggered strategies (allows lowercase names like "prakash gurung")
    const isLikelyName = (s: string) => {
      if (!s || s.length < 4 || s.length > 60) return false;
      if (/\b(LLC|Inc|Corp|Ltd|Co\.|DBA|Street|Ave|Blvd|Rd|Dr|Trucking|Landscaping|Construction|Services|Piano|Realty|Real\s+Estate|Working\s+Capital)\b/i.test(s)) return false;
      if (/\d/.test(s)) return false;
      if (!/^[A-Za-z\s'\-\.]+$/.test(s)) return false;
      const words = s.trim().split(/\s+/);
      if (words.length < 2 || words.length > 4) return false;
      // At least the first character of the whole string must be a letter (not a digit/special)
      if (!/^[A-Za-z]/.test(s)) return false;
      if (words.some(w => LABEL_WORDS.has(w.toLowerCase()))) return false;
      return true;
    };

    // Strategy 1: Label + value on SAME line, e.g. "Full Name: Melissa Russell"
    const sameLine = text.match(
      /(?:full\s+name|owner\s*(?:name|\d)?|principal\s*(?:name)?|applicant\s*(?:name)?|contact\s*(?:name)?|guarantor\s*(?:name)?|authorized\s+signer|primary\s+owner|legal\s+name|name\s+of\s+owner|signer)\s*:?\s+([A-Za-z][A-Za-z\s'\-\.]{3,})/i
    );
    if (sameLine) {
      const candidate = sameLine[1].trim();
      if (isLikelyName(candidate)) name = toTitleCase(candidate);
    }

    // Strategy 2: Label line → value on NEXT line (handles "Name\nprakash gurung")
    if (!name) {
      const nameLabelRe = /^(name|full\s+name|owner\s*(?:name|\d+)?|principal\s*(?:name)?|applicant\s*(?:name)?|contact\s*(?:name)?|guarantor\s*(?:name)?|authorized\s+signer|primary\s+owner|legal\s+name|name\s+of\s+owner|owner\s+1|owner\s+information)\s*:?\s*$/i;
      for (let i = 0; i < lines.length - 1; i++) {
        if (nameLabelRe.test(lines[i])) {
          for (let j = i + 1; j <= Math.min(i + 3, lines.length - 1); j++) {
            const candidate = lines[j].trim();
            if (isLikelyName(candidate)) { name = toTitleCase(candidate); break; }
          }
          if (name) break;
        }
      }
    }

    // Strategy 3: "First Name" / "Last Name" labels, with values possibly several lines later
    // Handles M&J Robinson pattern: [First Name, Last Name, Ownership, SSN] then [Jerry, Robinson, 100%, ...]
    if (!name) {
      const firstRe = /^(?:first\s+name|owner\s+first|legal\s+first\s+name|first)\s*:?\s*$/i;
      const lastRe  = /^(?:last\s+name|owner\s+last|legal\s+last\s+name|surname|last)\s*:?\s*$/i;
      let firstIdx = -1, lastIdx = -1;
      for (let i = 0; i < lines.length; i++) {
        if (firstIdx < 0 && firstRe.test(lines[i])) firstIdx = i;
        if (lastIdx  < 0 && lastRe.test(lines[i]))  lastIdx  = i;
      }
      if (firstIdx >= 0 && lastIdx >= 0) {
        const LOOK = 10;
        let first = '', last = '';
        // Scan ahead from firstIdx for a single capitalized/lowercase name word
        for (let j = firstIdx + 1; j <= Math.min(firstIdx + LOOK, lines.length - 1); j++) {
          const w = lines[j].trim();
          if (/^[A-Za-z]{2,}$/.test(w) && !LABEL_WORDS.has(w.toLowerCase()) && !/^\d+$/.test(w)) {
            first = w; break;
          }
        }
        // Scan ahead from lastIdx for a single name word (different from first)
        for (let j = lastIdx + 1; j <= Math.min(lastIdx + LOOK, lines.length - 1); j++) {
          const w = lines[j].trim();
          if (/^[A-Za-z]{2,}$/.test(w) && !LABEL_WORDS.has(w.toLowerCase()) && w !== first && !/^\d+$/.test(w)) {
            last = w; break;
          }
        }
        if (first && last) name = toTitleCase(`${first} ${last}`);
      }
    }

    // Strategy 4: Standalone title-case "Firstname Lastname" line (no label context)
    if (!name) {
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i].trim();
        if (/^[A-Z][a-z]{1,}(\s[A-Z]\.?)?\s[A-Z][a-z]{2,}$/.test(l) && isPersonName(l)) {
          name = l;
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
            console.log(`[ZIP] ${businessName} — extracted text:\n`, text.slice(0, 1500));
            if (text) {
              const parsed = parseAppPdf(text);
              console.log(`[ZIP] ${businessName} — parsed:`, parsed);
              parsedName = parsed.name;
              parsedPhone = parsed.phone;
              parsedEmail = parsed.email;
            }
          } catch (e) { console.error(`[ZIP] ${businessName} extract error:`, e); }
        }

        // Strip date suffix from folder name (e.g. "GPS LANDSCAPING LLC 08_20_2026" → "GPS LANDSCAPING LLC")
        const companyName = businessName.replace(/\s+\d{2}_\d{2}_\d{4}$/, '').trim();

        leads.push({
          name: parsedName || '',
          email: parsedEmail || '',
          phone: parsedPhone,
          company: companyName,
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
      name: l.name || l.company || (l.email ? l.email.split('@')[0] : ''),
      email: l.email || '',
      phone: l.phone || null,
      phone_e164: toE164(l.phone),
      company: l.company || null,
      notes: l.notes || null,
      list_id: selectedListId && selectedListId !== 'unlisted' ? selectedListId : null,
      month_key: null,      // keep campaign uploads OUT of the pipeline
      in_pipeline: false,
    }));

    const { error } = await supabase.from('leads').insert(leads);
    if (error) {
      setMessage(`Error: ${error.message}`);
    } else {
      setMessage(`✓ Imported ${leads.length} lead${leads.length !== 1 ? 's' : ''}`);
      setZipPreview([]);
      setTimeout(() => { router.refresh(); onSuccess?.(); }, 800);
    }
    setLoading(false);
  };
  // ─────────────────────────────────────────────────────────────────────────

  // ── Google OAuth helpers ─────────────────────────────────────────────────
  const checkGoogleStatus = useCallback(async () => {
    setGoogleStatusLoading(true);
    try {
      const res = await fetch('/api/auth/google/status');
      const json = await res.json();
      setGoogleStatus(json);
    } catch { setGoogleStatus({ connected: false }); }
    setGoogleStatusLoading(false);
  }, []);

  // Fetch spreadsheet list with proper error surfacing
  const fetchDriveSheets = useCallback(async () => {
    setDriveSheetsLoading(true);
    setDriveSheetsError('');
    setDriveSheets([]);
    setDriveTabs([]);
    setSelectedDriveSheet('');
    setSelectedTab('0');
    try {
      const res = await fetch('/api/auth/google/sheets');
      const json = await res.json();
      if (!res.ok) {
        // 401 usually means token expired / revoked
        if (res.status === 401) {
          setGoogleStatus({ connected: false });
          setDriveSheetsError('Google session expired. Please reconnect below.');
        } else {
          setDriveSheetsError(json.error || 'Failed to load spreadsheets from Drive.');
        }
      } else {
        const sheets = json.sheets ?? [];
        setDriveSheets(sheets);
        if (sheets.length === 0) {
          setDriveSheetsError('No spreadsheets found in your Drive. Make sure you have at least one Google Sheet.');
        }
      }
    } catch {
      setDriveSheetsError('Network error — could not reach Drive. Check your connection and try again.');
    } finally {
      setDriveSheetsLoading(false);
    }
  }, []);

  // Check status when switching to sheets tab, then auto-load the spreadsheet list
  const enterSheetsMode = useCallback(async () => {
    setMode('sheets');
    setMessage('');
    setDriveSheetsError('');
    setGoogleStatusLoading(true);
    try {
      const res = await fetch('/api/auth/google/status');
      const json = await res.json();
      setGoogleStatus(json);
      if (json.connected) {
        if (json.expired) {
          // Token is expired — show reconnect prompt instead of a silent empty list
          setDriveSheetsError('Google session expired. Please reconnect.');
        } else {
          await fetchDriveSheets();
        }
      }
    } catch {
      setGoogleStatus({ connected: false });
    } finally {
      setGoogleStatusLoading(false);
    }
  }, [fetchDriveSheets]);

  const loadDriveSheets = fetchDriveSheets;

  const loadTabs = useCallback(async (sheetId: string) => {
    setDriveTabs([]);
    setSelectedTab('0');
    setSheetsPreview([]);
    if (!sheetId) return;
    setDriveSheetsTabsLoading(true);
    try {
      const res = await fetch(`/api/auth/google/sheets?sheetId=${encodeURIComponent(sheetId)}`);
      const json = await res.json();
      if (res.ok && json.tabs?.length > 0) {
        setDriveTabs(json.tabs);
        setSelectedTab(json.tabs[0].gid); // default to first tab
      }
    } catch { /* silent */ }
    setDriveSheetsTabsLoading(false);
  }, []);

  const handleGoogleDisconnect = async () => {
    await fetch('/api/auth/google/disconnect', { method: 'POST' });
    setGoogleStatus({ connected: false });
    setDriveSheets([]);
    setSelectedDriveSheet('');
    setDriveTabs([]);
    setSheetsPreview([]);
    setSheetsAllRows([]);
  };
  // ─────────────────────────────────────────────────────────────────────────

  // ── Google Sheets range helper ───────────────────────────────────────────
  const applyRange = useCallback((all: ParsedLead[], from: string, to: string) => {
    const f = Math.max(1, parseInt(from) || 1);
    const t = to.trim() ? Math.min(all.length, parseInt(to)) : all.length;
    return all.slice(f - 1, t);
  }, []);

  const handleRangeChange = (from: string, to: string) => {
    setRangeFrom(from);
    setRangeTo(to);
    setSheetsPreview(applyRange(sheetsAllRows, from, to));
  };
  // ─────────────────────────────────────────────────────────────────────────

  // ── Parse-quality detector ──────────────────────────────────────────────
  // Returns true when >20% of parsed leads have an email as name or no name at all
  const parseQualityPoor = (rows: ParsedLead[]): boolean => {
    if (rows.length === 0) return false;
    const bad = rows.filter(r =>
      !r.name ||
      r.name === '—' ||
      r.name.includes('@') ||
      /^\d/.test(r.name)
    ).length;
    return bad / rows.length > 0.2;
  };

  // ── AI-powered re-parse ─────────────────────────────────────────────────
  const handleAiParse = async () => {
    if (!rawSheetsCsv) return;
    setAiParsing(true);
    setAiParseError('');
    try {
      const res = await fetch('/api/import/ai-parse-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: rawSheetsCsv }),
      });
      const json = await res.json();
      if (!res.ok) {
        setAiParseError(json.error || 'AI parse failed. Check your XAI_API_KEY.');
        return;
      }
      // Map AI response to ParsedLead shape
      const aiLeads: ParsedLead[] = (json.leads as Array<{ name: string | null; email: string | null; phone: string | null; company: string | null }>)
        .filter(l => l.name || l.email || l.phone)
        .map(l => ({
          name:    l.name    || '',
          email:   l.email   || '',
          phone:   l.phone   || null,
          company: l.company || null,
          notes:   null,
        }));
      setSheetsAllRows(aiLeads);
      const defaultTo = String(aiLeads.length);
      setRangeFrom('1');
      setRangeTo(defaultTo);
      setSheetsPreview(applyRange(aiLeads, '1', defaultTo));
    } catch (e: any) {
      setAiParseError(e.message || 'Unexpected error during AI parse.');
    } finally {
      setAiParsing(false);
    }
  };

  // ── Google Sheets import ────────────────────────────────────────────────
  const handleSheetsFetch = async (overrideSheetId?: string) => {
    const sheetId = overrideSheetId || selectedDriveSheet;
    const hasUrl  = sheetsUrl.trim().length > 0;
    if (!sheetId && !hasUrl) return;
    setSheetsLoading(true);
    setMessage('');
    setSheetsPreview([]);
    setSheetsAllRows([]);
    setRawSheetsCsv('');
    setAiParseError('');
    const gidParam = sheetId && selectedTab ? `&gid=${encodeURIComponent(selectedTab)}` : '';
    const apiUrl = sheetId
      ? `/api/import/google-sheets?sheetId=${encodeURIComponent(sheetId)}${gidParam}`
      : `/api/import/google-sheets?url=${encodeURIComponent(sheetsUrl.trim())}`;
    try {
      const res = await fetch(apiUrl);
      const json = await res.json();
      if (!res.ok) { setMessage(json.error || 'Failed to fetch sheet'); setSheetsLoading(false); return; }

      setRawSheetsCsv(json.csv); // store for optional AI re-parse
      const result = Papa.parse<string[]>(json.csv, { skipEmptyLines: true, header: false });
      if (!result.data || result.data.length === 0) { setMessage('Sheet appears empty'); setSheetsLoading(false); return; }

      const firstRow = result.data[0] as string[];
      const headerKeywords = ['name', 'email', 'phone', 'company', 'business', 'contact', 'first', 'last', 'mobile', 'cell'];
      // A cell only counts as a header label if it has no digits and no @ —
      // otherwise data like "2292200603 mobile" or emails would be mistaken for headers
      const looksLikeHeaderCell = (v: unknown) => {
        const s = String(v).toLowerCase().trim();
        if (!s || s.includes('@') || /\d/.test(s)) return false;
        return headerKeywords.some(k => s.includes(k));
      };
      const hasHeaders = firstRow.some(looksLikeHeaderCell);

      let leads: ParsedLead[];
      if (hasHeaders) {
        const headers = firstRow.map(h => String(h).trim());
        leads = (result.data.slice(1) as string[][])
          .map(row => {
            const obj: Record<string, string> = {};
            row.forEach((val, i) => { obj[headers[i] || `col${i}`] = String(val || '').trim(); });
            return smartColumnMapper(obj) as ParsedLead;
          })
          .filter(l => l.name || l.phone || l.email);
      } else {
        leads = (result.data as string[][])
          .map(row => positionalColumnMapper(row.map(v => String(v || '').trim())) as ParsedLead)
          .filter(l => l.name || l.phone || l.email);
      }

      if (leads.length === 0) {
        setMessage('No leads detected — check column headers in your sheet');
      } else {
        setSheetsAllRows(leads);
        // Reset range to show all
        const defaultFrom = '1';
        const defaultTo = String(leads.length);
        setRangeFrom(defaultFrom);
        setRangeTo(defaultTo);
        setSheetsPreview(applyRange(leads, defaultFrom, defaultTo));
      }
    } catch (e: any) {
      setMessage(`Error: ${e.message}`);
    }
    setSheetsLoading(false);
  };

  const handleSheetsImport = async () => {
    if (sheetsPreview.length === 0) return;
    setLoading(true);
    setMessage('');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setMessage('Not authenticated'); setLoading(false); return; }

    const rows = sheetsPreview.map(l => ({
      user_id: user.id,
      name: l.name || l.company || (l.email ? l.email.split('@')[0] : ''),
      email: l.email || '',
      phone: l.phone || null,
      phone_e164: toE164(l.phone),
      company: l.company || null,
      notes: l.notes || null,
      list_id: selectedListId && selectedListId !== 'unlisted' ? selectedListId : null,
      month_key: null,      // keep campaign uploads OUT of the pipeline
      in_pipeline: false,
      // Add to dialer queue if toggled
      ...(sheetsAddToDialer ? { dialer_status: 'queued' } : {}),
    }));

    const { error } = await supabase.from('leads').insert(rows);
    if (error) {
      setMessage(`Error: ${error.message}`);
    } else {
      setMessage(`✓ Imported ${rows.length} lead${rows.length !== 1 ? 's' : ''}${sheetsAddToDialer ? ' · added to Dialer queue' : ''}`);
      setSheetsUrl('');
      setSheetsPreview([]);
      setTimeout(() => { router.refresh(); onSuccess?.(); }, 800);
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
        <button
          type="button"
          onClick={enterSheetsMode}
          className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
            mode === 'sheets' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          🔗 Sheets
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

      {/* ── Google Sheets panel ── */}
      {mode === 'sheets' && (
        <>
          {/* Google account connection banner */}
          {googleStatusLoading ? (
            <div className="text-xs text-gray-400 text-center py-2 animate-pulse">Checking Google connection…</div>
          ) : googleStatus?.connected ? (
            <div className={`flex items-center justify-between rounded-lg px-3 py-2 border ${(googleStatus as {connected: boolean; expired?: boolean}).expired ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
              <div className="flex items-center gap-2">
                {(googleStatus as {connected: boolean; expired?: boolean}).expired ? (
                  <>
                    <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <span className="text-xs text-amber-800 font-medium">Session expired for <strong>{googleStatus.email}</strong></span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 text-green-600" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>
                    <span className="text-xs text-green-800 font-medium">Connected as <strong>{googleStatus.email}</strong></span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-3">
                {(googleStatus as {connected: boolean; expired?: boolean}).expired && (
                  <a href="/api/auth/google/connect?redirect=/leads" className="text-[11px] text-blue-600 hover:underline font-medium">Reconnect</a>
                )}
                <button onClick={handleGoogleDisconnect} className="text-[11px] text-red-500 hover:text-red-700 underline">Disconnect</button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 border border-gray-200 rounded-lg p-4">
              <p className="text-sm font-medium text-gray-700">Sign in with Google to import from any sheet — no sharing required</p>
              <a
                href="/api/auth/google/connect?redirect=/leads"
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                Sign in with Google
              </a>
              <p className="text-[10px] text-gray-400">Or paste a public sheet URL below ↓</p>
            </div>
          )}

          {/* If connected: Drive sheet picker + tab picker */}
          {googleStatus?.connected && (
            <div className="space-y-2">
              {/* Row 1: spreadsheet dropdown + Browse button */}
              <div className="flex items-center gap-2">
                <select
                  value={selectedDriveSheet}
                  onChange={e => {
                    setSelectedDriveSheet(e.target.value);
                    setSheetsPreview([]);
                    loadTabs(e.target.value);
                  }}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                >
                  <option value="">— Pick a spreadsheet —</option>
                  {driveSheets.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <button
                  onClick={loadDriveSheets}
                  disabled={driveSheetsLoading}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs border border-gray-200 rounded-lg text-gray-600 hover:border-gray-400 disabled:opacity-50 whitespace-nowrap transition-colors"
                >
                  {driveSheetsLoading ? (
                    <>
                      <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                      Loading…
                    </>
                  ) : driveSheets.length === 0 ? '↻ Load Sheets' : '↻ Refresh'}
                </button>
              </div>

              {/* Row 2: tab dropdown (shows after spreadsheet selected) */}
              {selectedDriveSheet && (
                <div className="flex items-center gap-2">
                  {driveSheetsTabsLoading ? (
                    <p className="text-xs text-gray-400 animate-pulse">Loading tabs…</p>
                  ) : driveTabs.length > 0 ? (
                    <>
                      <select
                        value={selectedTab}
                        onChange={e => { setSelectedTab(e.target.value); setSheetsPreview([]); }}
                        className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                      >
                        {driveTabs.map(t => (
                          <option key={t.gid} value={t.gid}>{t.title}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleSheetsFetch(selectedDriveSheet)}
                        disabled={sheetsLoading}
                        className="px-4 py-2 bg-[#1a1a1a] text-white rounded-lg text-sm font-medium hover:bg-[#2a2a2a] disabled:opacity-40 whitespace-nowrap"
                      >
                        {sheetsLoading ? '…' : 'Load Tab'}
                      </button>
                    </>
                  ) : null}
                </div>
              )}

              {/* Error / empty state */}
              {driveSheetsError && !driveSheetsLoading && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <svg className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-red-700">{driveSheetsError}</p>
                    {(driveSheetsError.includes('expired') || driveSheetsError.includes('reconnect')) && (
                      <a
                        href="/api/auth/google/connect?redirect=/leads"
                        className="inline-flex items-center gap-1 mt-1 text-xs font-medium text-blue-600 hover:underline"
                      >
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>
                        Reconnect Google account →
                      </a>
                    )}
                    {!driveSheetsError.includes('expired') && !driveSheetsError.includes('reconnect') && (
                      <button onClick={loadDriveSheets} className="mt-1 text-xs text-blue-600 hover:underline">Try again</button>
                    )}
                  </div>
                </div>
              )}
              {driveSheets.length === 0 && !driveSheetsLoading && !driveSheetsError && (
                <p className="text-[10px] text-gray-400">No spreadsheets loaded yet — click ↻ Refresh or paste a URL below.</p>
              )}
            </div>
          )}

          {/* URL fallback — always visible */}
          <div className="flex gap-2">
            <input
              type="url"
              value={sheetsUrl}
              onChange={e => { setSheetsUrl(e.target.value); setSheetsPreview([]); setSelectedDriveSheet(''); }}
              onKeyDown={e => { if (e.key === 'Enter') handleSheetsFetch(); }}
              placeholder="Or paste a Google Sheets URL…"
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 placeholder-gray-300"
            />
            <button
              onClick={() => handleSheetsFetch()}
              disabled={sheetsLoading || (!sheetsUrl.trim() && !selectedDriveSheet)}
              className="px-4 py-2 bg-[#1a1a1a] text-white rounded-lg text-sm font-medium hover:bg-[#2a2a2a] disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              {sheetsLoading ? '…' : 'Load'}
            </button>
          </div>

          {/* Row range selector */}
          {sheetsAllRows.length > 0 && (
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <span className="text-xs text-gray-500 whitespace-nowrap">
                <strong>{sheetsAllRows.length}</strong> total rows — import rows:
              </span>
              <input
                type="number"
                min={1}
                max={sheetsAllRows.length}
                value={rangeFrom}
                onChange={e => handleRangeChange(e.target.value, rangeTo)}
                className="w-20 px-2 py-1 border border-gray-200 rounded text-sm text-center focus:outline-none focus:ring-2 focus:ring-gray-900"
                placeholder="1"
              />
              <span className="text-xs text-gray-400">to</span>
              <input
                type="number"
                min={1}
                max={sheetsAllRows.length}
                value={rangeTo}
                onChange={e => handleRangeChange(rangeFrom, e.target.value)}
                className="w-20 px-2 py-1 border border-gray-200 rounded text-sm text-center focus:outline-none focus:ring-2 focus:ring-gray-900"
                placeholder={String(sheetsAllRows.length)}
              />
              <button
                onClick={() => handleRangeChange('1', String(sheetsAllRows.length))}
                className="text-xs text-gray-400 hover:text-gray-700 underline whitespace-nowrap"
              >
                All
              </button>
            </div>
          )}

          {/* AI parse — prominent button shown whenever a sheet is loaded */}
          {sheetsAllRows.length > 0 && !aiParsing && (
            <button
              onClick={handleAiParse}
              disabled={!rawSheetsCsv}
              className="w-full flex items-center justify-center gap-2 py-2.5 border border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Names look wrong? Re-parse with AI
            </button>
          )}

          {/* AI parsing spinner */}
          {aiParsing && (
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <svg className="w-4 h-4 animate-spin text-gray-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              <span className="text-xs text-gray-600">AI is reading your sheet… this may take 10–30 seconds for large files.</span>
            </div>
          )}

          {/* AI parse error */}
          {aiParseError && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {aiParseError}
            </div>
          )}

          {/* Preview table */}
          {sheetsPreview.length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-700">
                  {sheetsPreview.length} lead{sheetsPreview.length !== 1 ? 's' : ''} selected
                  {sheetsAllRows.length !== sheetsPreview.length && (
                    <span className="text-gray-400 font-normal"> (of {sheetsAllRows.length})</span>
                  )}
                </p>
                <button
                  onClick={handleAiParse}
                  disabled={aiParsing || !rawSheetsCsv}
                  className="text-xs font-medium text-gray-500 hover:text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Parse with AI
                </button>
              </div>
              <div className="max-h-52 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      {['Name', 'Company', 'Phone', 'Email'].map(h => (
                        <th key={h} className="px-3 py-1.5 text-left font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {sheetsPreview.map((lead, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-1.5 font-medium text-gray-900 truncate max-w-[110px]">{lead.name || '—'}</td>
                        <td className="px-3 py-1.5 text-gray-600 truncate max-w-[110px]">{lead.company || '—'}</td>
                        <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{lead.phone || '—'}</td>
                        <td className="px-3 py-1.5 text-gray-600 truncate max-w-[130px]">{lead.email || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Dialer toggle */}
          {sheetsPreview.length > 0 && (
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <div
                onClick={() => setSheetsAddToDialer(v => !v)}
                className={`w-9 h-5 rounded-full relative transition-colors ${sheetsAddToDialer ? 'bg-gray-900' : 'bg-gray-300'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${sheetsAddToDialer ? 'translate-x-4' : ''}`} />
              </div>
              <span className="text-sm text-gray-700">Also add to <strong>Dialer queue</strong></span>
            </label>
          )}

          {/* Import button */}
          <button
            onClick={handleSheetsImport}
            disabled={loading || sheetsPreview.length === 0}
            className="w-full px-6 py-3 bg-[#1a1a1a] text-white rounded-md font-medium hover:bg-[#2a2a2a] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading
              ? 'Importing…'
              : sheetsPreview.length > 0
                ? `Import ${sheetsPreview.length} Lead${sheetsPreview.length !== 1 ? 's' : ''}${sheetsAddToDialer ? ' + Dialer' : ''}`
                : 'Load a sheet above'}
          </button>

          <p className="text-[10px] text-gray-400 text-center">
            Imported leads appear in your Leads tab only — not on the Dashboard until you make them Active.
          </p>
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
