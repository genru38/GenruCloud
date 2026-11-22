import React, { useEffect, useState } from 'react';
import { Check, Copy, HardDrive, KeyRound, RefreshCw, User, X } from 'lucide-react';
import type { FileItem, StorageDiskInfo, UserProfile } from '../types/cloud';
import { calculateCategoryBreakdown, formatBytes } from '../utils/cloudTree';

interface StorageSettingsModalProps {
  initialTab: 'storage' | 'account';
  user: UserProfile;
  files: FileItem[];
  storage: StorageDiskInfo | null;
  onClose: () => void;
  onSyncDisk: () => Promise<void>;
  onUpdateProfile: (name: string) => Promise<void>;
  onChangePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const CATEGORY_BAR_COLOR: Record<string, string> = {
  document: 'bg-blue-600',
  image: 'bg-emerald-500',
  media: 'bg-amber-500',
  archive: 'bg-slate-600',
  other: 'bg-slate-400',
};

export function StorageSettingsModal({
  initialTab,
  user,
  files,
  storage,
  onClose,
  onSyncDisk,
  onUpdateProfile,
  onChangePassword,
}: StorageSettingsModalProps) {
  const [tab, setTab] = useState<'storage' | 'account'>(initialTab);
  const [syncing, setSyncing] = useState(false);
  const [copiedPath, setCopiedPath] = useState(false);

  // Profile form state
  const [displayName, setDisplayName] = useState(user.name);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Password form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const breakdown = calculateCategoryBreakdown(files);
  const totalActiveBytes = storage?.usedBytes ?? 0;

  const handleCopyPath = async () => {
    const textToCopy = storage?.storageRootDisplay || storage?.userVaultDisplay || '';
    if (!textToCopy) return;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopiedPath(true);
      window.setTimeout(() => setCopiedPath(false), 2000);
    } catch {
      // Clipboard fallback not needed
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await onSyncDisk();
    } finally {
      setSyncing(false);
    }
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg(null);
    if (displayName.trim().length < 2) {
      setProfileMsg({ type: 'err', text: 'Nama lengkap minimal 2 karakter.' });
      return;
    }
    setSavingProfile(true);
    try {
      await onUpdateProfile(displayName.trim());
      setProfileMsg({ type: 'ok', text: 'Nama profil berhasil diperbarui.' });
    } catch (err) {
      setProfileMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal memperbarui profil.',
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg(null);
    if (!currentPassword) {
      setPasswordMsg({ type: 'err', text: 'Masukkan kata sandi saat ini.' });
      return;
    }
    if (newPassword.length < 6) {
      setPasswordMsg({ type: 'err', text: 'Kata sandi baru minimal 6 karakter.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'err', text: 'Konfirmasi kata sandi baru tidak cocok.' });
      return;
    }
    setSavingPassword(true);
    try {
      await onChangePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMsg({ type: 'ok', text: 'Kata sandi berhasil diperbarui.' });
    } catch (err) {
      setPasswordMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal mengganti kata sandi.',
      });
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/45 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
    >
      <div className="w-full max-w-xl rounded-xl bg-white border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-slate-200 shrink-0">
          <div>
            <h2 id="settings-modal-title" className="font-display text-base font-semibold text-slate-900">
              Penyimpanan & Pengaturan Akun
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Pantau disk internal PC, sinkronkan folder lokal, dan kelola keamanan akun.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup pengaturan"
            className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-800 shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Segmented Tabs */}
        <div className="px-6 pt-4 shrink-0">
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'storage'}
              onClick={() => setTab('storage')}
              className={`py-2 px-3 inline-flex items-center justify-center gap-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                tab === 'storage' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <HardDrive className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Storage Internal PC</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'account'}
              onClick={() => setTab('account')}
              className={`py-2 px-3 inline-flex items-center justify-center gap-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                tab === 'account' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <User className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Profil & Keamanan</span>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {tab === 'storage' ? (
            <>
              {/* Disk Overview Strip */}
              <div className="grid grid-cols-3 gap-4 pb-5 border-b border-slate-100">
                <div>
                  <p className="text-xs text-slate-500">Terpakai di Vault</p>
                  <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-slate-900">
                    {formatBytes(totalActiveBytes)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Total Item</p>
                  <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-slate-900">
                    {storage ? `${storage.totalFolders} / ${storage.totalFiles}` : '0 / 0'}
                  </p>
                  <p className="text-[11px] text-slate-400">folder / file</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Kosong di Disk PC</p>
                  <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-slate-900">
                    {storage?.diskFreeBytes != null ? formatBytes(storage.diskFreeBytes) : '—'}
                  </p>
                </div>
              </div>

              {/* Category Breakdown */}
              <div>
                <h3 className="text-xs font-semibold text-slate-700 mb-3">Distribusi Tipe Berkas</h3>
                {/* Stacked Proportion Bar */}
                <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden flex mb-4">
                  {breakdown.map((item) =>
                    item.bytes > 0 ? (
                      <div
                        key={item.category}
                        className={`${CATEGORY_BAR_COLOR[item.category]} h-full transition-all`}
                        style={{ width: `${Math.max(item.percentage, 2)}%` }}
                        title={`${item.label}: ${formatBytes(item.bytes)}`}
                      />
                    ) : null
                  )}
                </div>

                <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                  {breakdown.map((item) => (
                    <div
                      key={item.category}
                      className="px-3.5 py-2.5 bg-white flex items-center justify-between gap-4 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`h-2.5 w-2.5 rounded-xs shrink-0 ${CATEGORY_BAR_COLOR[item.category]}`}
                          aria-hidden="true"
                        />
                        <span className="font-medium text-slate-800 truncate">{item.label}</span>
                        <span className="text-slate-400 tabular-nums">({item.count})</span>
                      </div>
                      <div className="flex items-center gap-3 font-mono tabular-nums shrink-0">
                        <span className="text-slate-500">{item.percentage}%</span>
                        <span className="font-medium text-slate-900 w-16 text-right">
                          {formatBytes(item.bytes)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Physical Disk Vault Location + Sync */}
              <div className="pt-4 border-t border-slate-200 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-700">Direktori Fisik di PC</span>
                  <button
                    type="button"
                    onClick={handleCopyPath}
                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
                  >
                    {copiedPath ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{copiedPath ? 'Tersalin' : 'Salin Path'}</span>
                  </button>
                </div>
                <p className="font-mono text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 break-all">
                  {storage ? `${storage.storageRootDisplay}/vault/${user.id}` : 'storage_data/vault'}
                </p>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Menambahkan file atau folder langsung lewat Explorer/Finder? Klik sinkronkan agar langsung terbaca di AwanKu.
                  </p>
                  <button
                    type="button"
                    disabled={syncing}
                    onClick={handleSync}
                    className="h-9 px-3.5 inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60 whitespace-nowrap shrink-0"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} aria-hidden="true" />
                    <span>{syncing ? 'Menyinkronkan...' : 'Sinkronkan Disk'}</span>
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-6">
              {/* Profile Form */}
              <form onSubmit={handleProfileSubmit} className="space-y-3.5">
                <h3 className="text-xs font-semibold text-slate-700">Informasi Profil</h3>
                {profileMsg && (
                  <div
                    role="status"
                    className={`rounded-lg px-3.5 py-2.5 text-xs border ${
                      profileMsg.type === 'ok'
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-red-50 border-red-200 text-red-700'
                    }`}
                  >
                    {profileMsg.text}
                  </div>
                )}

                <div>
                  <label htmlFor="profile-email" className="block text-xs font-medium text-slate-600 mb-1">
                    Email Akun
                  </label>
                  <input
                    id="profile-email"
                    type="email"
                    value={user.email}
                    disabled
                    className="w-full h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500"
                  />
                </div>

                <div>
                  <label htmlFor="profile-name" className="block text-xs font-medium text-slate-700 mb-1">
                    Nama Lengkap
                  </label>
                  <input
                    id="profile-name"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="h-9 px-4 rounded-lg bg-slate-900 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                  >
                    {savingProfile ? 'Menyimpan...' : 'Simpan Profil'}
                  </button>
                </div>
              </form>

              {/* Password Form */}
              <form onSubmit={handlePasswordSubmit} className="pt-5 border-t border-slate-200 space-y-3.5">
                <div className="flex items-center gap-1.5">
                  <KeyRound className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                  <h3 className="text-xs font-semibold text-slate-700">Ganti Kata Sandi</h3>
                </div>

                {passwordMsg && (
                  <div
                    role="status"
                    className={`rounded-lg px-3.5 py-2.5 text-xs border ${
                      passwordMsg.type === 'ok'
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-red-50 border-red-200 text-red-700'
                    }`}
                  >
                    {passwordMsg.text}
                  </div>
                )}

                <div>
                  <label htmlFor="cur-pass" className="block text-xs font-medium text-slate-700 mb-1">
                    Kata Sandi Saat Ini
                  </label>
                  <input
                    id="cur-pass"
                    type="password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="new-pass" className="block text-xs font-medium text-slate-700 mb-1">
                      Kata Sandi Baru
                    </label>
                    <input
                      id="new-pass"
                      type="password"
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Min. 6 karakter"
                      className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                    />
                  </div>
                  <div>
                    <label htmlFor="confirm-pass" className="block text-xs font-medium text-slate-700 mb-1">
                      Konfirmasi Kata Sandi
                    </label>
                    <input
                      id="confirm-pass"
                      type="password"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={savingPassword}
                    className="h-9 px-4 rounded-lg bg-blue-600 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {savingPassword ? 'Memperbarui...' : 'Perbarui Kata Sandi'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
