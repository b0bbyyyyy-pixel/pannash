'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function CreateListButton() {
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('/api/lead-lists/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description }),
      });

      if (response.ok) {
        setShowModal(false);
        setName('');
        setDescription('');
        router.refresh();
      } else {
        const data = await response.json();
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Error creating list:', error);
      alert('Failed to create list');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="px-5 py-2.5 bg-[#1a1a1a] text-white rounded-md text-sm font-medium hover:bg-[#2a2a2a] transition-colors"
      >
        New List
      </button>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-md p-8 max-w-md w-full">
            <h2 className="text-2xl font-bold text-[#1a1a1a] mb-5 tracking-tight">
              Create Lead List
            </h2>
            
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-[#1a1a1a] mb-2 tracking-tight">
                  List Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Q1 2026 Prospects"
                  required
                  className="w-full px-4 py-3 bg-white border border-[#e5e5e5] rounded-md text-[#1a1a1a] focus:outline-none focus:ring-1 focus:ring-[#1a1a1a] focus:border-[#1a1a1a]"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-[#1a1a1a] mb-2 tracking-tight">
                  Description (optional)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Enterprise leads from LinkedIn"
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
                  {loading ? 'Creating...' : 'Create List'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
