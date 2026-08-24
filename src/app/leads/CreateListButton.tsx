'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface CreateListButtonProps {
  existingFolders?: string[];
}

export default function CreateListButton({ existingFolders = [] }: CreateListButtonProps) {
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [folderMode, setFolderMode] = useState<'none' | 'existing' | 'new'>('none');
  const [selectedFolder, setSelectedFolder] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const folderName =
      folderMode === 'existing' ? selectedFolder :
      folderMode === 'new'      ? newFolderName.trim() :
      '';

    try {
      const response = await fetch('/api/lead-lists/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, folderName: folderName || null }),
      });

      if (response.ok) {
        setShowModal(false);
        setName('');
        setDescription('');
        setFolderMode('none');
        setSelectedFolder('');
        setNewFolderName('');
        router.refresh();
      } else {
        const data = await response.json();
        alert(`Error: ${data.error}`);
      }
    } catch {
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

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-md p-8 max-w-md w-full">
            <h2 className="text-2xl font-bold text-[#1a1a1a] mb-5 tracking-tight">
              Create Lead List
            </h2>

            <form onSubmit={handleCreate} className="space-y-4">
              {/* List name */}
              <div>
                <label className="block text-sm font-bold text-[#1a1a1a] mb-2 tracking-tight">
                  List Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Monday FP, Shore Leads Aug 25"
                  required
                  className="w-full px-4 py-3 bg-white border border-[#e5e5e5] rounded-md text-[#1a1a1a] focus:outline-none focus:ring-1 focus:ring-[#1a1a1a] focus:border-[#1a1a1a]"
                />
              </div>

              {/* Folder */}
              <div>
                <label className="block text-sm font-bold text-[#1a1a1a] mb-2 tracking-tight">
                  Folder <span className="font-normal text-[#999]">(optional — groups tabs together)</span>
                </label>
                <div className="flex gap-2 mb-2">
                  {(['none', 'existing', 'new'] as const).map(mode => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setFolderMode(mode)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                        folderMode === mode
                          ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]'
                          : 'bg-white text-[#6b6b6b] border-[#e5e5e5] hover:border-[#1a1a1a]'
                      }`}
                    >
                      {mode === 'none' ? 'No folder' : mode === 'existing' ? 'Existing folder' : 'New folder'}
                    </button>
                  ))}
                </div>

                {folderMode === 'existing' && (
                  existingFolders.length > 0 ? (
                    <select
                      value={selectedFolder}
                      onChange={e => setSelectedFolder(e.target.value)}
                      required
                      className="w-full px-4 py-3 bg-white border border-[#e5e5e5] rounded-md text-[#1a1a1a] focus:outline-none focus:ring-1 focus:ring-[#1a1a1a]"
                    >
                      <option value="">Select a folder…</option>
                      {existingFolders.map(f => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-sm text-[#999] mt-1">No folders yet — create one first.</p>
                  )
                )}

                {folderMode === 'new' && (
                  <input
                    type="text"
                    value={newFolderName}
                    onChange={e => setNewFolderName(e.target.value)}
                    placeholder="e.g. August 2026, Monday Lists"
                    required
                    className="w-full px-4 py-3 bg-white border border-[#e5e5e5] rounded-md text-[#1a1a1a] focus:outline-none focus:ring-1 focus:ring-[#1a1a1a] focus:border-[#1a1a1a]"
                  />
                )}
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-bold text-[#1a1a1a] mb-2 tracking-tight">
                  Description <span className="font-normal text-[#999]">(optional)</span>
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Enterprise leads from LinkedIn"
                  rows={2}
                  className="w-full px-4 py-3 bg-white border border-[#e5e5e5] rounded-md text-[#1a1a1a] focus:outline-none focus:ring-1 focus:ring-[#1a1a1a] focus:border-[#1a1a1a]"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2.5 border border-[#e5e5e5] rounded-md text-[#6b6b6b] hover:border-[#1a1a1a] hover:text-[#1a1a1a] transition-colors font-medium text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || (folderMode === 'existing' && !selectedFolder) || (folderMode === 'new' && !newFolderName.trim())}
                  className="flex-1 px-4 py-2.5 bg-[#1a1a1a] text-white rounded-md hover:bg-[#2a2a2a] disabled:opacity-50 transition-colors font-medium text-sm"
                >
                  {loading ? 'Creating…' : 'Create List'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
