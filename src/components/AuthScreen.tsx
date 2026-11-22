import React, { useState } from 'react';
import { Cloud, Eye, EyeOff, FolderTree, HardDrive, Lock, ArrowRight } from 'lucide-react';
import { cloudApi } from '../services/api';
import type { UserProfile } from '../types/cloud';

interface AuthScreenProps {
  onAuthenticated: (user: UserProfile) => void;
}

const EDITORIAL_VAULT_IMAGE = '/src/assets/images/login_editorial_vault_1795363492357.jpg';

export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'register' && name.trim().length < 2) {
      setError('Masukkan nama lengkap minimal 2 karakter.');
      return;
    }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Masukkan alamat email yang valid.');
      return;
    }
    if (password.length < 6) {
      setError('Kata sandi harus terdiri dari minimal 6 karakter.');
      return;
    }

    setSubmitting(true);
    try {
      const result =
        mode === 'login'
          ? await cloudApi.login(email.trim(), password)
          : await cloudApi.register(name.trim(), email.trim(), password);
      onAuthenticated(result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memproses autentikasi.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemoLogin = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const result = await cloudApi.login('nadia@awanku.id', 'awanku2026');
      onAuthenticated(result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal masuk ke akun demo.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen lg:h-screen lg:overflow-hidden bg-slate-50 grid grid-cols-1 lg:grid-cols-12 items-stretch">
      {/* Left Auth Column */}
      <div className="lg:col-span-6 xl:col-span-5 flex flex-col justify-between bg-white px-6 py-6 sm:px-12 lg:px-14 border-r border-slate-200 overflow-y-auto">
        {/* Top Wordmark */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-slate-900">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white">
              <Cloud className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="font-display text-xl font-bold tracking-tight whitespace-nowrap">
              AwanKu
            </span>
          </div>
          <span className="text-xs text-slate-500 whitespace-nowrap">
            Storage Internal PC
          </span>
        </header>

        {/* Auth Form Core */}
        <main className="my-auto py-8 max-w-md w-full mx-auto">
          <div className="mb-7">
            <h1 className="font-display text-3xl sm:text-[2rem] font-bold tracking-tight text-slate-900 text-balance leading-tight">
              {mode === 'login'
                ? 'Masuk ke ruang penyimpanan pribadi Anda'
                : 'Buat akun cloud pribadi baru'}
            </h1>
            <p className="mt-2.5 text-sm text-slate-600 leading-relaxed">
              {mode === 'login'
                ? 'Kelola dokumen, foto, dan struktur folder bertingkat yang tersimpan langsung di disk internal PC.'
                : 'Setiap akun mendapatkan direktori pribadi terisolasi dengan akses login terlindungi.'}
            </p>
          </div>

          {/* Mode Segmented Control */}
          <div
            className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg mb-5"
            role="tablist"
            aria-label="Pilih mode autentikasi"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`py-2 px-4 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                mode === 'login'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Masuk
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              onClick={() => {
                setMode('register');
                setError(null);
              }}
              className={`py-2 px-4 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                mode === 'register'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Daftar Akun
            </button>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {mode === 'register' && (
              <div>
                <label htmlFor="auth-name" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Nama Lengkap
                </label>
                <input
                  id="auth-name"
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Contoh: Nadia Kusuma"
                  className="w-full h-11 rounded-lg border border-slate-300 bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 transition-colors"
                />
              </div>
            )}

            <div>
              <label htmlFor="auth-email" className="block text-sm font-medium text-slate-700 mb-1.5">
                Alamat Email
              </label>
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@domain.id"
                className="w-full h-11 rounded-lg border border-slate-300 bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 transition-colors"
              />
            </div>

            <div>
              <label htmlFor="auth-password" className="block text-sm font-medium text-slate-700 mb-1.5">
                Kata Sandi
              </label>
              <div className="relative">
                <input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimal 6 karakter"
                  className="w-full h-11 rounded-lg border border-slate-300 bg-white pl-3.5 pr-11 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full h-11 mt-1 inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:opacity-60 transition-colors whitespace-nowrap"
            >
              <span>
                {submitting
                  ? 'Memproses...'
                  : mode === 'login'
                    ? 'Masuk ke Penyimpanan'
                    : 'Buat Akun & Masuk'}
              </span>
              {!submitting && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
            </button>
          </form>

          {/* Demo Access Divider */}
          <div className="mt-6 pt-5 border-t border-slate-200">
            <div className="flex items-center justify-between gap-4 mb-2.5">
              <span className="text-xs font-medium text-slate-500">
                Ingin langsung mencoba ruang kerja terisi?
              </span>
            </div>
            <button
              type="button"
              disabled={submitting}
              onClick={handleDemoLogin}
              className="w-full h-10 inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-4 text-sm font-medium text-slate-800 hover:bg-slate-100 hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-60 transition-colors whitespace-nowrap"
            >
              Masuk dengan Akun Demo (nadia@awanku.id)
            </button>
          </div>
        </main>

        {/* Quiet Footer */}
        <footer className="text-xs text-slate-500 flex items-center justify-between gap-4 pt-4 border-t border-slate-100">
          <span>AwanKu Personal Cloud</span>
          <span>Data tersimpan lokal di perangkat Anda</span>
        </footer>
      </div>

      {/* Right Editorial Showcase Column */}
      <aside className="hidden lg:block lg:col-span-6 xl:col-span-7 relative h-full overflow-hidden bg-slate-900">
        {!imageFailed ? (
          <img
            src={EDITORIAL_VAULT_IMAGE}
            alt="Ruang arsitektur kaca dan batu kapur modern yang tenang mencerminkan penyimpanan cloud pribadi"
            referrerPolicy="no-referrer"
            onError={() => setImageFailed(true)}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 h-full w-full bg-gradient-to-br from-slate-800 via-slate-900 to-blue-950" />
        )}

        {/* Measured Contrast Scrim */}
        <div
          className="absolute inset-0 bg-gradient-to-t from-slate-950/92 via-slate-950/45 to-slate-950/10"
          aria-hidden="true"
        />

        <div className="absolute inset-x-0 bottom-0 p-10 xl:p-14 text-white">
          <p className="text-sm font-medium text-blue-200 tracking-wide mb-2.5">
            Kendali Penuh Atas Data Anda
          </p>
          <h2 className="font-display text-3xl xl:text-[2.1rem] font-semibold tracking-tight leading-snug max-w-xl text-balance">
            Penyimpanan cloud pribadi langsung di storage internal PC, tanpa ketergantungan pihak ketiga.
          </h2>

          <div className="mt-7 pt-7 border-t border-white/15 grid grid-cols-3 gap-6 max-w-2xl">
            <div>
              <HardDrive className="h-5 w-5 text-blue-300 mb-2" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-white">Disk Internal PC</h3>
              <p className="mt-1 text-xs text-slate-200 leading-relaxed">
                Folder dan berkas tersinkron langsung di sistem direktori lokal.
              </p>
            </div>
            <div>
              <FolderTree className="h-5 w-5 text-blue-300 mb-2" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-white">Struktur Bertingkat</h3>
              <p className="mt-1 text-xs text-slate-200 leading-relaxed">
                Buat, ganti nama, hapus folder, dan pindahkan file dengan cepat.
              </p>
            </div>
            <div>
              <Lock className="h-5 w-5 text-blue-300 mb-2" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-white">Akses Terproteksi</h3>
              <p className="mt-1 text-xs text-slate-200 leading-relaxed">
                Login terenkripsi dengan isolasi ruang berkas per akun pengguna.
              </p>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
