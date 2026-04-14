'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

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
  const router = useRouter();

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
            <h2 className="text-2xl font-bold text-[#1a1a1a] mb-5 tracking-tight">
              Add Lead Manually
            </h2>
            
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
