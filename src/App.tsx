import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  FolderPlus,
  HardDrive,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { AuthScreen } from './components/AuthScreen';
import { FileBrowser } from './components/FileBrowser';
import { FilePreviewDrawer } from './components/FilePreviewDrawer';
import {
  CreateFolderModal,
  DeleteConfirmModal,
  MoveItemModal,
  QuickNoteModal,
  RenameModal,
  type DeleteModalTarget,
  type MoveModalTarget,
} from './components/FolderModals';
import { Sidebar } from './components/Sidebar';
import { StorageSettingsModal } from './components/StorageSettingsModal';
import { TopBar } from './components/TopBar';
import { cloudApi, getSavedToken, saveToken } from './services/api';
import type {
  FileCategory,
  FileItem,
  FolderItem,
  NavSection,
  SortKey,
  StorageDiskInfo,
  UserProfile,
  ViewMode,
} from './types/cloud';
import {
  buildBreadcrumbs,
  buildFolderTree,
  filterAndSortWorkspaceItems,
  formatBytes,
} from './utils/cloudTree';

interface ToastMessage {
  id: number;
  text: string;
  tone: 'success' | 'error';
}

const CATEGORY_TABS: { id: FileCategory; label: string }[] = [
  { id: 'all', label: 'Semua' },
  { id: 'document', label: 'Dokumen' },
  { id: 'image', label: 'Gambar' },
  { id: 'media', label: 'Media' },
  { id: 'archive', label: 'Arsip' },
];

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authChecking, setAuthChecking] = useState(true);

  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [storage, setStorage] = useState<StorageDiskInfo | null>(null);
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);

  const [navSection, setNavSection] = useState<NavSection>('all');
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [sortKey, setSortKey] = useState<SortKey>('updated_desc');
  const [category, setCategory] = useState<FileCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(() => new Set());
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  // Modals
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [showQuickNote, setShowQuickNote] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'storage' | 'account' | null>(null);
  const [renameTarget, setRenameTarget] = useState<{
    type: 'folder' | 'file';
    id: string;
    name: string;
    color?: string;
  } | null>(null);
  const [moveTarget, setMoveTarget] = useState<MoveModalTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteModalTarget | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((text: string, tone: 'success' | 'error' = 'success') => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToast({ id: Date.now(), text, tone });
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3500);
  }, []);

  const refreshWorkspace = useCallback(async () => {
    setLoadingWorkspace(true);
    try {
      const data = await cloudApi.getWorkspace();
      setFolders(data.folders);
      setFiles(data.files);
      setStorage(data.storage);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal memuat penyimpanan.', 'error');
    } finally {
      setLoadingWorkspace(false);
    }
  }, [showToast]);

  // Initial session check (and optional ?autostart=1 for instant demo testing)
  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.search);
    const shouldAutostart = params.get('autostart') === '1';

    async function bootstrapAuth() {
      try {
        const existingToken = getSavedToken();
        if (existingToken) {
          const { user: verified } = await cloudApi.getMe();
          if (active) setUser(verified);
        } else if (shouldAutostart) {
          const { user: demoUser } = await cloudApi.login('nadia@awanku.id', 'awanku2026');
          if (active) setUser(demoUser);
        }
      } catch {
        saveToken(null);
      } finally {
        if (active) setAuthChecking(false);
      }
    }

    bootstrapAuth();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (user) {
      refreshWorkspace();
    }
  }, [user, refreshWorkspace]);

  // Reset selection when switching folders or sections
  useEffect(() => {
    setSelectedFileIds(new Set());
  }, [navSection, currentFolderId]);

  const activeFolders = useMemo(() => folders.filter((f) => !f.trashedAt), [folders]);
  const activeFiles = useMemo(() => files.filter((f) => !f.trashedAt), [files]);
  const trashedFolders = useMemo(() => folders.filter((f) => Boolean(f.trashedAt)), [folders]);
  const trashedFiles = useMemo(() => files.filter((f) => Boolean(f.trashedAt)), [files]);

  const folderTree = useMemo(() => buildFolderTree(activeFolders), [activeFolders]);
  const breadcrumbs = useMemo(
    () => buildBreadcrumbs(activeFolders, currentFolderId),
    [activeFolders, currentFolderId]
  );

  const currentFolderName = breadcrumbs[breadcrumbs.length - 1]?.name ?? 'Penyimpanan Saya';

  // Determine visible folders and files based on active nav section & search
  const { folders: visibleFolders, files: visibleFiles } = useMemo(() => {
    const query = searchQuery.trim();

    if (navSection === 'trash') {
      // Only show top-level trashed folders (whose parent is not also trashed) so restore is intuitive
      const trashedFolderIdSet = new Set(trashedFolders.map((f) => f.id));
      const rootTrashedFolders = trashedFolders.filter(
        (f) => !f.parentId || !trashedFolderIdSet.has(f.parentId)
      );
      const standaloneTrashedFiles = trashedFiles.filter(
        (f) => !f.folderId || !trashedFolderIdSet.has(f.folderId)
      );
      return filterAndSortWorkspaceItems({
        folders: rootTrashedFolders,
        files: standaloneTrashedFiles,
        searchQuery,
        category: 'all',
        sortKey,
      });
    }

    if (navSection === 'starred') {
      return filterAndSortWorkspaceItems({
        folders: [],
        files: activeFiles.filter((f) => f.starred),
        searchQuery,
        category,
        sortKey,
      });
    }

    if (navSection === 'recent') {
      return filterAndSortWorkspaceItems({
        folders: [],
        files: activeFiles,
        searchQuery,
        category,
        sortKey: 'updated_desc',
      });
    }

    // If user is searching inside "Semua File", search across the whole vault
    if (query) {
      return filterAndSortWorkspaceItems({
        folders: activeFolders,
        files: activeFiles,
        searchQuery,
        category,
        sortKey,
      });
    }

    // Standard folder view
    return filterAndSortWorkspaceItems({
      folders: activeFolders.filter((f) => f.parentId === currentFolderId),
      files: activeFiles.filter((f) => f.folderId === currentFolderId),
      searchQuery: '',
      category,
      sortKey,
    });
  }, [navSection, activeFolders, activeFiles, trashedFolders, trashedFiles, currentFolderId, searchQuery, category, sortKey]);

  const previewFile = useMemo(
    () => files.find((f) => f.id === previewFileId) ?? null,
    [files, previewFileId]
  );

  const handleSelectNav = (section: NavSection, folderId?: string | null) => {
    setNavSection(section);
    if (section === 'all') {
      setCurrentFolderId(folderId === undefined ? null : folderId);
    }
    setCategory('all');
  };

  const handleLogout = async () => {
    await cloudApi.logout();
    setUser(null);
    setFolders([]);
    setFiles([]);
    setStorage(null);
    setCurrentFolderId(null);
    setPreviewFileId(null);
  };

  // ==================== MUTATION HANDLERS ====================

  const handleCreateFolder = async (name: string, color: string) => {
    const parentId = navSection === 'all' ? currentFolderId : null;
    await cloudApi.createFolder(name, parentId, color);
    await refreshWorkspace();
    showToast(`Folder "${name}" berhasil dibuat di storage internal.`);
  };

  const handleCreateNote = async (name: string, content: string) => {
    const folderId = navSection === 'all' ? currentFolderId : null;
    const { file } = await cloudApi.createQuickNote(name, content, folderId);
    await refreshWorkspace();
    showToast(`Dokumen "${file.name}" berhasil disimpan.`);
  };

  const handleRenameSubmit = async (newName: string, newColor?: string) => {
    if (!renameTarget) return;
    if (renameTarget.type === 'folder') {
      await cloudApi.renameFolder(renameTarget.id, newName, newColor);
      showToast(`Folder berhasil diperbarui menjadi "${newName}".`);
    } else {
      await cloudApi.renameFile(renameTarget.id, newName);
      showToast(`File berhasil diganti nama menjadi "${newName}".`);
    }
    await refreshWorkspace();
  };

  const handleSaveFileContent = async (file: FileItem, nextContent: string) => {
    await cloudApi.updateFileContent(file.id, nextContent);
    await refreshWorkspace();
    showToast(`Perubahan "${file.name}" disimpan ke disk internal.`);
  };

  const handleDuplicateFile = async (file: FileItem) => {
    try {
      const { file: copy } = await cloudApi.duplicateFile(file.id);
      await refreshWorkspace();
      showToast(`Salinan "${copy.name}" berhasil dibuat.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menduplikasi berkas.', 'error');
    }
  };

  const handleSyncDisk = async () => {
    try {
      const res = await cloudApi.syncDisk();
      setFolders(res.folders);
      setFiles(res.files);
      setStorage(res.storage);
      const { addedFolders, addedFiles, updatedFiles, removedMissing } = res.summary;
      const totalChanges = addedFolders + addedFiles + updatedFiles + removedMissing;
      showToast(
        totalChanges > 0
          ? `Sinkronisasi selesai: +${addedFolders} folder, +${addedFiles} file, ${updatedFiles} diperbarui.`
          : 'Disk internal PC sudah sinkron.'
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menyinkronkan disk.', 'error');
    }
  };

  const handleUpdateProfile = async (name: string) => {
    const { user: updated } = await cloudApi.updateProfile(name);
    setUser(updated);
    showToast('Profil akun berhasil diperbarui.');
  };

  const handleChangePassword = async (currentPassword: string, newPassword: string) => {
    await cloudApi.changePassword(currentPassword, newPassword);
    showToast('Kata sandi akun berhasil diperbarui.');
  };

  const handleMoveConfirm = async (destinationFolderId: string | null) => {
    if (!moveTarget) return;
    const destName =
      destinationFolderId === null
        ? 'Penyimpanan Saya'
        : activeFolders.find((f) => f.id === destinationFolderId)?.name ?? 'Folder';

    if (moveTarget.type === 'folder') {
      await cloudApi.moveFolder(moveTarget.ids[0], destinationFolderId);
      showToast(`Folder "${moveTarget.label}" dipindahkan ke ${destName}.`);
    } else {
      await cloudApi.moveFiles(moveTarget.ids, destinationFolderId);
      setSelectedFileIds(new Set());
      showToast(`${moveTarget.ids.length} file dipindahkan ke ${destName}.`);
    }
    await refreshWorkspace();
  };

  const handleDropFilesToFolder = async (fileIds: string[], targetFolderId: string | null) => {
    try {
      const destName =
        targetFolderId === null
          ? 'Penyimpanan Saya'
          : activeFolders.find((f) => f.id === targetFolderId)?.name ?? 'Folder';
      await cloudApi.moveFiles(fileIds, targetFolderId);
      setSelectedFileIds(new Set());
      await refreshWorkspace();
      showToast(`${fileIds.length} file dipindahkan ke ${destName}.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal memindahkan file.', 'error');
    }
  };

  const handleDropFolderToFolder = async (sourceFolderId: string, targetFolderId: string | null) => {
    try {
      const folderName = activeFolders.find((f) => f.id === sourceFolderId)?.name ?? 'Folder';
      const destName =
        targetFolderId === null
          ? 'Penyimpanan Saya'
          : activeFolders.find((f) => f.id === targetFolderId)?.name ?? 'Folder';
      await cloudApi.moveFolder(sourceFolderId, targetFolderId);
      await refreshWorkspace();
      showToast(`Folder "${folderName}" dipindahkan ke ${destName}.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal memindahkan folder.', 'error');
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === 'empty_trash') {
        await cloudApi.emptyTrash();
        showToast('Sampah berhasil dikosongkan dari disk.');
      } else if (deleteTarget.type === 'folder') {
        await cloudApi.deleteFolder(deleteTarget.ids[0], deleteTarget.permanent);
        if (currentFolderId === deleteTarget.ids[0]) {
          setCurrentFolderId(null);
        }
        showToast(
          deleteTarget.permanent
            ? `Folder "${deleteTarget.label}" dihapus permanen.`
            : `Folder "${deleteTarget.label}" dipindahkan ke Sampah.`
        );
      } else {
        if (deleteTarget.permanent) {
          for (const id of deleteTarget.ids) {
            await cloudApi.deleteFile(id, true);
          }
        } else {
          await cloudApi.trashFiles(deleteTarget.ids);
        }
        if (previewFileId && deleteTarget.ids.includes(previewFileId)) {
          setPreviewFileId(null);
        }
        setSelectedFileIds(new Set());
        showToast(
          deleteTarget.permanent
            ? `${deleteTarget.ids.length} file dihapus permanen.`
            : `${deleteTarget.ids.length} file dipindahkan ke Sampah.`
        );
      }
      await refreshWorkspace();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menghapus item.', 'error');
    }
  };

  const handleRestoreFolder = async (folder: FolderItem) => {
    try {
      await cloudApi.restoreFolder(folder.id);
      await refreshWorkspace();
      showToast(`Folder "${folder.name}" berhasil dipulihkan.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal memulihkan folder.', 'error');
    }
  };

  const handleRestoreFile = async (file: FileItem) => {
    try {
      await cloudApi.restoreFile(file.id);
      await refreshWorkspace();
      showToast(`File "${file.name}" berhasil dipulihkan.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal memulihkan file.', 'error');
    }
  };

  const handleToggleStar = async (file: FileItem) => {
    try {
      await cloudApi.toggleStar(file.id);
      await refreshWorkspace();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal memperbarui bintang.', 'error');
    }
  };

  const handleUploadFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const targetFolderId = navSection === 'all' ? currentFolderId : null;
    setUploadProgress(5);
    try {
      const { files: uploaded } = await cloudApi.uploadFiles(fileList, targetFolderId, (pct) => {
        setUploadProgress(pct);
      });
      await refreshWorkspace();
      showToast(`${uploaded.length} file berhasil diunggah ke storage internal PC.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal mengunggah berkas.', 'error');
    } finally {
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleToggleSelectFile = (fileId: string) => {
    setSelectedFileIds((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  };

  const handleToggleSelectAllFiles = (fileIds: string[]) => {
    setSelectedFileIds((prev) => {
      const allSelected = fileIds.length > 0 && fileIds.every((id) => prev.has(id));
      if (allSelected) return new Set();
      return new Set(fileIds);
    });
  };

  // ==================== RENDER ====================

  if (authChecking) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="mx-auto h-8 w-8 rounded-full border-2 border-slate-200 border-t-blue-600 animate-spin" />
          <p className="text-sm text-slate-500">Memeriksa sesi penyimpanan...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen onAuthenticated={(authedUser) => setUser(authedUser)} />;
  }

  const trashTotalCount = trashedFolders.length + trashedFiles.length;
  const previewFolderName = previewFile?.folderId
    ? activeFolders.find((f) => f.id === previewFile.folderId)?.name ?? 'Folder'
    : 'Penyimpanan Saya';

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Hidden native file input for uploads */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        aria-label="Pilih berkas untuk diunggah"
        onChange={(e) => handleUploadFiles(e.target.files)}
      />

      <Sidebar
        user={user}
        navSection={navSection}
        currentFolderId={currentFolderId}
        folderTree={folderTree}
        storage={storage}
        trashCount={trashTotalCount}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        onSelectNav={handleSelectNav}
        onUploadClick={() => fileInputRef.current?.click()}
        onNewFolderClick={() => setShowCreateFolder(true)}
        onNewNoteClick={() => setShowQuickNote(true)}
        onDropFilesToFolder={handleDropFilesToFolder}
        onDropFolderToFolder={handleDropFolderToFolder}
        onOpenSettings={(tab) => setSettingsTab(tab)}
        onLogout={handleLogout}
      />

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar
          navSection={navSection}
          breadcrumbs={breadcrumbs}
          searchQuery={searchQuery}
          viewMode={viewMode}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onNavigateFolder={(folderId) => handleSelectNav('all', folderId)}
          onSearchChange={setSearchQuery}
          onViewModeChange={setViewMode}
          onDropFilesToFolder={handleDropFilesToFolder}
          onDropFolderToFolder={handleDropFolderToFolder}
        />

        <main className="flex-1 px-4 py-6 lg:px-8 max-w-[1360px] w-full mx-auto space-y-5">
          {/* Mobile Search Input */}
          <div className="sm:hidden relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              aria-label="Cari file atau folder"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari file atau folder..."
              className="w-full h-10 rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
            />
          </div>

          {/* Upload Progress Banner */}
          {uploadProgress !== null && (
            <div className="rounded-lg border border-blue-200 bg-white px-4 py-3 flex items-center gap-4">
              <Upload className="h-4 w-4 text-blue-600 shrink-0" aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium text-slate-800">Menyimpan ke storage internal PC...</span>
                  <span className="font-mono tabular-nums text-blue-700">{uploadProgress}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full bg-blue-600 transition-all duration-150"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Workspace Heading & Primary Folder Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 truncate">
                {searchQuery
                  ? `Hasil Pencarian`
                  : navSection === 'all'
                    ? currentFolderName
                    : navSection === 'recent'
                      ? 'File Terbaru'
                      : navSection === 'starred'
                        ? 'File Berbintang'
                        : 'Sampah'}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                <span className="tabular-nums">{visibleFolders.length} folder</span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">{visibleFiles.length} file</span>
                {storage && navSection === 'all' && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1 font-mono tabular-nums text-slate-500">
                      <HardDrive className="h-3 w-3 shrink-0" aria-hidden="true" />
                      <span>{formatBytes(storage.usedBytes)} tersimpan di disk lokal</span>
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {navSection === 'trash' ? (
                trashTotalCount > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setDeleteTarget({
                        type: 'empty_trash',
                        ids: [],
                        label: 'Semua isi Sampah',
                        permanent: true,
                      })
                    }
                    className="h-9 inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3.5 text-xs font-semibold text-red-700 hover:bg-red-50 whitespace-nowrap"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Kosongkan Sampah</span>
                  </button>
                )
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setShowCreateFolder(true)}
                    className="h-9 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap"
                  >
                    <FolderPlus className="h-3.5 w-3.5 text-blue-600" aria-hidden="true" />
                    <span>Folder Baru</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="lg:hidden h-9 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 text-xs font-semibold text-white hover:bg-blue-700 whitespace-nowrap"
                  >
                    <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Unggah File</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Filter Tabs & Sort Bar */}
          {navSection !== 'trash' && (
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div
                className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg overflow-x-auto"
                role="tablist"
                aria-label="Filter kategori berkas"
              >
                {CATEGORY_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={category === tab.id}
                    onClick={() => setCategory(tab.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      category === tab.id
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <label htmlFor="sort-select" className="text-xs text-slate-500 whitespace-nowrap">
                  Urutkan:
                </label>
                <select
                  id="sort-select"
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as SortKey)}
                  className="h-8 rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-xs font-medium text-slate-700 focus:border-blue-600 focus:outline-none"
                >
                  <option value="updated_desc">Terbaru Diubah</option>
                  <option value="name_asc">Nama A–Z</option>
                  <option value="name_desc">Nama Z–A</option>
                  <option value="size_desc">Ukuran Terbesar</option>
                </select>
              </div>
            </div>
          )}

          {/* Main File & Folder Browser */}
          <FileBrowser
            navSection={navSection}
            viewMode={viewMode}
            loading={loadingWorkspace}
            folders={visibleFolders}
            files={visibleFiles}
            allFolders={activeFolders}
            allFiles={activeFiles}
            selectedFileIds={selectedFileIds}
            searchQuery={searchQuery}
            onToggleSelectFile={handleToggleSelectFile}
            onToggleSelectAllFiles={handleToggleSelectAllFiles}
            onClearSelection={() => setSelectedFileIds(new Set())}
            onOpenFolder={(folderId) => {
              setSearchQuery('');
              setCategory('all');
              setNavSection('all');
              setCurrentFolderId(folderId);
            }}
            onPreviewFile={(file) => setPreviewFileId(file.id)}
            onRenameFolder={(folder) =>
              setRenameTarget({ type: 'folder', id: folder.id, name: folder.name, color: folder.color })
            }
            onMoveFolder={(folder) =>
              setMoveTarget({
                type: 'folder',
                ids: [folder.id],
                label: folder.name,
                currentParentId: folder.parentId,
              })
            }
            onDeleteFolder={(folder, permanent) =>
              setDeleteTarget({
                type: 'folder',
                ids: [folder.id],
                label: folder.name,
                permanent,
              })
            }
            onRestoreFolder={handleRestoreFolder}
            onRenameFile={(file) =>
              setRenameTarget({ type: 'file', id: file.id, name: file.name })
            }
            onMoveFiles={(targetFiles) =>
              setMoveTarget({
                type: 'files',
                ids: targetFiles.map((f) => f.id),
                label:
                  targetFiles.length === 1
                    ? targetFiles[0].name
                    : `${targetFiles.length} file terpilih`,
                currentParentId:
                  targetFiles.length === 1 ? targetFiles[0].folderId : null,
              })
            }
            onToggleStar={handleToggleStar}
            onDeleteFiles={(targetFiles, permanent) =>
              setDeleteTarget({
                type: 'files',
                ids: targetFiles.map((f) => f.id),
                label:
                  targetFiles.length === 1
                    ? targetFiles[0].name
                    : `${targetFiles.length} file terpilih`,
                permanent,
              })
            }
            onRestoreFile={handleRestoreFile}
            onDropFilesToFolder={handleDropFilesToFolder}
            onDropFolderToFolder={handleDropFolderToFolder}
            onExternalFileDrop={(fileList) => handleUploadFiles(fileList)}
            onUploadClick={() => fileInputRef.current?.click()}
            onNewFolderClick={() => setShowCreateFolder(true)}
            onResetSearch={() => {
              setSearchQuery('');
              setCategory('all');
            }}
          />
        </main>
      </div>

      {/* Slide-Over File Preview Drawer */}
      <FilePreviewDrawer
        file={previewFile}
        folderDisplayName={previewFolderName}
        onClose={() => setPreviewFileId(null)}
        onRename={(file) => setRenameTarget({ type: 'file', id: file.id, name: file.name })}
        onMove={(file) =>
          setMoveTarget({
            type: 'files',
            ids: [file.id],
            label: file.name,
            currentParentId: file.folderId,
          })
        }
        onDuplicate={handleDuplicateFile}
        onSaveContent={handleSaveFileContent}
        onToggleStar={handleToggleStar}
        onDelete={(file) =>
          setDeleteTarget({
            type: 'files',
            ids: [file.id],
            label: file.name,
            permanent: false,
          })
        }
      />

      {/* Modals */}
      {settingsTab && (
        <StorageSettingsModal
          initialTab={settingsTab}
          user={user}
          files={files}
          storage={storage}
          onClose={() => setSettingsTab(null)}
          onSyncDisk={handleSyncDisk}
          onUpdateProfile={handleUpdateProfile}
          onChangePassword={handleChangePassword}
        />
      )}

      {showCreateFolder && (
        <CreateFolderModal
          parentName={navSection === 'all' ? currentFolderName : 'Penyimpanan Saya'}
          onClose={() => setShowCreateFolder(false)}
          onSubmit={handleCreateFolder}
        />
      )}

      {showQuickNote && (
        <QuickNoteModal
          parentName={navSection === 'all' ? currentFolderName : 'Penyimpanan Saya'}
          onClose={() => setShowQuickNote(false)}
          onSubmit={handleCreateNote}
        />
      )}

      {renameTarget && (
        <RenameModal
          itemType={renameTarget.type}
          currentName={renameTarget.name}
          currentColor={renameTarget.color}
          onClose={() => setRenameTarget(null)}
          onSubmit={handleRenameSubmit}
        />
      )}

      {moveTarget && (
        <MoveItemModal
          target={moveTarget}
          allFolders={activeFolders}
          onClose={() => setMoveTarget(null)}
          onConfirmMove={handleMoveConfirm}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          target={deleteTarget}
          allFolders={folders}
          allFiles={files}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDeleteConfirm}
        />
      )}

      {/* Toast Notification */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-5 right-5 z-50 flex items-center gap-2.5 rounded-lg px-4 py-3 text-sm font-medium shadow-lg border max-w-sm ${
            toast.tone === 'error'
              ? 'bg-red-50 border-red-200 text-red-800'
              : 'bg-slate-900 border-slate-800 text-white'
          }`}
        >
          <CheckCircle2
            className={`h-4 w-4 shrink-0 ${toast.tone === 'error' ? 'text-red-600' : 'text-blue-400'}`}
            aria-hidden="true"
          />
          <span className="leading-snug">{toast.text}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Tutup notifikasi"
            className="ml-1 opacity-70 hover:opacity-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
