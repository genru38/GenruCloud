import React, { useState } from 'react';
import {
  Archive,
  CheckSquare,
  Download,
  File as FileIcon,
  FileText,
  Film,
  Folder,
  FolderInput,
  FolderPlus,
  Image as ImageIcon,
  Pencil,
  RotateCcw,
  Square,
  Star,
  Trash2,
  Upload,
} from 'lucide-react';
import type { FileItem, FolderItem, NavSection, ViewMode } from '../types/cloud';
import { cloudApi } from '../services/api';
import {
  countFolderContents,
  formatBytes,
  formatFolderSummary,
  formatShortDate,
  getFileCategory,
} from '../utils/cloudTree';

interface FileBrowserProps {
  navSection: NavSection;
  viewMode: ViewMode;
  loading: boolean;
  folders: FolderItem[];
  files: FileItem[];
  allFolders: FolderItem[];
  allFiles: FileItem[];
  selectedFileIds: Set<string>;
  searchQuery: string;
  onToggleSelectFile: (fileId: string) => void;
  onToggleSelectAllFiles: (fileIds: string[]) => void;
  onClearSelection: () => void;
  onOpenFolder: (folderId: string | null) => void;
  onPreviewFile: (file: FileItem) => void;
  onRenameFolder: (folder: FolderItem) => void;
  onMoveFolder: (folder: FolderItem) => void;
  onDeleteFolder: (folder: FolderItem, permanent: boolean) => void;
  onRestoreFolder: (folder: FolderItem) => void;
  onRenameFile: (file: FileItem) => void;
  onMoveFiles: (files: FileItem[]) => void;
  onToggleStar: (file: FileItem) => void;
  onDeleteFiles: (files: FileItem[], permanent: boolean) => void;
  onRestoreFile: (file: FileItem) => void;
  onDropFilesToFolder: (fileIds: string[], targetFolderId: string) => void;
  onDropFolderToFolder: (sourceFolderId: string, targetFolderId: string) => void;
  onExternalFileDrop: (fileList: FileList) => void;
  onUploadClick: () => void;
  onNewFolderClick: () => void;
  onResetSearch: () => void;
}

const FOLDER_COLOR_CLASS: Record<string, string> = {
  blue: 'text-blue-600 fill-blue-50',
  slate: 'text-slate-600 fill-slate-100',
  emerald: 'text-emerald-600 fill-emerald-50',
  amber: 'text-amber-500 fill-amber-50',
  rose: 'text-rose-500 fill-rose-50',
};

function FileTypeIcon({ file, className = 'h-5 w-5' }: { file: FileItem; className?: string }) {
  const category = getFileCategory(file.mimeType, file.name);
  if (category === 'image') return <ImageIcon className={`${className} text-emerald-600`} aria-hidden="true" />;
  if (category === 'media') return <Film className={`${className} text-amber-600`} aria-hidden="true" />;
  if (category === 'archive') return <Archive className={`${className} text-slate-600`} aria-hidden="true" />;
  if (category === 'document') return <FileText className={`${className} text-blue-600`} aria-hidden="true" />;
  return <FileIcon className={`${className} text-slate-500`} aria-hidden="true" />;
}

function ImageThumbnail({ file }: { file: FileItem }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-slate-100 text-slate-400">
        <ImageIcon className="h-7 w-7 mb-1" aria-hidden="true" />
        <span className="text-[11px] font-medium text-slate-500">Gambar</span>
      </div>
    );
  }
  return (
    <img
      src={cloudApi.getFileContentUrl(file.id)}
      alt={`Pratinjau ${file.name}`}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-full w-full object-cover"
    />
  );
}

export function FileBrowser({
  navSection,
  viewMode,
  loading,
  folders,
  files,
  allFolders,
  allFiles,
  selectedFileIds,
  searchQuery,
  onToggleSelectFile,
  onToggleSelectAllFiles,
  onClearSelection,
  onOpenFolder,
  onPreviewFile,
  onRenameFolder,
  onMoveFolder,
  onDeleteFolder,
  onRestoreFolder,
  onRenameFile,
  onMoveFiles,
  onToggleStar,
  onDeleteFiles,
  onRestoreFile,
  onDropFilesToFolder,
  onDropFolderToFolder,
  onExternalFileDrop,
  onUploadClick,
  onNewFolderClick,
  onResetSearch,
}: FileBrowserProps) {
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [externalDragActive, setExternalDragActive] = useState(false);

  const isTrash = navSection === 'trash';
  const folderNameMap = new Map(allFolders.map((f) => [f.id, f.name]));

  const selectedFiles = files.filter((f) => selectedFileIds.has(f.id));

  const startInternalDrag = (e: React.DragEvent, type: 'file' | 'folder', id: string) => {
    const ids =
      type === 'file' && selectedFileIds.has(id) ? Array.from(selectedFileIds) : [id];
    e.dataTransfer.setData('application/x-awanku-item', JSON.stringify({ type, ids }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleFolderDragOver = (e: React.DragEvent, folderId: string) => {
    if (isTrash) return;
    if (Array.from(e.dataTransfer.types).includes('application/x-awanku-item')) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      setDragOverFolderId(folderId);
    }
  };

  const handleFolderDrop = (e: React.DragEvent, targetFolderId: string) => {
    if (isTrash) return;
    const raw = e.dataTransfer.getData('application/x-awanku-item');
    if (!raw) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOverFolderId(null);
    try {
      const payload = JSON.parse(raw) as { type: 'file' | 'folder'; ids: string[] };
      if (payload.type === 'file' && payload.ids.length > 0) {
        onDropFilesToFolder(payload.ids, targetFolderId);
      } else if (payload.type === 'folder' && payload.ids[0] && payload.ids[0] !== targetFolderId) {
        onDropFolderToFolder(payload.ids[0], targetFolderId);
      }
    } catch {
      // Ignore malformed drag data
    }
  };

  const handleContainerDragOver = (e: React.DragEvent) => {
    if (isTrash) return;
    const types = Array.from(e.dataTransfer.types);
    if (types.includes('Files') && !types.includes('application/x-awanku-item')) {
      e.preventDefault();
      setExternalDragActive(true);
    }
  };

  const handleContainerDrop = (e: React.DragEvent) => {
    if (isTrash) return;
    setExternalDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      e.preventDefault();
      onExternalFileDrop(e.dataTransfer.files);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Memuat isi penyimpanan">
        {[1, 2, 3, 4, 5].map((row) => (
          <div
            key={row}
            className="h-12 rounded-lg border border-slate-200 bg-white px-4 flex items-center justify-between animate-pulse"
          >
            <div className="flex items-center gap-3">
              <div className="h-5 w-5 rounded bg-slate-200" />
              <div className="h-4 w-48 rounded bg-slate-200" />
            </div>
            <div className="h-4 w-24 rounded bg-slate-100" />
          </div>
        ))}
      </div>
    );
  }

  const isEmpty = folders.length === 0 && files.length === 0;

  if (isEmpty) {
    return (
      <div
        onDragOver={handleContainerDragOver}
        onDragLeave={() => setExternalDragActive(false)}
        onDrop={handleContainerDrop}
        className={`rounded-xl border border-dashed bg-white px-6 py-16 text-center transition-colors ${
          externalDragActive ? 'border-blue-500 bg-blue-50/50' : 'border-slate-300'
        }`}
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-500 mb-4">
          {isTrash ? <Trash2 className="h-6 w-6" /> : <Folder className="h-6 w-6" />}
        </div>
        <h2 className="font-display text-base font-semibold text-slate-900">
          {searchQuery
            ? `Tidak ada hasil untuk "${searchQuery}"`
            : isTrash
              ? 'Sampah kosong'
              : navSection === 'starred'
                ? 'Belum ada file berbintang'
                : 'Folder ini masih kosong'}
        </h2>
        <p className="mt-1.5 text-sm text-slate-500 max-w-md mx-auto">
          {searchQuery
            ? 'Coba kata kunci lain atau atur ulang filter pencarian Anda.'
            : isTrash
              ? 'Folder atau file yang Anda hapus akan muncul di sini sebelum dihapus permanen.'
              : navSection === 'starred'
                ? 'Tandai file penting dengan ikon bintang untuk akses cepat dari sini.'
                : 'Unggah berkas dari komputer Anda atau buat subfolder baru untuk mulai menata arsip.'}
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {searchQuery ? (
            <button
              type="button"
              onClick={onResetSearch}
              className="h-10 px-4 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              Reset Pencarian
            </button>
          ) : !isTrash && navSection === 'all' ? (
            <>
              <button
                type="button"
                onClick={onUploadClick}
                className="h-10 inline-flex items-center gap-2 px-4 rounded-lg bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700"
              >
                <Upload className="h-4 w-4" aria-hidden="true" />
                <span>Unggah File Pertama</span>
              </button>
              <button
                type="button"
                onClick={onNewFolderClick}
                className="h-10 inline-flex items-center gap-2 px-4 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-800 hover:bg-slate-50"
              >
                <FolderPlus className="h-4 w-4 text-blue-600" aria-hidden="true" />
                <span>Buat Folder Baru</span>
              </button>
            </>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative space-y-6"
      onDragOver={handleContainerDragOver}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setExternalDragActive(false);
      }}
      onDrop={handleContainerDrop}
    >
      {/* External OS File Drop Overlay */}
      {externalDragActive && (
        <div className="fixed inset-0 z-30 pointer-events-none flex items-center justify-center bg-blue-950/20 backdrop-blur-[1px]">
          <div className="rounded-xl border-2 border-dashed border-blue-600 bg-white px-10 py-8 text-center shadow-xl">
            <Upload className="mx-auto h-8 w-8 text-blue-600 mb-3" />
            <p className="font-display text-base font-semibold text-slate-900">
              Lepaskan berkas untuk mengunggah ke folder ini
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Berkas akan langsung disimpan ke storage internal PC Anda
            </p>
          </div>
        </div>
      )}

      {/* Multi-Select Bulk Action Bar */}
      {selectedFiles.length > 0 && !isTrash && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50/90 px-4 py-2.5">
          <span className="text-sm font-medium text-blue-900 tabular-nums">
            {selectedFiles.length} file dipilih
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onMoveFiles(selectedFiles)}
              className="h-8 inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700 whitespace-nowrap"
            >
              <FolderInput className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Pindahkan Terpilih</span>
            </button>
            <button
              type="button"
              onClick={() => onDeleteFiles(selectedFiles, false)}
              className="h-8 inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-white px-3 text-xs font-medium text-red-700 hover:bg-red-50 whitespace-nowrap"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Hapus Terpilih</span>
            </button>
            <button
              type="button"
              onClick={onClearSelection}
              className="h-8 px-2.5 rounded-md text-xs font-medium text-slate-600 hover:text-slate-900"
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {/* ==================== GRID VIEW ==================== */}
      {viewMode === 'grid' ? (
        <div className="space-y-6">
          {folders.length > 0 && (
            <section aria-label="Daftar folder">
              <h2 className="text-xs font-semibold text-slate-500 mb-3">
                Folder ({folders.length})
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
                {folders.map((folder) => {
                  const colorClass = FOLDER_COLOR_CLASS[folder.color] ?? FOLDER_COLOR_CLASS.blue;
                  const isDropTarget = dragOverFolderId === folder.id;
                  const counts = countFolderContents(allFolders, allFiles, folder.id);
                  const summary = formatFolderSummary(counts.subfolderCount, counts.fileCount);

                  return (
                    <div
                      key={folder.id}
                      draggable={!isTrash}
                      onDragStart={(e) => startInternalDrag(e, 'folder', folder.id)}
                      onDragOver={(e) => handleFolderDragOver(e, folder.id)}
                      onDragLeave={() => setDragOverFolderId((cur) => (cur === folder.id ? null : cur))}
                      onDrop={(e) => handleFolderDrop(e, folder.id)}
                      className={`group rounded-xl border bg-white p-3.5 transition-all ${
                        isDropTarget
                          ? 'border-blue-500 bg-blue-50/60 ring-2 ring-blue-500/20'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => !isTrash && onOpenFolder(folder.id)}
                          disabled={isTrash}
                          className="flex-1 min-w-0 flex items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
                        >
                          <Folder className={`h-8 w-8 shrink-0 ${colorClass}`} aria-hidden="true" />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 truncate">
                              {folder.name}
                            </p>
                            <p className="text-xs text-slate-500 tabular-nums mt-0.5 truncate">
                              {summary}
                            </p>
                          </div>
                        </button>
                      </div>

                      <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-end gap-1">
                        {isTrash ? (
                          <>
                            <button
                              type="button"
                              onClick={() => onRestoreFolder(folder)}
                              aria-label={`Pulihkan folder ${folder.name}`}
                              className="h-7 px-2 inline-flex items-center gap-1 rounded text-xs font-medium text-blue-700 hover:bg-blue-50"
                            >
                              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>Pulihkan</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteFolder(folder, true)}
                              aria-label={`Hapus permanen folder ${folder.name}`}
                              className="h-7 px-2 inline-flex items-center gap-1 rounded text-xs font-medium text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>Hapus</span>
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => onRenameFolder(folder)}
                              aria-label={`Ganti nama folder ${folder.name}`}
                              title="Ganti nama folder"
                              className="h-7 w-7 flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onMoveFolder(folder)}
                              aria-label={`Pindahkan folder ${folder.name}`}
                              title="Pindahkan folder"
                              className="h-7 w-7 flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-blue-600"
                            >
                              <FolderInput className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteFolder(folder, false)}
                              aria-label={`Hapus folder ${folder.name}`}
                              title="Hapus folder"
                              className="h-7 w-7 flex items-center justify-center rounded-md text-slate-500 hover:bg-red-50 hover:text-red-600"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {files.length > 0 && (
            <section aria-label="Daftar berkas">
              <h2 className="text-xs font-semibold text-slate-500 mb-3">
                Berkas ({files.length})
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
                {files.map((file) => {
                  const isSelected = selectedFileIds.has(file.id);
                  const isImage = getFileCategory(file.mimeType, file.name) === 'image';

                  return (
                    <div
                      key={file.id}
                      draggable={!isTrash}
                      onDragStart={(e) => startInternalDrag(e, 'file', file.id)}
                      className={`group rounded-xl border bg-white overflow-hidden transition-colors ${
                        isSelected
                          ? 'border-blue-500 ring-2 ring-blue-500/15'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {/* Thumbnail / Preview Area */}
                      <button
                        type="button"
                        onClick={() => onPreviewFile(file)}
                        aria-label={`Pratinjau file ${file.name}`}
                        className="block w-full h-36 bg-slate-50 border-b border-slate-100 overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600"
                      >
                        {isImage ? (
                          <ImageThumbnail file={file} />
                        ) : (
                          <div className="h-full w-full flex flex-col items-center justify-center gap-2 text-slate-400">
                            <FileTypeIcon file={file} className="h-9 w-9" />
                            <span className="font-mono text-[11px] uppercase text-slate-500">
                              {file.name.includes('.') ? file.name.split('.').pop() : 'FILE'}
                            </span>
                          </div>
                        )}
                      </button>

                      {/* File Card Info & Actions */}
                      <div className="p-3.5">
                        <div className="flex items-start gap-2">
                          {!isTrash && (
                            <button
                              type="button"
                              onClick={() => onToggleSelectFile(file.id)}
                              aria-label={isSelected ? `Batal pilih ${file.name}` : `Pilih ${file.name}`}
                              className="mt-0.5 text-slate-400 hover:text-blue-600 shrink-0"
                            >
                              {isSelected ? (
                                <CheckSquare className="h-4 w-4 text-blue-600" />
                              ) : (
                                <Square className="h-4 w-4" />
                              )}
                            </button>
                          )}
                          <div className="min-w-0 flex-1">
                            <button
                              type="button"
                              onClick={() => onPreviewFile(file)}
                              className="text-sm font-semibold text-slate-900 truncate block w-full text-left hover:text-blue-700"
                            >
                              {file.name}
                            </button>
                            <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                              <span className="font-mono tabular-nums">{formatBytes(file.size)}</span>
                              <span aria-hidden="true">·</span>
                              <span className="truncate">
                                {file.folderId ? folderNameMap.get(file.folderId) ?? 'Folder' : 'Utama'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-1">
                          {isTrash ? (
                            <>
                              <button
                                type="button"
                                onClick={() => onRestoreFile(file)}
                                aria-label={`Pulihkan file ${file.name}`}
                                className="h-7 px-2 inline-flex items-center gap-1 rounded text-xs font-medium text-blue-700 hover:bg-blue-50"
                              >
                                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                                <span>Pulihkan</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteFiles([file], true)}
                                aria-label={`Hapus permanen file ${file.name}`}
                                className="h-7 px-2 inline-flex items-center gap-1 rounded text-xs font-medium text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                <span>Hapus</span>
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => onToggleStar(file)}
                                aria-label={file.starred ? `Hapus bintang ${file.name}` : `Bintangi ${file.name}`}
                                className={`h-7 w-7 flex items-center justify-center rounded-md hover:bg-slate-100 ${
                                  file.starred ? 'text-amber-500' : 'text-slate-400 hover:text-amber-500'
                                }`}
                              >
                                <Star className={`h-3.5 w-3.5 ${file.starred ? 'fill-amber-400' : ''}`} />
                              </button>
                              <div className="flex items-center gap-0.5">
                                <button
                                  type="button"
                                  onClick={() => onMoveFiles([file])}
                                  aria-label={`Pindahkan file ${file.name}`}
                                  title="Pindahkan ke folder lain"
                                  className="h-7 w-7 flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-blue-600"
                                >
                                  <FolderInput className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onRenameFile(file)}
                                  aria-label={`Ganti nama file ${file.name}`}
                                  title="Ganti nama file"
                                  className="h-7 w-7 flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <a
                                  href={cloudApi.getFileContentUrl(file.id, true)}
                                  download={file.name}
                                  aria-label={`Unduh file ${file.name}`}
                                  title="Unduh file"
                                  className="h-7 w-7 flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                                >
                                  <Download className="h-3.5 w-3.5" />
                                </a>
                                <button
                                  type="button"
                                  onClick={() => onDeleteFiles([file], false)}
                                  aria-label={`Hapus file ${file.name}`}
                                  title="Hapus file"
                                  className="h-7 w-7 flex items-center justify-center rounded-md text-slate-500 hover:bg-red-50 hover:text-red-600"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      ) : (
        /* ==================== LIST / TABLE VIEW ==================== */
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500">
                  <th className="py-2.5 pl-4 pr-3 w-10">
                    {!isTrash && files.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => onToggleSelectAllFiles(files.map((f) => f.id))}
                        aria-label={
                          files.every((f) => selectedFileIds.has(f.id))
                            ? 'Batal pilih semua file'
                            : 'Pilih semua file'
                        }
                        className="flex items-center justify-center text-slate-400 hover:text-blue-600"
                      >
                        {files.every((f) => selectedFileIds.has(f.id)) ? (
                          <CheckSquare className="h-4 w-4 text-blue-600" />
                        ) : (
                          <Square className="h-4 w-4" />
                        )}
                      </button>
                    ) : (
                      <span className="sr-only">Pilih</span>
                    )}
                  </th>
                  <th className="py-2.5 px-3">Nama</th>
                  <th className="py-2.5 px-3 hidden md:table-cell">Lokasi</th>
                  <th className="py-2.5 px-3 hidden sm:table-cell text-right">Isi / Ukuran</th>
                  <th className="py-2.5 px-3 hidden lg:table-cell text-right">Diubah</th>
                  <th className="py-2.5 pl-3 pr-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {/* Folder Rows */}
                {folders.map((folder) => {
                  const colorClass = FOLDER_COLOR_CLASS[folder.color] ?? FOLDER_COLOR_CLASS.blue;
                  const isDropTarget = dragOverFolderId === folder.id;
                  const counts = countFolderContents(allFolders, allFiles, folder.id);
                  const summary = formatFolderSummary(counts.subfolderCount, counts.fileCount);

                  return (
                    <tr
                      key={folder.id}
                      draggable={!isTrash}
                      onDragStart={(e) => startInternalDrag(e, 'folder', folder.id)}
                      onDragOver={(e) => handleFolderDragOver(e, folder.id)}
                      onDragLeave={() => setDragOverFolderId((cur) => (cur === folder.id ? null : cur))}
                      onDrop={(e) => handleFolderDrop(e, folder.id)}
                      className={`transition-colors ${
                        isDropTarget ? 'bg-blue-50 ring-1 ring-inset ring-blue-500' : 'hover:bg-slate-50/90'
                      }`}
                    >
                      <td className="py-2.5 pl-4 pr-3">
                        <span className="block h-4 w-4" aria-hidden="true" />
                      </td>
                      <td className="py-2.5 px-3">
                        <button
                          type="button"
                          onClick={() => !isTrash && onOpenFolder(folder.id)}
                          disabled={isTrash}
                          className="flex items-center gap-3 text-left font-medium text-slate-900 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
                        >
                          <Folder className={`h-5 w-5 shrink-0 ${colorClass}`} aria-hidden="true" />
                          <span className="truncate max-w-[220px] sm:max-w-[320px]">{folder.name}</span>
                        </button>
                      </td>
                      <td className="py-2.5 px-3 hidden md:table-cell text-xs text-slate-500">
                        {folder.parentId ? folderNameMap.get(folder.parentId) ?? 'Subfolder' : 'Penyimpanan Saya'}
                      </td>
                      <td className="py-2.5 px-3 hidden sm:table-cell text-right font-mono text-xs tabular-nums text-slate-500 whitespace-nowrap">
                        {summary}
                      </td>
                      <td className="py-2.5 px-3 hidden lg:table-cell text-right font-mono text-xs tabular-nums text-slate-500 whitespace-nowrap">
                        {formatShortDate(folder.updatedAt)}
                      </td>
                      <td className="py-2.5 pl-3 pr-4">
                        <div className="flex items-center justify-end gap-1">
                          {isTrash ? (
                            <>
                              <button
                                type="button"
                                onClick={() => onRestoreFolder(folder)}
                                aria-label={`Pulihkan folder ${folder.name}`}
                                className="h-8 px-2.5 inline-flex items-center gap-1 rounded-md text-xs font-medium text-blue-700 hover:bg-blue-50 whitespace-nowrap"
                              >
                                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                                <span>Pulihkan</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteFolder(folder, true)}
                                aria-label={`Hapus permanen folder ${folder.name}`}
                                className="h-8 w-8 flex items-center justify-center rounded-md text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => onRenameFolder(folder)}
                                aria-label={`Ganti nama folder ${folder.name}`}
                                title="Ganti nama folder"
                                className="h-8 w-8 flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-200/70 hover:text-slate-900"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onMoveFolder(folder)}
                                aria-label={`Pindahkan folder ${folder.name}`}
                                title="Pindahkan folder"
                                className="h-8 w-8 flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-200/70 hover:text-blue-600"
                              >
                                <FolderInput className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteFolder(folder, false)}
                                aria-label={`Hapus folder ${folder.name}`}
                                title="Hapus folder"
                                className="h-8 w-8 flex items-center justify-center rounded-md text-slate-500 hover:bg-red-50 hover:text-red-600"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {/* File Rows */}
                {files.map((file) => {
                  const isSelected = selectedFileIds.has(file.id);

                  return (
                    <tr
                      key={file.id}
                      draggable={!isTrash}
                      onDragStart={(e) => startInternalDrag(e, 'file', file.id)}
                      className={`transition-colors ${
                        isSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50/90'
                      }`}
                    >
                      <td className="py-2.5 pl-4 pr-3">
                        {!isTrash && (
                          <button
                            type="button"
                            onClick={() => onToggleSelectFile(file.id)}
                            aria-label={isSelected ? `Batal pilih ${file.name}` : `Pilih ${file.name}`}
                            className="flex items-center justify-center text-slate-400 hover:text-blue-600"
                          >
                            {isSelected ? (
                              <CheckSquare className="h-4 w-4 text-blue-600" />
                            ) : (
                              <Square className="h-4 w-4" />
                            )}
                          </button>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <FileTypeIcon file={file} className="h-5 w-5 shrink-0" />
                          <button
                            type="button"
                            onClick={() => onPreviewFile(file)}
                            className="font-medium text-slate-900 hover:text-blue-700 truncate max-w-[200px] sm:max-w-[300px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
                          >
                            {file.name}
                          </button>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 hidden md:table-cell text-xs text-slate-500">
                        {!isTrash ? (
                          <button
                            type="button"
                            onClick={() => onOpenFolder(file.folderId)}
                            className="hover:text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
                          >
                            {file.folderId ? folderNameMap.get(file.folderId) ?? 'Folder' : 'Penyimpanan Saya'}
                          </button>
                        ) : (
                          <span>{file.folderId ? folderNameMap.get(file.folderId) ?? 'Folder' : 'Penyimpanan Saya'}</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 hidden sm:table-cell text-right font-mono text-xs tabular-nums text-slate-600 whitespace-nowrap">
                        {formatBytes(file.size)}
                      </td>
                      <td className="py-2.5 px-3 hidden lg:table-cell text-right font-mono text-xs tabular-nums text-slate-500 whitespace-nowrap">
                        {formatShortDate(file.updatedAt)}
                      </td>
                      <td className="py-2.5 pl-3 pr-4">
                        <div className="flex items-center justify-end gap-1">
                          {isTrash ? (
                            <>
                              <button
                                type="button"
                                onClick={() => onRestoreFile(file)}
                                aria-label={`Pulihkan file ${file.name}`}
                                className="h-8 px-2.5 inline-flex items-center gap-1 rounded-md text-xs font-medium text-blue-700 hover:bg-blue-50 whitespace-nowrap"
                              >
                                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                                <span>Pulihkan</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteFiles([file], true)}
                                aria-label={`Hapus permanen file ${file.name}`}
                                className="h-8 w-8 flex items-center justify-center rounded-md text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => onToggleStar(file)}
                                aria-label={file.starred ? `Hapus bintang ${file.name}` : `Bintangi ${file.name}`}
                                title={file.starred ? 'Hapus dari berbintang' : 'Tandai berbintang'}
                                className={`h-8 w-8 flex items-center justify-center rounded-md hover:bg-slate-200/70 ${
                                  file.starred ? 'text-amber-500' : 'text-slate-400 hover:text-amber-500'
                                }`}
                              >
                                <Star className={`h-3.5 w-3.5 ${file.starred ? 'fill-amber-400' : ''}`} />
                              </button>
                              <button
                                type="button"
                                onClick={() => onMoveFiles([file])}
                                aria-label={`Pindahkan file ${file.name}`}
                                title="Pindahkan ke folder lain"
                                className="h-8 w-8 flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-200/70 hover:text-blue-600"
                              >
                                <FolderInput className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onRenameFile(file)}
                                aria-label={`Ganti nama file ${file.name}`}
                                title="Ganti nama file"
                                className="h-8 w-8 flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-200/70 hover:text-slate-900"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <a
                                href={cloudApi.getFileContentUrl(file.id, true)}
                                download={file.name}
                                aria-label={`Unduh file ${file.name}`}
                                title="Unduh file"
                                className="h-8 w-8 flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-200/70 hover:text-slate-900"
                              >
                                <Download className="h-3.5 w-3.5" />
                              </a>
                              <button
                                type="button"
                                onClick={() => onDeleteFiles([file], false)}
                                aria-label={`Hapus file ${file.name}`}
                                title="Pindahkan ke sampah"
                                className="h-8 w-8 flex items-center justify-center rounded-md text-slate-500 hover:bg-red-50 hover:text-red-600"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
