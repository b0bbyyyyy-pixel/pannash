'use client';

import Link from 'next/link';
import { useState } from 'react';

interface LeadList {
  id: string;
  name: string;
  description?: string;
}

interface LeadListSelectorProps {
  lists: LeadList[];
  selectedListId?: string;
  listCounts: { listId: string; count: number }[];
  unlistedCount: number;
  deleteList: (formData: FormData) => Promise<void>;
  deleteListWithLeads: (formData: FormData) => Promise<void>;
}

export default function LeadListSelector({ 
  lists, 
  selectedListId, 
  listCounts,
  unlistedCount,
  deleteList,
  deleteListWithLeads
}: LeadListSelectorProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDeleteList = async (listId: string, listName: string) => {
    const leadCount = getCount(listId);
    
    // If list is empty, just delete it
    if (leadCount === 0) {
      if (!confirm(`Delete empty list "${listName}"?`)) {
        return;
      }
      
      setDeletingId(listId);
      try {
        const formData = new FormData();
        formData.append('listId', listId);
        await deleteList(formData);
      } catch (error) {
        console.error('Error deleting list:', error);
        alert('Failed to delete list');
      } finally {
        setDeletingId(null);
      }
      return;
    }

    // If list has leads, give user options
    const userChoice = confirm(
      `List "${listName}" contains ${leadCount} lead(s).\n\n` +
      `Click OK to delete the list AND all its leads.\n` +
      `Click Cancel to keep the leads (they'll become uncategorized).`
    );

    setDeletingId(listId);
    try {
      const formData = new FormData();
      formData.append('listId', listId);
      
      if (userChoice) {
        // Delete list AND leads
        await deleteListWithLeads(formData);
      } else {
        // Delete just the list (leads become uncategorized)
        await deleteList(formData);
      }
    } catch (error) {
      console.error('Error deleting list:', error);
      alert('Failed to delete list');
    } finally {
      setDeletingId(null);
    }
  };

  const getCount = (listId: string) => {
    return listCounts.find(c => c.listId === listId)?.count || 0;
  };

  return (
    <div className="mb-6 overflow-x-auto">
      <div className="flex gap-1 border-b border-[#e5e5e5]">
        {/* All Leads Tab */}
        <Link
          href="/leads"
          className={`px-5 py-3 font-medium text-sm border-b-2 transition-colors whitespace-nowrap ${
            !selectedListId
              ? 'border-[#1a1a1a] text-[#1a1a1a]'
              : 'border-transparent text-[#999] hover:text-[#1a1a1a]'
          }`}
        >
          All Leads
          <span className="ml-2 text-xs text-gray-400">
            ({lists.reduce((sum, list) => sum + getCount(list.id), 0) + unlistedCount})
          </span>
        </Link>

        {/* Unlisted Tab (if any) */}
        {unlistedCount > 0 && (
          <Link
            href="/leads?list=unlisted"
            className={`px-5 py-3 font-medium text-sm border-b-2 transition-colors whitespace-nowrap ${
              selectedListId === 'unlisted'
                ? 'border-[#1a1a1a] text-[#1a1a1a]'
                : 'border-transparent text-[#999] hover:text-[#1a1a1a]'
            }`}
          >
            Uncategorized
            <span className="ml-2 text-xs text-gray-400">
              ({unlistedCount})
            </span>
          </Link>
        )}

        {/* Individual List Tabs */}
        {lists.map((list) => (
          <div key={list.id} className="flex items-center group">
            <Link
              href={`/leads?list=${list.id}`}
              className={`px-5 py-3 font-medium text-sm border-b-2 transition-colors whitespace-nowrap ${
                selectedListId === list.id
                  ? 'border-[#1a1a1a] text-[#1a1a1a]'
                  : 'border-transparent text-[#999] hover:text-[#1a1a1a]'
              }`}
            >
              {list.name}
              <span className="ml-2 text-xs text-gray-400">
                ({getCount(list.id)})
              </span>
            </Link>
            <button
              onClick={() => handleDeleteList(list.id, list.name)}
              disabled={deletingId === list.id}
              className="ml-1 px-2 py-1 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity text-xs disabled:opacity-50"
              title="Delete list"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
