import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Clock,
  Cloud,
  FilePlus2,
  Folder,
  FolderOpen,
  FolderPlus,
  HardDrive,
  LogOut,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { FolderTreeNode, NavSection, StorageDiskInfo, UserProfile } from '../types/cloud';
import { formatBytes } from '../utils/cloudTree';

interface SidebarProps {
  user: UserProfile;
  navSection: NavSection;
  currentFolderId: string | null;
  folderTree: FolderTreeNode[];
  storage: StorageDiskInfo | null;
  trashCount: number;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onSelectNav: (section: NavSection, folderId?: string | null) => void;
  onUploadClick: () => void;
  onNewFolderClick: () => void;
  onNewNoteClick: () => void;
  onDropFilesToFolder: (fileIds: string[], targetFolderId: string | null) => void;
  onDropFolderToFolder: (sourceFolderId: string, targetFolderId: string | null) => void;
  onOpenSettings: (tab: 'storage' | 'account') => void;
  onLogout: () => void;
}

export function Sidebar({
  user,
  navSection,
  currentFolderId,
  folderTree,
  storage,
  trashCount,
  mobileOpen,
  onCloseMobile,
  onSelectNav,
  onUploadClick,
  onNewFolderClick,
  onNewNoteClick,
  onDropFilesToFolder,
  onDropFolderToFolder,
  onOpenSettings,
  onLogout,
}: SidebarProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set(['fld-dokumen']));
  const [dragOverFolderId, setDragOverFolderId] = useState<string | 'root' | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);

  const toggleExpand = (folderId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const handleDragOver = (e: React.DragEvent, targetKey: string | 'root') => {
    const types = Array.from(e.dataTransfer.types);
    if (types.includes('application/x-awanku-item')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDragOverFolderId(targetKey);
    }
  };

  const handleDrop = (e: React.DragEvent, targetFolderId: string | null) => {
    e.preventDefault();
    setDragOverFolderId(null);
    const raw = e.dataTransfer.getData('application/x-awanku-item');
    if (!raw) return;
    try {
      const payload = JSON.parse(raw) as { type: 'file' | 'folder'; ids: string[] };
      if (payload.type === 'file' && payload.ids.length > 0) {
        onDropFilesToFolder(payload.ids, targetFolderId);
      } else if (payload.type === 'folder' && payload.ids[0]) {
        onDropFolderToFolder(payload.ids[0], targetFolderId);
      }
    } catch {
      // Ignore invalid payload
    }
  };

  const renderTreeNodes = (nodes: FolderTreeNode[]) => {
    return nodes.map((node) => {
      const isExpanded = expandedIds.has(node.folder.id);
      const isActive = navSection === 'all' && currentFolderId === node.folder.id;
      const isDragTarget = dragOverFolderId === node.folder.id;
      const hasChildren = node.children.length > 0;

      return (
        <div key={node.folder.id}>
          <div
            onDragOver={(e) => handleDragOver(e, node.folder.id)}
            onDragLeave={() => setDragOverFolderId((cur) => (cur === node.folder.id ? null : cur))}
            onDrop={(e) => handleDrop(e, node.folder.id)}
            style={{ paddingLeft: `${8 + node.depth * 14}px` }}
            className={`group flex items-center gap-1 pr-2 py-1 rounded-md transition-colors ${
              isDragTarget
                ? 'bg-blue-100 ring-1 ring-blue-500'
                : isActive
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            {hasChildren ? (
              <button
                type="button"
                onClick={() => toggleExpand(node.folder.id)}
                aria-label={`${isExpanded ? 'Tutup' : 'Buka'} subfolder ${node.folder.name}`}
                className="h-6 w-5 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 shrink-0"
              >
                {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
            ) : (
              <span className="h-6 w-5 shrink-0" aria-hidden="true" />
            )}

            <button
              type="button"
              onClick={() => {
                onSelectNav('all', node.folder.id);
                onCloseMobile();
              }}
              className="flex-1 min-w-0 flex items-center gap-2 py-1 text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
            >
              {isActive ? (
                <FolderOpen className="h-4 w-4 text-blue-600 shrink-0" aria-hidden="true" />
              ) : (
                <Folder className="h-4 w-4 text-slate-400 group-hover:text-slate-600 shrink-0" aria-hidden="true" />
              )}
              <span className="truncate">{node.folder.name}</span>
            </button>
          </div>
          {hasChildren && isExpanded && <div>{renderTreeNodes(node.children)}</div>}
        </div>
      );
    });
  };

  const usedPct = storage
    ? Math.min(100, Math.max(storage.usedBytes > 0 ? 2 : 0, (storage.usedBytes / storage.quotaBytes) * 100))
    : 0;

  const initials = user.name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const sidebarContent = (
    <div className="flex h-full flex-col bg-white border-r border-slate-200">
      {/* Brand Header */}
      <div className="flex items-center justify-between px-5 h-16 border-b border-slate-200 shrink-0">
        <button
          type="button"
          onClick={() => {
            onSelectNav('all', null);
            onCloseMobile();
          }}
          className="flex items-center gap-2.5 text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-md"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white shrink-0">
            <Cloud className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="font-display text-lg font-bold tracking-tight whitespace-nowrap">AwanKu</span>
        </button>

        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Tutup menu navigasi"
          className="lg:hidden h-9 w-9 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Primary Action Buttons */}
      <div className="p-4 space-y-2 border-b border-slate-100 shrink-0">
        <button
          type="button"
          onClick={() => {
            onUploadClick();
            onCloseMobile();
          }}
          className="w-full h-10 inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1 transition-colors whitespace-nowrap"
        >
          <Upload className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Unggah File</span>
        </button>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              onNewFolderClick();
              onCloseMobile();
            }}
            className="h-9 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 transition-colors whitespace-nowrap"
          >
            <FolderPlus className="h-3.5 w-3.5 text-blue-600 shrink-0" aria-hidden="true" />
            <span>Folder Baru</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onNewNoteClick();
              onCloseMobile();
            }}
            className="h-9 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 transition-colors whitespace-nowrap"
          >
            <FilePlus2 className="h-3.5 w-3.5 text-slate-500 shrink-0" aria-hidden="true" />
            <span>Catatan</span>
          </button>
        </div>
      </div>

      {/* Scrollable Navigation + Folder Tree */}
      <nav aria-label="Navigasi penyimpanan" className="flex-1 overflow-y-auto px-3 py-3 space-y-5">
        <div className="space-y-0.5">
          <button
            type="button"
            onDragOver={(e) => handleDragOver(e, 'root')}
            onDragLeave={() => setDragOverFolderId((cur) => (cur === 'root' ? null : cur))}
            onDrop={(e) => handleDrop(e, null)}
            onClick={() => {
              onSelectNav('all', null);
              onCloseMobile();
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              dragOverFolderId === 'root'
                ? 'bg-blue-100 text-blue-800 ring-1 ring-blue-500'
                : navSection === 'all' && currentFolderId === null
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <HardDrive className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">Penyimpanan Saya</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onSelectNav('recent');
              onCloseMobile();
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              navSection === 'recent'
                ? 'bg-blue-50 text-blue-700'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">Terbaru</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onSelectNav('starred');
              onCloseMobile();
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              navSection === 'starred'
                ? 'bg-blue-50 text-blue-700'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Star className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">Berbintang</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onSelectNav('trash');
              onCloseMobile();
            }}
            className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              navSection === 'trash'
                ? 'bg-blue-50 text-blue-700'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <Trash2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="truncate">Sampah</span>
            </span>
            {trashCount > 0 && (
              <span className="font-mono text-xs tabular-nums text-slate-500">{trashCount}</span>
            )}
          </button>
        </div>

        {/* Hierarchical Folder Tree */}
        <div className="pt-3 border-t border-slate-100">
          <div className="flex items-center justify-between px-3 mb-2">
            <span className="text-xs font-semibold text-slate-500">Struktur Folder</span>
            <button
              type="button"
              onClick={() => {
                onNewFolderClick();
                onCloseMobile();
              }}
              aria-label="Buat folder baru dari sidebar"
              className="h-6 w-6 flex items-center justify-center rounded text-slate-400 hover:text-blue-600 hover:bg-slate-100"
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </button>
          </div>
          {folderTree.length > 0 ? (
            <div className="space-y-0.5">{renderTreeNodes(folderTree)}</div>
          ) : (
            <p className="px-3 text-xs text-slate-400">Belum ada folder.</p>
          )}
        </div>
      </nav>

      {/* Internal PC Storage Quota Summary */}
      <button
        type="button"
        onClick={() => {
          onOpenSettings('storage');
          onCloseMobile();
        }}
        aria-label="Detail penyimpanan internal PC"
        className="w-full text-left px-4 py-3.5 border-t border-slate-200 bg-slate-50/70 hover:bg-slate-100/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600 shrink-0"
      >
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="font-medium text-slate-700">Storage Internal PC</span>
          <span className="font-mono tabular-nums text-slate-600">
            {storage ? formatBytes(storage.usedBytes) : '0 B'}
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
          <div
            className="h-full rounded-full bg-blue-600 transition-all duration-200"
            style={{ width: `${usedPct}%` }}
          />
        </div>
        <div className="mt-2 space-y-0.5 text-[11px] text-slate-500">
          <p className="font-mono tabular-nums truncate" title={storage?.storageRootDisplay}>
            {storage ? storage.userVaultDisplay : 'storage_data/vault'}
          </p>
          {storage?.diskFreeBytes != null && (
            <p className="tabular-nums">
              Tersedia di disk: {formatBytes(storage.diskFreeBytes)}
            </p>
          )}
        </div>
      </button>

      {/* User Account Footer */}
      <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between gap-2.5 shrink-0">
        <button
          type="button"
          onClick={() => {
            onOpenSettings('account');
            onCloseMobile();
          }}
          aria-label="Pengaturan profil dan keamanan akun"
          className="flex items-center gap-2.5 min-w-0 flex-1 text-left rounded-lg hover:bg-slate-100 p-1 -m-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          {user.avatarUrl && !avatarFailed ? (
            <img
              src={user.avatarUrl}
              alt={`Foto profil ${user.name}`}
              referrerPolicy="no-referrer"
              onError={() => setAvatarFailed(true)}
              className="h-9 w-9 rounded-full object-cover border border-slate-200 shrink-0"
            />
          ) : (
            <div className="h-9 w-9 rounded-full bg-slate-900 text-white text-xs font-semibold flex items-center justify-center shrink-0">
              {initials}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate">{user.name}</p>
            <p className="text-xs text-slate-500 truncate">{user.email}</p>
          </div>
        </button>
        <button
          type="button"
          onClick={onLogout}
          aria-label="Keluar dari akun"
          title="Keluar"
          className="h-9 w-9 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 shrink-0 transition-colors"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Fixed Sidebar */}
      <aside className="hidden lg:block w-[264px] shrink-0 h-screen sticky top-0">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div
            className="fixed inset-0 bg-slate-950/40"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative z-50 w-[280px] max-w-[85vw] h-full shadow-xl">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}
