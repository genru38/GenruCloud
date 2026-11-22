import React, { useState } from 'react';
import { ChevronRight, LayoutGrid, List, Menu, Search, X } from 'lucide-react';
import type { BreadcrumbItem, NavSection, ViewMode } from '../types/cloud';

interface TopBarProps {
  navSection: NavSection;
  breadcrumbs: BreadcrumbItem[];
  searchQuery: string;
  viewMode: ViewMode;
  onOpenMobileMenu: () => void;
  onNavigateFolder: (folderId: string | null) => void;
  onSearchChange: (value: string) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onDropFilesToFolder: (fileIds: string[], targetFolderId: string | null) => void;
  onDropFolderToFolder: (sourceFolderId: string, targetFolderId: string | null) => void;
}

export function TopBar({
  navSection,
  breadcrumbs,
  searchQuery,
  viewMode,
  onOpenMobileMenu,
  onNavigateFolder,
  onSearchChange,
  onViewModeChange,
  onDropFilesToFolder,
  onDropFolderToFolder,
}: TopBarProps) {
  const [dragTargetId, setDragTargetId] = useState<string | 'root' | null>(null);

  const sectionLabel: Record<Exclude<NavSection, 'all'>, string> = {
    recent: 'File Terbaru',
    starred: 'Berbintang',
    trash: 'Sampah',
  };

  const handleDragOver = (e: React.DragEvent, key: string | 'root') => {
    if (Array.from(e.dataTransfer.types).includes('application/x-awanku-item')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDragTargetId(key);
    }
  };

  const handleDrop = (e: React.DragEvent, targetFolderId: string | null) => {
    e.preventDefault();
    setDragTargetId(null);
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
      // Ignore invalid drag data
    }
  };

  return (
    <header className="sticky top-0 z-20 h-16 bg-white/95 backdrop-blur-xs border-b border-slate-200 px-4 lg:px-8 flex items-center justify-between gap-4">
      {/* Zone 1: Mobile Menu + Contextual Breadcrumb Trail */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Buka menu navigasi"
          className="lg:hidden h-10 w-10 flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 shrink-0"
        >
          <Menu className="h-5 w-5" />
        </button>

        {navSection === 'all' ? (
          <nav aria-label="Lokasi folder saat ini" className="flex items-center gap-1 min-w-0 overflow-x-auto">
            {breadcrumbs.map((crumb, idx) => {
              const isLast = idx === breadcrumbs.length - 1;
              const dropKey = crumb.id ?? 'root';
              const isDragTarget = dragTargetId === dropKey;

              return (
                <React.Fragment key={dropKey}>
                  {idx > 0 && (
                    <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" aria-hidden="true" />
                  )}
                  <button
                    type="button"
                    onClick={() => onNavigateFolder(crumb.id)}
                    onDragOver={(e) => handleDragOver(e, dropKey)}
                    onDragLeave={() => setDragTargetId((cur) => (cur === dropKey ? null : cur))}
                    onDrop={(e) => handleDrop(e, crumb.id)}
                    aria-current={isLast ? 'page' : undefined}
                    className={`px-2 py-1 rounded-md text-sm whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                      isDragTarget
                        ? 'bg-blue-100 text-blue-800 ring-1 ring-blue-500'
                        : isLast
                          ? 'font-semibold text-slate-900'
                          : 'font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    {crumb.name}
                  </button>
                </React.Fragment>
              );
            })}
          </nav>
        ) : (
          <h1 className="font-display text-base font-semibold text-slate-900 truncate">
            {sectionLabel[navSection]}
          </h1>
        )}
      </div>

      {/* Zone 2: Live Search Input */}
      <div className="hidden sm:block relative w-64 md:w-72 lg:w-80 shrink-0">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
          aria-hidden="true"
        />
        <input
          type="search"
          aria-label="Cari file atau folder"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Cari file atau folder..."
          className="w-full h-9 rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-8 text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15 transition-colors"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            aria-label="Hapus pencarian"
            className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded text-slate-400 hover:text-slate-700"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Zone 3: View Mode Segmented Control */}
      <div
        className="flex items-center p-1 bg-slate-100 rounded-lg shrink-0"
        role="group"
        aria-label="Mode tampilan"
      >
        <button
          type="button"
          onClick={() => onViewModeChange('list')}
          aria-pressed={viewMode === 'list'}
          aria-label="Tampilan daftar"
          className={`h-7 px-2.5 inline-flex items-center gap-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
            viewMode === 'list'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <List className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden md:inline">Daftar</span>
        </button>
        <button
          type="button"
          onClick={() => onViewModeChange('grid')}
          aria-pressed={viewMode === 'grid'}
          aria-label="Tampilan kisi"
          className={`h-7 px-2.5 inline-flex items-center gap-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
            viewMode === 'grid'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden md:inline">Kisi</span>
        </button>
      </div>
    </header>
  );
}
