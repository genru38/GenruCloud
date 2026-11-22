import React, { useEffect, useState } from 'react';
import { AlertTriangle, Folder, FolderInput, HardDrive, X } from 'lucide-react';
import type { FileItem, FolderItem, FolderTreeNode } from '../types/cloud';
import { buildFolderTree, canMoveFolder, countFolderContents } from '../utils/cloudTree';

const FOLDER_COLORS = [
  { id: 'blue', label: 'Biru', swatch: 'bg-blue-600' },
  { id: 'slate', label: 'Abu-abu', swatch: 'bg-slate-600' },
  { id: 'emerald', label: 'Hijau', swatch: 'bg-emerald-600' },
  { id: 'amber', label: 'Kuning', swatch: 'bg-amber-500' },
  { id: 'rose', label: 'Merah Muda', swatch: 'bg-rose-500' },
];

interface ModalFrameProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}

function ModalFrame({ title, subtitle, onClose, children }: ModalFrameProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/45 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="w-full max-w-md rounded-xl bg-white border border-slate-200 shadow-xl overflow-hidden">
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-slate-100">
          <div className="min-w-0">
            <h2 id="modal-title" className="font-display text-base font-semibold text-slate-900">
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-xs text-slate-500 truncate">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup dialog"
            className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

// ==================== CREATE FOLDER MODAL ====================

interface CreateFolderModalProps {
  parentName: string;
  onClose: () => void;
  onSubmit: (name: string, color: string) => Promise<void>;
}

export function CreateFolderModal({ parentName, onClose, onSubmit }: CreateFolderModalProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('blue');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Masukkan nama folder terlebih dahulu.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSubmit(name.trim(), color);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat folder.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalFrame
      title="Buat Folder Baru"
      subtitle={`Lokasi: ${parentName}`}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div role="alert" className="rounded-lg bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs text-red-700">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="new-folder-name" className="block text-sm font-medium text-slate-700 mb-1.5">
            Nama Folder
          </label>
          <input
            id="new-folder-name"
            type="text"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Contoh: Arsip Pajak 2026"
            className="w-full h-10 rounded-lg border border-slate-300 px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
          />
        </div>

        <div>
          <span className="block text-sm font-medium text-slate-700 mb-2">Warna Penanda Folder</span>
          <div className="flex items-center gap-2.5">
            {FOLDER_COLORS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setColor(item.id)}
                aria-label={`Pilih warna ${item.label}`}
                aria-pressed={color === item.id}
                className={`h-7 w-7 rounded-full ${item.swatch} transition-transform ${
                  color === item.id ? 'ring-2 ring-offset-2 ring-slate-900 scale-105' : 'opacity-75 hover:opacity-100'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={saving}
            className="h-9 px-4 rounded-lg bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? 'Menyimpan...' : 'Buat Folder'}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

// ==================== RENAME MODAL ====================

interface RenameModalProps {
  itemType: 'folder' | 'file';
  currentName: string;
  currentColor?: string;
  onClose: () => void;
  onSubmit: (newName: string, newColor?: string) => Promise<void>;
}

export function RenameModal({ itemType, currentName, currentColor = 'blue', onClose, onSubmit }: RenameModalProps) {
  const [name, setName] = useState(currentName);
  const [color, setColor] = useState(currentColor);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Nama tidak boleh kosong.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSubmit(name.trim(), itemType === 'folder' ? color : undefined);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengganti nama.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalFrame
      title={itemType === 'folder' ? 'Ubah Nama & Warna Folder' : 'Ganti Nama File'}
      subtitle={`Nama saat ini: ${currentName}`}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div role="alert" className="rounded-lg bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs text-red-700">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="rename-input" className="block text-sm font-medium text-slate-700 mb-1.5">
            Nama Baru
          </label>
          <input
            id="rename-input"
            type="text"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full h-10 rounded-lg border border-slate-300 px-3 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
          />
        </div>

        {itemType === 'folder' && (
          <div>
            <span className="block text-sm font-medium text-slate-700 mb-2">Warna Penanda Folder</span>
            <div className="flex items-center gap-2.5">
              {FOLDER_COLORS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setColor(item.id)}
                  aria-label={`Pilih warna ${item.label}`}
                  aria-pressed={color === item.id}
                  className={`h-7 w-7 rounded-full ${item.swatch} transition-transform ${
                    color === item.id ? 'ring-2 ring-offset-2 ring-slate-900 scale-105' : 'opacity-75 hover:opacity-100'
                  }`}
                />
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={saving}
            className="h-9 px-4 rounded-lg bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? 'Menyimpan...' : 'Simpan Nama'}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

// ==================== MOVE ITEM MODAL ====================

export interface MoveModalTarget {
  type: 'files' | 'folder';
  ids: string[];
  label: string;
  currentParentId: string | null;
}

interface MoveItemModalProps {
  target: MoveModalTarget;
  allFolders: FolderItem[];
  onClose: () => void;
  onConfirmMove: (destinationFolderId: string | null) => Promise<void>;
}

export function MoveItemModal({ target, allFolders, onClose, onConfirmMove }: MoveItemModalProps) {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(target.currentParentId);
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tree = buildFolderTree(allFolders);

  const isOptionDisabled = (candidateFolderId: string | null): boolean => {
    if (target.type === 'folder') {
      return !canMoveFolder(allFolders, target.ids[0], candidateFolderId);
    }
    return candidateFolderId === target.currentParentId;
  };

  const canConfirm = !isOptionDisabled(selectedFolderId);

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setError(null);
    setMoving(true);
    try {
      await onConfirmMove(selectedFolderId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memindahkan item.');
    } finally {
      setMoving(false);
    }
  };

  const renderPickerNodes = (nodes: FolderTreeNode[]) => {
    return nodes.map((node) => {
      const disabled = isOptionDisabled(node.folder.id);
      const isSelected = selectedFolderId === node.folder.id;

      return (
        <React.Fragment key={node.folder.id}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setSelectedFolderId(node.folder.id)}
            style={{ paddingLeft: `${16 + node.depth * 18}px` }}
            className={`w-full flex items-center justify-between gap-2 pr-3 py-2 rounded-lg text-left text-sm transition-colors ${
              isSelected
                ? 'bg-blue-50 text-blue-700 font-semibold ring-1 ring-blue-500'
                : disabled
                  ? 'text-slate-400 cursor-not-allowed'
                  : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <span className="flex items-center gap-2 min-w-0">
              <Folder className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{node.folder.name}</span>
            </span>
            {node.folder.id === target.currentParentId && (
              <span className="text-[11px] text-slate-400 shrink-0">Lokasi saat ini</span>
            )}
          </button>
          {node.children.length > 0 && renderPickerNodes(node.children)}
        </React.Fragment>
      );
    });
  };

  const rootDisabled = isOptionDisabled(null);

  return (
    <ModalFrame
      title="Pindahkan ke Folder"
      subtitle={`Item: ${target.label}`}
      onClose={onClose}
    >
      <div className="space-y-4">
        {error && (
          <div role="alert" className="rounded-lg bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs text-red-700">
            {error}
          </div>
        )}

        <div
          className="max-h-64 overflow-y-auto rounded-lg border border-slate-200 p-2 space-y-0.5 bg-slate-50/50"
          role="listbox"
          aria-label="Pilih folder tujuan"
        >
          <button
            type="button"
            disabled={rootDisabled}
            onClick={() => setSelectedFolderId(null)}
            className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-left text-sm transition-colors ${
              selectedFolderId === null && !rootDisabled
                ? 'bg-blue-50 text-blue-700 font-semibold ring-1 ring-blue-500'
                : rootDisabled
                  ? 'text-slate-400 cursor-not-allowed'
                  : 'text-slate-800 hover:bg-slate-100'
            }`}
          >
            <span className="flex items-center gap-2">
              <HardDrive className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Penyimpanan Saya (Utama)</span>
            </span>
            {target.currentParentId === null && (
              <span className="text-[11px] text-slate-400 shrink-0">Lokasi saat ini</span>
            )}
          </button>

          {renderPickerNodes(tree)}
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={!canConfirm || moving}
            onClick={handleConfirm}
            className="h-9 inline-flex items-center gap-1.5 px-4 rounded-lg bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <FolderInput className="h-4 w-4" aria-hidden="true" />
            <span>{moving ? 'Memindahkan...' : 'Pindahkan ke Sini'}</span>
          </button>
        </div>
      </div>
    </ModalFrame>
  );
}

// ==================== DELETE CONFIRMATION MODAL ====================

export interface DeleteModalTarget {
  type: 'folder' | 'files' | 'empty_trash';
  ids: string[];
  label: string;
  permanent: boolean;
}

interface DeleteConfirmModalProps {
  target: DeleteModalTarget;
  allFolders: FolderItem[];
  allFiles: FileItem[];
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function DeleteConfirmModal({
  target,
  allFolders,
  allFiles,
  onClose,
  onConfirm,
}: DeleteConfirmModalProps) {
  const [deleting, setDeleting] = useState(false);

  const nestedInfo =
    target.type === 'folder' && target.ids[0]
      ? countFolderContents(allFolders, allFiles, target.ids[0])
      : null;

  const handleConfirm = async () => {
    setDeleting(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <ModalFrame
      title={
        target.type === 'empty_trash'
          ? 'Kosongkan Sampah?'
          : target.permanent
            ? 'Hapus Permanen?'
            : 'Pindahkan ke Sampah?'
      }
      onClose={onClose}
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="h-10 w-10 rounded-lg bg-red-50 text-red-600 flex items-center justify-center shrink-0">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="text-sm text-slate-600 leading-relaxed">
            {target.type === 'empty_trash' ? (
              <p>
                Semua berkas dan folder di dalam Sampah akan dihapus permanen dari penyimpanan internal PC Anda dan tidak dapat dipulihkan.
              </p>
            ) : target.permanent ? (
              <p>
                <strong className="text-slate-900">{target.label}</strong> akan dihapus permanen dari disk internal PC. Tindakan ini tidak dapat dibatalkan.
              </p>
            ) : (
              <p>
                <strong className="text-slate-900">{target.label}</strong> akan dipindahkan ke Sampah. Anda masih dapat memulihkannya nanti.
              </p>
            )}

            {nestedInfo && (nestedInfo.subfolderCount > 0 || nestedInfo.fileCount > 0) && (
              <p className="mt-2 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                Folder ini berisi {nestedInfo.subfolderCount} subfolder dan {nestedInfo.fileCount} file yang juga akan ikut terpengaruh.
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={handleConfirm}
            className="h-9 px-4 rounded-lg bg-red-600 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
          >
            {deleting
              ? 'Menghapus...'
              : target.permanent || target.type === 'empty_trash'
                ? 'Hapus Permanen'
                : 'Hapus'}
          </button>
        </div>
      </div>
    </ModalFrame>
  );
}

// ==================== QUICK NOTE MODAL ====================

interface QuickNoteModalProps {
  parentName: string;
  onClose: () => void;
  onSubmit: (name: string, content: string) => Promise<void>;
}

export function QuickNoteModal({ parentName, onClose, onSubmit }: QuickNoteModalProps) {
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Masukkan nama dokumen.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSubmit(name.trim(), content);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan catatan.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalFrame
      title="Buat Dokumen Catatan Baru"
      subtitle={`Disimpan langsung di: ${parentName}`}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div role="alert" className="rounded-lg bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs text-red-700">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="note-name" className="block text-sm font-medium text-slate-700 mb-1.5">
            Nama File
          </label>
          <input
            id="note-name"
            type="text"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Contoh: Catatan Proyek.md"
            className="w-full h-10 rounded-lg border border-slate-300 px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
          />
        </div>

        <div>
          <label htmlFor="note-content" className="block text-sm font-medium text-slate-700 mb-1.5">
            Isi Catatan
          </label>
          <textarea
            id="note-content"
            rows={5}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Tulis catatan atau dokumentasi di sini..."
            className="w-full rounded-lg border border-slate-300 p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 resize-y"
          />
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={saving}
            className="h-9 px-4 rounded-lg bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? 'Menyimpan...' : 'Simpan Dokumen'}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}
