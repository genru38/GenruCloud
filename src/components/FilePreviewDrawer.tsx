import React, { useEffect, useState } from 'react';
import {
  Copy,
  Download,
  FilePenLine,
  FileText,
  FolderInput,
  HardDrive,
  Image as ImageIcon,
  Pencil,
  Save,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import type { FileItem } from '../types/cloud';
import { cloudApi } from '../services/api';
import { formatBytes, formatShortDate, getFileCategory, isTextPreviewable } from '../utils/cloudTree';

interface FilePreviewDrawerProps {
  file: FileItem | null;
  folderDisplayName: string;
  onClose: () => void;
  onRename: (file: FileItem) => void;
  onMove: (file: FileItem) => void;
  onDuplicate: (file: FileItem) => void;
  onSaveContent: (file: FileItem, nextContent: string) => Promise<void>;
  onToggleStar: (file: FileItem) => void;
  onDelete: (file: FileItem) => void;
}

export function FilePreviewDrawer({
  file,
  folderDisplayName,
  onClose,
  onRename,
  onMove,
  onDuplicate,
  onSaveContent,
  onToggleStar,
  onDelete,
}: FilePreviewDrawerProps) {
  const [textContent, setTextContent] = useState<string | null>(null);
  const [draftContent, setDraftContent] = useState('');
  const [editing, setEditing] = useState(false);
  const [savingContent, setSavingContent] = useState(false);
  const [loadingText, setLoadingText] = useState(false);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setTextContent(null);
    setDraftContent('');
    setEditing(false);
    setImageError(false);

    if (!file) return;
    if (isTextPreviewable(file.mimeType, file.name)) {
      let active = true;
      setLoadingText(true);
      cloudApi
        .fetchTextContent(file.id)
        .then((content) => {
          if (active) {
            setTextContent(content);
            setDraftContent(content);
          }
        })
        .catch(() => {
          if (active) setTextContent('Tidak dapat memuat pratinjau teks untuk berkas ini.');
        })
        .finally(() => {
          if (active) setLoadingText(false);
        });
      return () => {
        active = false;
      };
    }
  }, [file?.id, file?.updatedAt]);

  useEffect(() => {
    if (!file) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !editing) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [file, editing, onClose]);

  if (!file) return null;

  const category = getFileCategory(file.mimeType, file.name);
  const isImage = category === 'image';
  const isVideo = file.mimeType.startsWith('video/');
  const isAudio = file.mimeType.startsWith('audio/');
  const isPdf = file.mimeType === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  const isText = isTextPreviewable(file.mimeType, file.name);
  const isTrashed = Boolean(file.trashedAt);
  const contentUrl = cloudApi.getFileContentUrl(file.id);

  const handleSaveText = async () => {
    setSavingContent(true);
    try {
      await onSaveContent(file, draftContent);
      setTextContent(draftContent);
      setEditing(false);
    } finally {
      setSavingContent(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-slate-950/35"
      role="dialog"
      aria-modal="true"
      aria-label={`Detail file ${file.name}`}
    >
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />
      <aside className="relative z-50 w-full max-w-lg bg-white h-full border-l border-slate-200 shadow-2xl flex flex-col">
        {/* Drawer Header */}
        <div className="flex items-center justify-between gap-3 px-6 h-16 border-b border-slate-200 shrink-0">
          <div className="min-w-0">
            <h2 className="font-display text-base font-semibold text-slate-900 truncate">
              {file.name}
            </h2>
            <p className="text-xs text-slate-500 truncate">{folderDisplayName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup panel pratinjau"
            className="h-9 w-9 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Preview Stage + Metadata */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
            {isImage ? (
              !imageError ? (
                <img
                  src={contentUrl}
                  alt={file.name}
                  referrerPolicy="no-referrer"
                  onError={() => setImageError(true)}
                  className="w-full max-h-80 object-cover bg-slate-100"
                />
              ) : (
                <div className="h-56 flex flex-col items-center justify-center text-slate-400">
                  <ImageIcon className="h-10 w-10 mb-2" />
                  <span className="text-xs text-slate-500">Pratinjau gambar tidak tersedia</span>
                </div>
              )
            ) : isVideo ? (
              <video controls src={contentUrl} className="w-full max-h-80 bg-slate-950" />
            ) : isAudio ? (
              <div className="p-6 flex flex-col items-center justify-center gap-3 bg-white">
                <p className="text-sm font-medium text-slate-800">{file.name}</p>
                <audio controls src={contentUrl} className="w-full" />
              </div>
            ) : isPdf ? (
              <iframe title={`Pratinjau PDF ${file.name}`} src={contentUrl} className="w-full h-80 bg-white" />
            ) : isText ? (
              <div className="bg-white">
                {!isTrashed && (
                  <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100 bg-slate-50/70">
                    <span className="text-[11px] font-medium text-slate-500">
                      {editing ? 'Mode Editor Langsung' : 'Pratinjau Teks'}
                    </span>
                    {editing ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setDraftContent(textContent ?? '');
                            setEditing(false);
                          }}
                          className="h-7 px-2.5 rounded-md text-xs font-medium text-slate-600 hover:bg-slate-200/70"
                        >
                          Batal
                        </button>
                        <button
                          type="button"
                          disabled={savingContent}
                          onClick={handleSaveText}
                          className="h-7 px-2.5 inline-flex items-center gap-1 rounded-md bg-blue-600 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                        >
                          <Save className="h-3 w-3" aria-hidden="true" />
                          <span>{savingContent ? 'Menyimpan...' : 'Simpan Perubahan'}</span>
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEditing(true)}
                        className="h-7 px-2.5 inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <FilePenLine className="h-3 w-3 text-blue-600" aria-hidden="true" />
                        <span>Edit Isi</span>
                      </button>
                    )}
                  </div>
                )}

                {loadingText ? (
                  <p className="p-4 text-xs text-slate-400">Memuat isi berkas...</p>
                ) : editing ? (
                  <textarea
                    aria-label={`Editor isi ${file.name}`}
                    value={draftContent}
                    onChange={(e) => setDraftContent(e.target.value)}
                    rows={12}
                    className="w-full p-4 font-mono text-xs leading-relaxed text-slate-900 bg-white focus:outline-none resize-y"
                  />
                ) : (
                  <div className="p-4 max-h-80 overflow-y-auto">
                    <pre className="font-mono text-xs leading-relaxed text-slate-800 whitespace-pre-wrap break-words">
                      {textContent}
                    </pre>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-48 flex flex-col items-center justify-center text-slate-500 px-6 text-center">
                <FileText className="h-10 w-10 text-blue-600 mb-2.5" aria-hidden="true" />
                <p className="text-sm font-medium text-slate-800">{file.name}</p>
                <p className="text-xs text-slate-500 mt-1">
                  Unduh berkas untuk membukanya dengan aplikasi di perangkat Anda.
                </p>
              </div>
            )}
          </div>

          {/* Action Row */}
          {!isTrashed && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <a
                href={cloudApi.getFileContentUrl(file.id, true)}
                download={file.name}
                className="h-9 inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700 whitespace-nowrap"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Unduh</span>
              </a>
              <button
                type="button"
                onClick={() => onMove(file)}
                className="h-9 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                <FolderInput className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Pindahkan</span>
              </button>
              <button
                type="button"
                onClick={() => onRename(file)}
                className="h-9 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Ubah Nama</span>
              </button>
              <button
                type="button"
                onClick={() => onDuplicate(file)}
                className="h-9 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Duplikasi</span>
              </button>
              <button
                type="button"
                onClick={() => onToggleStar(file)}
                className="h-9 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                <Star
                  className={`h-3.5 w-3.5 ${file.starred ? 'text-amber-500 fill-amber-400' : 'text-slate-400'}`}
                  aria-hidden="true"
                />
                <span>{file.starred ? 'Berbintang' : 'Bintangi'}</span>
              </button>
              <button
                type="button"
                onClick={() => onDelete(file)}
                className="h-9 inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 text-xs font-medium text-red-600 hover:bg-red-50 whitespace-nowrap"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Hapus</span>
              </button>
            </div>
          )}

          {/* File Metadata List */}
          <div className="pt-4 border-t border-slate-200">
            <h3 className="text-xs font-semibold text-slate-500 mb-3">Informasi Berkas</h3>

            <dl className="divide-y divide-slate-100 text-sm">
              <div className="py-2.5 flex items-center justify-between gap-4">
                <dt className="text-slate-500">Ukuran</dt>
                <dd className="font-mono text-xs tabular-nums text-slate-900">{formatBytes(file.size)}</dd>
              </div>
              <div className="py-2.5 flex items-center justify-between gap-4">
                <dt className="text-slate-500">Tipe MIME</dt>
                <dd className="font-mono text-xs text-slate-900 truncate max-w-[220px]">{file.mimeType}</dd>
              </div>
              <div className="py-2.5 flex items-center justify-between gap-4">
                <dt className="text-slate-500">Lokasi Folder</dt>
                <dd className="text-slate-900 text-right">{folderDisplayName}</dd>
              </div>
              <div className="py-2.5 flex items-center justify-between gap-4">
                <dt className="text-slate-500">Terakhir Diubah</dt>
                <dd className="font-mono text-xs tabular-nums text-slate-900">{formatShortDate(file.updatedAt)}</dd>
              </div>
              <div className="py-2.5 flex flex-col gap-1">
                <dt className="text-slate-500 flex items-center gap-1.5">
                  <HardDrive className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                  <span>Path Storage Internal PC</span>
                </dt>
                <dd className="font-mono text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 break-all">
                  {file.relativeDiskPath}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </aside>
    </div>
  );
}
