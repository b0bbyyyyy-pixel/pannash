'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { parseLeadPasteText } from '@/lib/parse-lead-paste';

interface AddLeadButtonProps {
  selectedListId?: string;
}

export default function AddLeadButton({ selectedListId }: AddLeadButtonProps) {
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [quickPaste, setQuickPaste] = useState('');
  const [parseNote, setParseNote] = useState('');
  const router = useRouter();

  const applyPasted = () => {
    const p = parseLeadPasteText(quickPaste);
    setName((n) => p.name || n);
    setEmail((e) => p.email || e);
    setPhone((ph) => p.phone || ph);
    setCompany((c) => p.company || c);
    if (p.remainder) {
      setNotes((prev) => (prev.trim() ? `${prev}\n\n${p.remainder}` : p.remainder));
    }
    const n = [p.name, p.email, p.phone, p.company].filter(Boolean).length;
    setParseNote(
      n > 0
        ? `Filled ${n} field(s)${p.remainder ? '; extra text added to notes' : ''}.`
        : 'Could not auto-detect fields. Try name / email on separate lines or Name: / Email: labels.'
    );
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('/api/leads/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          phone: phone || null,
          company: company || null,
          notes: notes || null,
          list_id: selectedListId && selectedListId !== 'unlisted' ? selectedListId : null,
        }),
      });

      if (response.ok) {
        setShowModal(false);
        setName('');
        setEmail('');
        setPhone('');
        setCompany('');
        setNotes('');
        setQuickPaste('');
        setParseNote('');
        router.refresh();
      } else {
        const data = await response.json();
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Error creating lead:', error);
      alert('Failed to create lead');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="px-4 py-2 border border-[#e5e5e5] text-[#1a1a1a] rounded-md text-sm font-medium hover:border-[#1a1a1a] transition-colors"
      >
        Add Lead
      </button>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-md p-8 max-w-md w-full">
            <h2 className="text-2xl font-bold text-[#1a1a1a] mb-2 tracking-tight">
              Add Lead Manually
            </h2>
            <p className="text-sm text-[#6b6b6b] mb-4">Fill in the fields, or use Quick paste at the bottom to auto-fill from a block of text.</p>
            
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-[#1a1a1a] mb-2 tracking-tight">
                  Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Smith"
                  required
                  className="w-full px-4 py-3 bg-white border border-[#e5e5e5] rounded-md text-[#1a1a1a] focus:outline-none focus:ring-1 focus:ring-[#1a1a1a] focus:border-[#1a1a1a]"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-[#1a1a1a] mb-2 tracking-tight">
                  Email *
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="john@company.com"
                  required
                  className="w-full px-4 py-3 bg-white border border-[#e5e5e5] rounded-md text-[#1a1a1a] focus:outline-none focus:ring-1 focus:ring-[#1a1a1a] focus:border-[#1a1a1a]"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-[#1a1a1a] mb-2 tracking-tight">
                  Phone
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="555-1234"
                  className="w-full px-4 py-3 bg-white border border-[#e5e5e5] rounded-md text-[#1a1a1a] focus:outline-none focus:ring-1 focus:ring-[#1a1a1a] focus:border-[#1a1a1a]"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-[#1a1a1a] mb-2 tracking-tight">
                  Company
                </label>
                <input
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Acme Corp"
                  className="w-full px-4 py-3 bg-white border border-[#e5e5e5] rounded-md text-[#1a1a1a] focus:outline-none focus:ring-1 focus:ring-[#1a1a1a] focus:border-[#1a1a1a]"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-[#1a1a1a] mb-2 tracking-tight">
                  Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Additional information..."
                  rows={3}
                  className="w-full px-4 py-3 bg-white border border-[#e5e5e5] rounded-md text-[#1a1a1a] focus:outline-none focus:ring-1 focus:ring-[#1a1a1a] focus:border-[#1a1a1a]"
                />
              </div>

              <div className="p-3 bg-[#f9f9f9] border border-[#e5e5e5] rounded-md">
                <label className="block text-sm font-bold text-[#1a1a1a] mb-2">Quick paste</label>
                <p className="text-xs text-[#6b6b6b] mb-2">Paste a signature or vCard — we map name, email, phone, and company; extra text can be added to notes.</p>
                <textarea
                  value={quickPaste}
                  onChange={(e) => setQuickPaste(e.target.value)}
                  className="w-full min-h-[88px] px-3 py-2 border border-[#e5e5e5] rounded-md text-sm font-mono"
                  placeholder="Paste signature, vCard, or any text with name, email, phone…"
                />
                <div className="flex gap-2 mt-2">
                  <button type="button" onClick={applyPasted} className="px-3 py-1.5 bg-[#5a7fc7] text-white rounded-md text-sm font-medium">
                    Parse &amp; fill
                  </button>
                  <button type="button" onClick={() => { setQuickPaste(''); setParseNote(''); }} className="px-3 py-1.5 border border-[#e5e5e5] rounded-md text-sm">
                    Clear
                  </button>
                </div>
                {parseNote && <p className="text-xs text-[#4a4a4a] mt-2">{parseNote}</p>}
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2.5 border border-[#e5e5e5] rounded-md text-[#6b6b6b] hover:border-[#1a1a1a] hover:text-[#1a1a1a] transition-colors font-medium text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2.5 bg-[#1a1a1a] text-white rounded-md hover:bg-[#2a2a2a] disabled:opacity-50 transition-colors font-medium text-sm"
                >
                  {loading ? 'Adding...' : 'Add Lead'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
