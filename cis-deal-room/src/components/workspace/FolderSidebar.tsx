'use client';

import { useState, useRef, useEffect } from 'react';
import { Folder, FolderOpen, Plus, Trash2, LayoutGrid, Pencil } from 'lucide-react';
import clsx from 'clsx';
import { fetchWithAuth } from '@/lib/fetch-with-auth';

interface FolderItem {
  id: string;
  workspaceId: string;
  name: string;
  sortOrder: number;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface FolderSidebarProps {
  folders: FolderItem[];
  workspaceId: string;
  selectedFolderId: string | null;
  onFolderSelect: (folderId: string | null) => void;
  onFoldersChange: (folders: FolderItem[]) => void;
  isAdmin: boolean;
}

export function FolderSidebar({
  folders,
  workspaceId,
  selectedFolderId,
  onFolderSelect,
  onFoldersChange,
  isAdmin,
}: FolderSidebarProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [addingFolder, setAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const addInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  useEffect(() => {
    if (addingFolder && addInputRef.current) {
      addInputRef.current.focus();
    }
  }, [addingFolder]);

  function startRename(folder: FolderItem) {
    setRenamingId(folder.id);
    setRenameValue(folder.name);
  }

  async function commitRename(folderId: string) {
    const trimmed = renameValue.trim();
    if (!trimmed) {
      setRenamingId(null);
      return;
    }
    const existing = folders.find((f) => f.id === folderId);
    if (!existing || trimmed === existing.name) {
      setRenamingId(null);
      return;
    }

    // Optimistic update
    onFoldersChange(
      folders.map((f) => (f.id === folderId ? { ...f, name: trimmed } : f))
    );
    setRenamingId(null);

    try {
      const res = await fetchWithAuth(`/api/workspaces/${workspaceId}/folders/${folderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        // Revert
        onFoldersChange(
          folders.map((f) => (f.id === folderId ? { ...f, name: existing.name } : f))
        );
      }
    } catch {
      onFoldersChange(
        folders.map((f) => (f.id === folderId ? { ...f, name: existing.name } : f))
      );
    }
  }

  async function handleDelete(folderId: string) {
    setDeletingId(folderId);
    const previous = [...folders];

    // Optimistic remove
    onFoldersChange(folders.filter((f) => f.id !== folderId));
    if (selectedFolderId === folderId) {
      onFolderSelect(null);
    }

    try {
      const res = await fetchWithAuth(`/api/workspaces/${workspaceId}/folders/${folderId}`, { method: 'DELETE' });
      if (!res.ok) {
        onFoldersChange(previous);
      }
    } catch {
      onFoldersChange(previous);
    } finally {
      setDeletingId(null);
    }
  }

  async function commitAddFolder() {
    const trimmed = newFolderName.trim();
    setAddingFolder(false);
    setNewFolderName('');
    if (!trimmed) return;

    try {
      const res = await fetchWithAuth(`/api/workspaces/${workspaceId}/folders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      if (res.ok) {
        const folder = await res.json();
        onFoldersChange([...folders, folder]);
      }
    } catch {
      // silently fail — folder wasn't added
    }
  }

  return (
    <div className="flex flex-col h-full bg-surface pt-4 pb-2">
      <div className="px-3 mb-2">
        <p className="text-xs font-medium text-text-muted uppercase tracking-wider">
          Folders
        </p>
      </div>

      {/* Folder list */}
      <div className="flex-1 overflow-y-auto">
        {/* Deal overview entry */}
        <div className="mx-1 mb-1">
          <button
            onClick={() => onFolderSelect(null)}
            className={clsx(
              'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
              selectedFolderId === null
                ? 'bg-accent-subtle text-accent-on-subtle'
                : 'text-text-secondary hover:bg-surface-elevated hover:text-text-primary'
            )}
          >
            <LayoutGrid size={14} />
            Deal overview
          </button>
        </div>

        {folders.map((folder) => {
          const isSelected = folder.id === selectedFolderId;
          const isRenaming = renamingId === folder.id;
          const isDeleting = deletingId === folder.id;

          return (
            <div
              key={folder.id}
              className={clsx(
                'group flex items-center gap-2 px-3 py-2 mx-1 rounded-lg transition-colors duration-100',
                isSelected
                  ? 'bg-accent-subtle text-accent-on-subtle'
                  : 'text-text-secondary hover:bg-surface-elevated hover:text-text-primary',
                isDeleting && 'opacity-40'
              )}
            >
              {/* Folder icon */}
              <span className="shrink-0">
                {isSelected ? (
                  <FolderOpen size={14} />
                ) : (
                  <Folder size={14} />
                )}
              </span>

              {/* Folder name / rename input */}
              {isRenaming ? (
                <input
                  ref={renameInputRef}
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => commitRename(folder.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename(folder.id);
                    if (e.key === 'Escape') setRenamingId(null);
                  }}
                  className="flex-1 min-w-0 bg-surface-sunken border border-accent/40 rounded
                    px-1.5 py-0.5 text-sm text-text-primary focus:outline-none focus:border-accent"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <button
                  className="flex-1 min-w-0 text-left text-sm truncate cursor-pointer
                    focus:outline-none"
                  onClick={() => onFolderSelect(isSelected ? null : folder.id)}
                >
                  {folder.name}
                </button>
              )}

              {/* Admin actions — always visible, brighter on hover/focus */}
              {isAdmin && !isRenaming && (
                <div className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100
                  group-focus-within:opacity-100 transition-opacity duration-100 shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      startRename(folder);
                    }}
                    className="p-1.5 text-text-muted hover:text-text-primary rounded
                      transition-colors cursor-pointer
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent
                      focus-visible:ring-offset-1 focus-visible:ring-offset-surface"
                    aria-label={`Rename ${folder.name}`}
                    title="Rename folder"
                  >
                    <Pencil size={14} aria-hidden="true" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(folder.id);
                    }}
                    className="p-1.5 text-text-muted hover:text-accent rounded
                      transition-colors cursor-pointer
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent
                      focus-visible:ring-offset-1 focus-visible:ring-offset-surface
                      disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label={`Delete ${folder.name}`}
                    title="Delete folder"
                    disabled={isDeleting}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {/* Add folder inline input */}
        {addingFolder && (
          <div className="flex items-center gap-2 px-3 py-2 mx-1">
            <Folder size={14} className="text-text-muted shrink-0" />
            <input
              ref={addInputRef}
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onBlur={commitAddFolder}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitAddFolder();
                if (e.key === 'Escape') {
                  setAddingFolder(false);
                  setNewFolderName('');
                }
              }}
              placeholder="Folder name"
              className="flex-1 min-w-0 bg-surface-sunken border border-accent/40 rounded
                px-1.5 py-0.5 text-sm text-text-primary placeholder-text-muted
                focus:outline-none focus:border-accent"
            />
          </div>
        )}
      </div>

      {/* Admin: add folder button */}
      {isAdmin && !addingFolder && (
        <div className="px-2 pt-2 border-t border-border-subtle mt-2">
          <button
            onClick={() => setAddingFolder(true)}
            className="flex items-center gap-2 w-full px-3 py-2 text-xs text-text-muted
              hover:text-text-primary hover:bg-surface-elevated rounded-lg transition-colors duration-100
              focus:outline-none cursor-pointer"
          >
            <Plus size={14} />
            Add folder
          </button>
        </div>
      )}
    </div>
  );
}
