'use client';

import Link from 'next/link';
import { useState, useMemo, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface LeadList {
  id: string;
  name: string;
  description?: string;
  created_at?: string;
  folder_name?: string | null;
  parent_list_id?: string | null;
}

interface ListProgress {
  listId: string;
  total: number;     // leads with phone
  attempted: number; // leads with phone + last_contact set
}

interface LeadListSelectorProps {
  lists: LeadList[];
  selectedListId?: string;
  listCounts: { listId: string; count: number }[];
  listProgress: ListProgress[];
  unlistedCount: number;
  deleteList: (formData: FormData) => Promise<void>;
  deleteListWithLeads: (formData: FormData) => Promise<void>;
}

export default function LeadListSelector({
  lists,
  selectedListId,
  listCounts,
  listProgress,
  unlistedCount,
  deleteList,
  deleteListWithLeads,
}: LeadListSelectorProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [openFolder, setOpenFolder] = useState<string | null>(null);
  // Inline sub-list creation
  const [creatingSubFor, setCreatingSubFor] = useState<string | null>(null);
  const [newSubName, setNewSubName] = useState('');
  const [savingSub, setSavingSub] = useState(false);
  // Rename state
  const [renamingListId, setRenamingListId] = useState<string | null>(null);
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; listId?: string; folder?: string } | null>(null);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  // Close context menu on click outside
  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const getCount = (listId: string) =>
    listCounts.find(c => c.listId === listId)?.count || 0;

  const getProgress = (listId: string) => {
    const p = listProgress.find(p => p.listId === listId);
    if (!p || p.total === 0) return null;
    return { total: p.total, attempted: p.attempted, pct: Math.round((p.attempted / p.total) * 100) };
  };

  // Split into top-level lists (no parent) and sub-lists (have parent)
  const { topLevel, subListsByParent } = useMemo(() => {
    const top: LeadList[] = [];
    const subs: Record<string, LeadList[]> = {};
    for (const list of lists) {
      if (list.parent_list_id) {
        if (!subs[list.parent_list_id]) subs[list.parent_list_id] = [];
        subs[list.parent_list_id].push(list);
      } else {
        top.push(list);
      }
    }
    return { topLevel: top, subListsByParent: subs };
  }, [lists]);

  // Group top-level by folder
  const { folders, standalone } = useMemo(() => {
    const folderMap: Record<string, LeadList[]> = {};
    const stand: LeadList[] = [];
    for (const list of topLevel) {
      if (list.folder_name) {
        if (!folderMap[list.folder_name]) folderMap[list.folder_name] = [];
        folderMap[list.folder_name].push(list);
      } else {
        stand.push(list);
      }
    }
    return { folders: folderMap, standalone: stand };
  }, [topLevel]);

  // Auto-open folder containing selected list
  useMemo(() => {
    if (!selectedListId) return;
    for (const [folder, items] of Object.entries(folders)) {
      if (items.some(l => l.id === selectedListId)) {
        setOpenFolder(folder);
        break;
      }
    }
    // Also check sub-lists → find parent → find folder
    for (const [parentId, subs] of Object.entries(subListsByParent)) {
      if (subs.some(s => s.id === selectedListId)) {
        setHoveredId(parentId);
        break;
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDeleteList = async (listId: string, listName: string) => {
    const count = getCount(listId);
    if (count === 0) {
      if (!confirm(`Delete empty list "${listName}"?`)) return;
    } else {
      const ok = confirm(`"${listName}" has ${count} lead(s).\n\nOK → delete list AND all leads.\nCancel → keep leads as Uncategorized.`);
      setDeletingId(listId);
      try {
        const fd = new FormData();
        fd.append('listId', listId);
        if (ok) await deleteListWithLeads(fd);
        else await deleteList(fd);
      } finally { setDeletingId(null); }
      return;
    }
    setDeletingId(listId);
    try {
      const fd = new FormData();
      fd.append('listId', listId);
      await deleteList(fd);
    } finally { setDeletingId(null); }
  };

  const handleCreateSubList = async (parentId: string) => {
    if (!newSubName.trim()) return;
    setSavingSub(true);
    try {
      const res = await fetch('/api/lead-lists/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newSubName.trim(), parentListId: parentId }),
      });
      if (res.ok) {
        setCreatingSubFor(null);
        setNewSubName('');
        router.refresh();
      } else {
        const d = await res.json();
        alert(`Error: ${d.error}`);
      }
    } finally { setSavingSub(false); }
  };

  const startRenameList = (listId: string, currentName: string) => {
    setContextMenu(null);
    setRenamingListId(listId);
    setRenamingFolder(null);
    setRenameValue(currentName);
  };

  const startRenameFolder = (folder: string) => {
    setContextMenu(null);
    setRenamingFolder(folder);
    setRenamingListId(null);
    setRenameValue(folder);
  };

  const commitRename = async () => {
    if (!renameValue.trim()) { cancelRename(); return; }
    if (renamingListId) {
      await fetch('/api/lead-lists', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listId: renamingListId, newName: renameValue.trim() }),
      });
    } else if (renamingFolder) {
      await fetch('/api/lead-lists', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldFolderName: renamingFolder, newFolderName: renameValue.trim() }),
      });
    }
    cancelRename();
    router.refresh();
  };

  const cancelRename = () => {
    setRenamingListId(null);
    setRenamingFolder(null);
    setRenameValue('');
  };

  const startHover = (id: string) => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    setHoveredId(id);
  };
  const endHover = () => {
    hoverTimeout.current = setTimeout(() => setHoveredId(null), 200);
  };

  // Renders a single list tab with hover sub-list dropdown
  function ListTab({ list, inSubRow = false }: { list: LeadList; inSubRow?: boolean }) {
    const isSelected = selectedListId === list.id;
    const count = getCount(list.id);
    const subs = subListsByParent[list.id] || [];
    const hasSubSelected = subs.some(s => s.id === selectedListId);
    const isHovered = hoveredId === list.id;
    const isRenaming = renamingListId === list.id;
    const progress = getProgress(list.id);

    return (
      <div
        className="relative flex items-center group flex-shrink-0"
        onMouseEnter={() => startHover(list.id)}
        onMouseLeave={endHover}
        onContextMenu={e => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, listId: list.id }); }}
      >
        {isRenaming ? (
          <input
            autoFocus
            value={renameValue}
            onChange={e => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') cancelRename(); }}
            className="px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-gray-900 w-32"
          />
        ) : (
          <Link
            href={`/leads?list=${list.id}`}
            className={`px-4 pb-2 pt-2.5 text-sm border-b-2 transition-colors whitespace-nowrap flex flex-col gap-1 ${
              isSelected || hasSubSelected
                ? 'border-[#1a1a1a] text-[#1a1a1a] font-semibold'
                : 'border-transparent text-[#999] hover:text-[#1a1a1a] font-medium'
            } ${inSubRow ? 'pt-2' : ''}`}
          >
            {/* Name + count row */}
            <span className="flex items-center gap-1">
              {list.name}
              <span className="text-xs text-gray-400">({count})</span>
              {subs.length > 0 && (
                <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              )}
            </span>

            {/* Calling progress bar — only shown when list has leads with phone numbers */}
            {progress && (
              <span className="flex items-center gap-1.5 w-full">
                <span className="relative flex-1 h-1.5 rounded-full bg-gray-100 border border-gray-200 overflow-hidden min-w-[60px]">
                  <span
                    className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                    style={{
                      width: `${progress.pct}%`,
                      background: progress.pct === 0
                        ? 'transparent'
                        : `linear-gradient(to right, #d1d5db, #111827)`,
                    }}
                  />
                </span>
                <span className={`text-[10px] font-medium tabular-nums flex-shrink-0 ${
                  progress.pct === 100 ? 'text-gray-900' : 'text-gray-400'
                }`}>
                  {progress.pct}%
                </span>
              </span>
            )}
          </Link>
        )}

        {/* Delete button */}
        {!isRenaming && (
          <button
            onClick={() => handleDeleteList(list.id, list.name)}
            disabled={deletingId === list.id}
            className="ml-0.5 px-1 py-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity text-xs"
          >✕</button>
        )}

        {/* Sub-list hover dropdown */}
        {isHovered && (
          <div
            className="absolute top-full left-0 z-50 bg-white border border-gray-200 rounded-xl shadow-xl min-w-[200px] py-1"
            onMouseEnter={() => startHover(list.id)}
            onMouseLeave={endHover}
          >
            {subs.length > 0 && (
              <>
                <p className="px-3 pt-2 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">Sources</p>
                {subs.map(sub => {
                  const subProgress = getProgress(sub.id);
                  return (
                    <div key={sub.id} className="flex items-center group/sub">
                      <Link
                        href={`/leads?list=${sub.id}`}
                        className={`flex-1 px-3 py-2 text-sm hover:bg-gray-50 transition-colors flex flex-col gap-1 ${
                          selectedListId === sub.id ? 'font-semibold text-gray-900' : 'text-gray-700'
                        }`}
                      >
                        <span>
                          {sub.name}
                          <span className="ml-1.5 text-xs text-gray-400">({getCount(sub.id)})</span>
                        </span>
                        {subProgress && (
                          <span className="flex items-center gap-1.5">
                            <span className="relative flex-1 h-1.5 rounded-full bg-gray-100 border border-gray-200 overflow-hidden">
                              <span
                                className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                                style={{
                                  width: `${subProgress.pct}%`,
                                  background: subProgress.pct === 0
                                    ? 'transparent'
                                    : 'linear-gradient(to right, #d1d5db, #111827)',
                                }}
                              />
                            </span>
                            <span className="text-[10px] text-gray-400 tabular-nums flex-shrink-0">
                              {subProgress.pct}%
                            </span>
                          </span>
                        )}
                      </Link>
                      <button
                        onClick={() => handleDeleteList(sub.id, sub.name)}
                        className="pr-2 text-gray-300 hover:text-red-500 opacity-0 group-hover/sub:opacity-100 text-xs"
                      >✕</button>
                    </div>
                  );
                })}
                <div className="border-t border-gray-100 my-1" />
              </>
            )}

            {/* Inline create sub-list */}
            {creatingSubFor === list.id ? (
              <div className="px-3 py-2 flex gap-1.5">
                <input
                  autoFocus
                  value={newSubName}
                  onChange={e => setNewSubName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleCreateSubList(list.id);
                    if (e.key === 'Escape') { setCreatingSubFor(null); setNewSubName(''); }
                  }}
                  placeholder="Source name…"
                  className="flex-1 px-2 py-1 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-900"
                />
                <button
                  onClick={() => handleCreateSubList(list.id)}
                  disabled={savingSub || !newSubName.trim()}
                  className="px-2 py-1 bg-gray-900 text-white rounded-lg text-xs disabled:opacity-50"
                >
                  {savingSub ? '…' : 'Add'}
                </button>
              </div>
            ) : (
              <button
                onClick={() => { setCreatingSubFor(list.id); setNewSubName(''); }}
                className="w-full text-left px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 flex items-center gap-1.5 transition-colors"
              >
                <span className="text-base leading-none">+</span> New Source
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mb-6">
      {/* ── Row 1: Uncategorized | standalone list tabs | folder dropdown tabs ── */}
      <div className="flex gap-1 border-b border-[#e5e5e5] overflow-x-auto">

        {/* Uncategorized — only if there are genuinely uncategorized leads */}
        {unlistedCount > 0 && (
          <Link
            href="/leads?list=unlisted"
            className={`px-5 py-3 font-medium text-sm border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${
              selectedListId === 'unlisted'
                ? 'border-[#1a1a1a] text-[#1a1a1a]'
                : 'border-transparent text-[#999] hover:text-[#1a1a1a]'
            }`}
          >
            Uncategorized
            <span className="ml-1.5 text-xs text-gray-400">({unlistedCount})</span>
          </Link>
        )}

        {/* Standalone list tabs */}
        {standalone.map(list => <ListTab key={list.id} list={list} />)}

        {/* Folder dropdown tabs */}
        {Object.keys(folders).map(folder => {
          const isOpen = openFolder === folder;
          const folderCount = folders[folder].reduce((s, l) => s + getCount(l.id), 0);
          const hasSelected = folders[folder].some(l => l.id === selectedListId ||
            (subListsByParent[l.id] || []).some(s => s.id === selectedListId));
          const isRenamingThisFolder = renamingFolder === folder;
          return isRenamingThisFolder ? (
            <div key={folder} className="flex items-center px-2 py-2">
              <input
                autoFocus
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') cancelRename(); }}
                className="px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-gray-900 w-36"
              />
            </div>
          ) : (
            <button
              key={folder}
              onClick={() => setOpenFolder(isOpen ? null : folder)}
              onContextMenu={e => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, folder }); }}
              className={`px-5 py-3 font-medium text-sm border-b-2 transition-colors whitespace-nowrap flex-shrink-0 flex items-center gap-1.5 ${
                isOpen || hasSelected ? 'border-[#1a1a1a] text-[#1a1a1a]' : 'border-transparent text-[#999] hover:text-[#1a1a1a]'
              }`}
            >
              📁 {folder}
              <span className="text-xs text-gray-400">({folderCount})</span>
              <svg className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          );
        })}
      </div>

      {/* ── Row 2: lists inside the open folder ── */}
      {openFolder && folders[openFolder] && (
        <div className="flex gap-1 bg-gray-50 border-b border-[#e5e5e5] overflow-x-auto px-2">
          {folders[openFolder].map(list => <ListTab key={list.id} list={list} inSubRow />)}
        </div>
      )}

      {/* Right-click context menu */}
      {contextMenu && (
        <div
          className="fixed z-[9999] bg-white border border-gray-200 rounded-xl shadow-xl py-1 min-w-[160px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={e => e.stopPropagation()}
        >
          {contextMenu.listId && (
            <>
              <button
                onClick={() => {
                  const list = lists.find(l => l.id === contextMenu.listId);
                  if (list) startRenameList(list.id, list.name);
                }}
                className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
              >
                ✏️ Rename list
              </button>
              <button
                onClick={() => {
                  const list = lists.find(l => l.id === contextMenu.listId!);
                  if (list) handleDeleteList(list.id, list.name);
                  setContextMenu(null);
                }}
                className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
              >
                🗑 Delete list
              </button>
            </>
          )}
          {contextMenu.folder && (
            <button
              onClick={() => startRenameFolder(contextMenu.folder!)}
              className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
            >
              ✏️ Rename folder
            </button>
          )}
        </div>
      )}
    </div>
  );
}
