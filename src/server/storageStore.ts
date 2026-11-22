import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { FileItem, FolderItem, StorageDiskInfo, UserProfile } from '../types/cloud';
import {
  calculateUsageStats,
  canMoveFolder,
  getDescendantFolderIds,
  getFolderPathSegments,
  sanitizeEntryName,
  validateEntryName,
} from '../utils/cloudTree';

interface StoredUser extends UserProfile {
  passwordHash: string;
  passwordSalt: string;
}

interface StoredSession {
  token: string;
  userId: string;
  createdAt: string;
}

interface DatabaseState {
  users: StoredUser[];
  sessions: StoredSession[];
  folders: FolderItem[];
  files: FileItem[];
}

const DEFAULT_QUOTA_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB personal quota
const STORAGE_ROOT = path.resolve(process.cwd(), process.env.STORAGE_ROOT || 'storage_data');
const DB_FILE = path.join(STORAGE_ROOT, 'db.json');
const VAULT_ROOT = path.join(STORAGE_ROOT, 'vault');

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashPassword(password, salt), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function toPosix(relPath: string): string {
  return relPath.split(path.sep).join('/');
}

function assertInsideVault(userVault: string, targetPath: string): string {
  const resolvedVault = path.resolve(userVault);
  const resolvedTarget = path.resolve(targetPath);
  if (resolvedTarget !== resolvedVault && !resolvedTarget.startsWith(resolvedVault + path.sep)) {
    throw new Error('Akses path di luar direktori penyimpanan ditolak.');
  }
  return resolvedTarget;
}

function moveOnDiskSafe(srcPath: string, destPath: string): void {
  if (!fs.existsSync(srcPath) || srcPath === destPath) return;
  ensureDir(path.dirname(destPath));
  try {
    fs.renameSync(srcPath, destPath);
  } catch {
    fs.cpSync(srcPath, destPath, { recursive: true, force: true });
    fs.rmSync(srcPath, { recursive: true, force: true });
  }
}

export class LocalCloudStore {
  private state: DatabaseState;

  constructor() {
    ensureDir(STORAGE_ROOT);
    ensureDir(VAULT_ROOT);
    this.state = this.loadState();
    this.ensureDemoAccountSeeded();
  }

  private loadState(): DatabaseState {
    if (fs.existsSync(DB_FILE)) {
      try {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        const parsed = JSON.parse(raw) as Partial<DatabaseState>;
        return {
          users: Array.isArray(parsed.users) ? parsed.users : [],
          sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
          folders: Array.isArray(parsed.folders) ? parsed.folders : [],
          files: Array.isArray(parsed.files) ? parsed.files : [],
        };
      } catch {
        // Corrupted JSON fallback
      }
    }
    return { users: [], sessions: [], folders: [], files: [] };
  }

  private saveState(): void {
    ensureDir(STORAGE_ROOT);
    const tmpPath = `${DB_FILE}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(this.state, null, 2), 'utf8');
    fs.renameSync(tmpPath, DB_FILE);
  }

  public getUserVaultDir(userId: string): string {
    const dir = path.join(VAULT_ROOT, userId);
    ensureDir(dir);
    ensureDir(path.join(dir, '.trash'));
    return dir;
  }

  private getFolderDiskPath(userId: string, folderId: string | null): string {
    const vaultDir = this.getUserVaultDir(userId);
    if (!folderId) return vaultDir;
    const userFolders = this.state.folders.filter((f) => f.userId === userId);
    const segments = getFolderPathSegments(userFolders, folderId);
    return assertInsideVault(vaultDir, path.join(vaultDir, ...segments));
  }

  private getFileAbsolutePath(file: FileItem): string {
    const vaultDir = this.getUserVaultDir(file.userId);
    if (file.trashedAt) {
      return assertInsideVault(vaultDir, path.join(vaultDir, '.trash', `${file.id}_${file.name}`));
    }
    const folderDir = this.getFolderDiskPath(file.userId, file.folderId);
    return assertInsideVault(vaultDir, path.join(folderDir, file.name));
  }

  private recomputeRelativeDiskPath(file: FileItem): string {
    const userFolders = this.state.folders.filter((f) => f.userId === file.userId);
    const segments = getFolderPathSegments(userFolders, file.folderId);
    return toPosix(path.join(...segments, file.name));
  }

  private syncAllDescendantFilePaths(userId: string, folderId: string): void {
    const userFolders = this.state.folders.filter((f) => f.userId === userId);
    const affectedIds = new Set([folderId, ...getDescendantFolderIds(userFolders, folderId)]);
    for (const file of this.state.files) {
      if (file.userId === userId && file.folderId && affectedIds.has(file.folderId) && !file.trashedAt) {
        file.relativeDiskPath = this.recomputeRelativeDiskPath(file);
      }
    }
  }

  private toPublicUser(user: StoredUser): UserProfile {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
    };
  }

  private ensureDemoAccountSeeded(): void {
    const demoEmail = 'nadia@awanku.id';
    const existing = this.state.users.find((u) => u.email.toLowerCase() === demoEmail);
    if (existing) {
      // Ensure physical vault exists even if directory was cleaned
      this.getUserVaultDir(existing.id);
      return;
    }

    const now = new Date().toISOString();
    const userId = 'usr-nadia-demo';
    const salt = crypto.randomBytes(16).toString('hex');
    const demoUser: StoredUser = {
      id: userId,
      name: 'Nadia Kusuma',
      email: demoEmail,
      avatarUrl: '/src/assets/images/avatar_nadia_1795363492726.jpg',
      createdAt: now,
      passwordSalt: salt,
      passwordHash: hashPassword('awanku2026', salt),
    };
    this.state.users.push(demoUser);
    const vaultDir = this.getUserVaultDir(userId);

    const createSeedFolder = (id: string, name: string, parentId: string | null, color: string, offsetHours: number) => {
      const ts = new Date(Date.now() - offsetHours * 3600_000).toISOString();
      const folder: FolderItem = {
        id,
        userId,
        name,
        parentId,
        color,
        createdAt: ts,
        updatedAt: ts,
        trashedAt: null,
      };
      this.state.folders.push(folder);
      ensureDir(this.getFolderDiskPath(userId, id));
    };

    createSeedFolder('fld-dokumen', 'Dokumen Kerja', null, 'blue', 48);
    createSeedFolder('fld-laporan-q4', 'Laporan Q4', 'fld-dokumen', 'slate', 20);
    createSeedFolder('fld-foto', 'Foto & Media', null, 'emerald', 30);
    createSeedFolder('fld-desain', 'Proyek Desain', null, 'amber', 14);

    const createSeedTextFile = (
      id: string,
      name: string,
      folderId: string | null,
      mimeType: string,
      content: string,
      starred: boolean,
      offsetHours: number
    ) => {
      const ts = new Date(Date.now() - offsetHours * 3600_000).toISOString();
      const folderDir = this.getFolderDiskPath(userId, folderId);
      ensureDir(folderDir);
      const absPath = assertInsideVault(vaultDir, path.join(folderDir, name));
      fs.writeFileSync(absPath, content, 'utf8');
      const stat = fs.statSync(absPath);

      const file: FileItem = {
        id,
        userId,
        name,
        folderId,
        mimeType,
        size: stat.size,
        relativeDiskPath: '',
        starred,
        createdAt: ts,
        updatedAt: ts,
        trashedAt: null,
      };
      file.relativeDiskPath = this.recomputeRelativeDiskPath(file);
      this.state.files.push(file);
    };

    const createSeedImageFile = (
      id: string,
      name: string,
      folderId: string | null,
      sourceAssetRelPath: string,
      starred: boolean,
      offsetHours: number
    ) => {
      const sourcePath = path.resolve(process.cwd(), sourceAssetRelPath);
      if (!fs.existsSync(sourcePath)) return;
      const ts = new Date(Date.now() - offsetHours * 3600_000).toISOString();
      const folderDir = this.getFolderDiskPath(userId, folderId);
      ensureDir(folderDir);
      const absPath = assertInsideVault(vaultDir, path.join(folderDir, name));
      fs.copyFileSync(sourcePath, absPath);
      const stat = fs.statSync(absPath);

      const file: FileItem = {
        id,
        userId,
        name,
        folderId,
        mimeType: 'image/jpeg',
        size: stat.size,
        relativeDiskPath: '',
        starred,
        createdAt: ts,
        updatedAt: ts,
        trashedAt: null,
      };
      file.relativeDiskPath = this.recomputeRelativeDiskPath(file);
      this.state.files.push(file);
    };

    createSeedTextFile(
      'fil-panduan',
      'Panduan Penyimpanan AwanKu.md',
      null,
      'text/markdown',
      `# Selamat Datang di AwanKu\n\nSemua folder dan berkas di akun ini disimpan secara fisik di penyimpanan internal PC Anda.\n\n## Fitur Manajemen Folder\n- **Buat Folder Baru**: Klik tombol *Folder Baru* untuk menyusun direktori bertingkat.\n- **Ganti Nama Folder**: Ubah nama folder kapan saja; direktori fisik di disk otomatis diperbarui.\n- **Pindahkan File Antar Folder**: Gunakan tombol *Pindahkan* atau seret (drag & drop) file langsung ke folder tujuan.\n- **Sampah & Pemulihan**: Folder atau file yang dihapus masuk ke Sampah terlebih dahulu sebelum dihapus permanen.\n`,
      true,
      4
    );

    createSeedTextFile(
      'fil-tugas',
      'Daftar Tugas Mingguan.txt',
      null,
      'text/plain',
      `Agenda Mingguan — November 2026\n\n1. Finalisasi laporan kinerja Q4 bersama tim produk\n2. Rapikan aset foto perjalanan Bali ke folder Foto & Media\n3. Cadangkan berkas desain studio ke penyimpanan internal PC\n4. Evaluasi kapasitas disk bulanan\n`,
      false,
      8
    );

    createSeedTextFile(
      'fil-anggaran',
      'Anggaran Operasional 2026.csv',
      'fld-dokumen',
      'text/csv',
      `Kategori,Q1,Q2,Q3,Q4\nInfrastruktur Lokal,4500000,4500000,4750000,4750000\nPerangkat Lunak,3200000,3200000,3400000,3400000\nCadangan Penyimpanan,1800000,1800000,2100000,2100000\n`,
      false,
      26
    );

    createSeedTextFile(
      'fil-rapat',
      'Catatan Rapat Tim.md',
      'fld-dokumen',
      'text/markdown',
      `# Catatan Rapat Infrastruktur\n\n- Lokasi penyimpanan utama diarahkan ke storage internal PC.\n- Setiap pengguna memiliki direktori vault terisolasi.\n- Penamaan folder disinkronkan langsung dengan sistem berkas lokal.\n`,
      false,
      32
    );

    createSeedTextFile(
      'fil-ringkasan-q4',
      'Ringkasan Kinerja Q4.md',
      'fld-laporan-q4',
      'text/markdown',
      `# Ringkasan Kinerja Q4 2026\n\nSemua target sinkronisasi penyimpanan lokal berjalan stabil dengan latensi akses rata-rata di bawah 15 ms di jaringan lokal.\n`,
      true,
      12
    );

    createSeedTextFile(
      'fil-konfig',
      'konfigurasi-storage.json',
      'fld-laporan-q4',
      'application/json',
      JSON.stringify(
        {
          mode: 'local-internal-storage',
          backupSchedule: 'daily-02:00',
          maxUploadMB: 50,
          trashRetentionDays: 30,
        },
        null,
        2
      ),
      false,
      18
    );

    createSeedImageFile(
      'fil-bali',
      'Terasering Ubud Pagi.jpg',
      'fld-foto',
      'src/assets/images/sample_photo_bali_1795363492032.jpg',
      true,
      10
    );

    createSeedImageFile(
      'fil-studio',
      'Studio Arsitektur Kayu.jpg',
      'fld-desain',
      'src/assets/images/sample_photo_architecture_1795363492825.jpg',
      false,
      6
    );

    createSeedTextFile(
      'fil-sistem-desain',
      'Spesifikasi Sistem Desain.md',
      'fld-desain',
      'text/markdown',
      `# Sistem Desain AwanKu\n\n- Tipografi: Plus Jakarta Sans + DM Sans + JetBrains Mono\n- Warna Utama: Slate Ink (#0F172A) & Cobalt Ocean (#2563EB)\n- Prinsip: Permukaan bersih berbatas tipis 1px tanpa elemen dekoratif berlebih.\n`,
      false,
      15
    );

    this.saveState();
  }

  // ==================== AUTH ====================

  public register(name: string, email: string, password: string): { user: UserProfile; token: string } {
    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (cleanName.length < 2) {
      throw new Error('Nama lengkap minimal 2 karakter.');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      throw new Error('Format alamat email tidak valid.');
    }
    if (password.length < 6) {
      throw new Error('Kata sandi minimal 6 karakter.');
    }
    if (this.state.users.some((u) => u.email.toLowerCase() === cleanEmail)) {
      throw new Error('Alamat email sudah terdaftar. Silakan masuk.');
    }

    const id = `usr-${crypto.randomUUID().slice(0, 8)}`;
    const salt = crypto.randomBytes(16).toString('hex');
    const now = new Date().toISOString();

    const newUser: StoredUser = {
      id,
      name: cleanName,
      email: cleanEmail,
      avatarUrl: null,
      createdAt: now,
      passwordSalt: salt,
      passwordHash: hashPassword(password, salt),
    };

    this.state.users.push(newUser);
    this.getUserVaultDir(id);

    // Create default starter folder on disk for new user
    const starterFolderId = `fld-${crypto.randomUUID().slice(0, 8)}`;
    this.state.folders.push({
      id: starterFolderId,
      userId: id,
      name: 'Dokumen Pribadi',
      parentId: null,
      color: 'blue',
      createdAt: now,
      updatedAt: now,
      trashedAt: null,
    });
    ensureDir(this.getFolderDiskPath(id, starterFolderId));

    const token = crypto.randomBytes(32).toString('hex');
    this.state.sessions.push({ token, userId: id, createdAt: now });
    this.saveState();

    return { user: this.toPublicUser(newUser), token };
  }

  public login(email: string, password: string): { user: UserProfile; token: string } {
    const cleanEmail = email.trim().toLowerCase();
    const user = this.state.users.find((u) => u.email.toLowerCase() === cleanEmail);
    if (!user || !verifyPassword(password, user.passwordSalt, user.passwordHash)) {
      throw new Error('Email atau kata sandi tidak sesuai.');
    }

    const token = crypto.randomBytes(32).toString('hex');
    this.state.sessions.push({ token, userId: user.id, createdAt: new Date().toISOString() });
    this.saveState();

    return { user: this.toPublicUser(user), token };
  }

  public getUserByToken(token: string | undefined): UserProfile | null {
    if (!token) return null;
    const session = this.state.sessions.find((s) => s.token === token);
    if (!session) return null;
    const user = this.state.users.find((u) => u.id === session.userId);
    return user ? this.toPublicUser(user) : null;
  }

  public logout(token: string | undefined): void {
    if (!token) return;
    this.state.sessions = this.state.sessions.filter((s) => s.token !== token);
    this.saveState();
  }

  public updateProfile(userId: string, name: string): UserProfile {
    const cleanName = name.trim();
    if (cleanName.length < 2 || cleanName.length > 60) {
      throw new Error('Nama lengkap harus antara 2 hingga 60 karakter.');
    }
    const user = this.state.users.find((u) => u.id === userId);
    if (!user) throw new Error('Pengguna tidak ditemukan.');
    user.name = cleanName;
    this.saveState();
    return this.toPublicUser(user);
  }

  public changePassword(userId: string, currentPassword: string, newPassword: string): void {
    const user = this.state.users.find((u) => u.id === userId);
    if (!user) throw new Error('Pengguna tidak ditemukan.');
    if (!verifyPassword(currentPassword, user.passwordSalt, user.passwordHash)) {
      throw new Error('Kata sandi saat ini tidak sesuai.');
    }
    if (newPassword.length < 6) {
      throw new Error('Kata sandi baru minimal 6 karakter.');
    }
    const nextSalt = crypto.randomBytes(16).toString('hex');
    user.passwordSalt = nextSalt;
    user.passwordHash = hashPassword(newPassword, nextSalt);
    this.saveState();
  }

  // ==================== WORKSPACE READ ====================

  public getWorkspaceData(userId: string): {
    folders: FolderItem[];
    files: FileItem[];
    storage: StorageDiskInfo;
  } {
    const folders = this.state.folders.filter((f) => f.userId === userId);
    const files = this.state.files.filter((f) => f.userId === userId);
    const { activeBytes, trashBytes } = calculateUsageStats(files);

    let diskFreeBytes: number | null = null;
    let diskTotalBytes: number | null = null;
    try {
      const stats = fs.statfsSync(STORAGE_ROOT);
      diskFreeBytes = Number(stats.bavail) * Number(stats.bsize);
      diskTotalBytes = Number(stats.blocks) * Number(stats.bsize);
    } catch {
      // Optional statfs support
    }

    const vaultPath = this.getUserVaultDir(userId);
    const relVault = toPosix(path.relative(process.cwd(), vaultPath)) || vaultPath;

    const storage: StorageDiskInfo = {
      storageRootDisplay: STORAGE_ROOT,
      userVaultDisplay: relVault,
      usedBytes: activeBytes,
      trashBytes,
      quotaBytes: DEFAULT_QUOTA_BYTES,
      diskFreeBytes,
      diskTotalBytes,
      totalFiles: files.filter((f) => !f.trashedAt).length,
      totalFolders: folders.filter((f) => !f.trashedAt).length,
    };

    return { folders, files, storage };
  }

  private inferMimeFromExtension(fileName: string): string {
    const ext = path.extname(fileName).toLowerCase();
    const map: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.pdf': 'application/pdf',
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.csv': 'text/csv',
      '.json': 'application/json',
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'text/javascript',
      '.ts': 'text/typescript',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.zip': 'application/zip',
    };
    return map[ext] || 'application/octet-stream';
  }

  public syncUserDisk(userId: string): { addedFolders: number; addedFiles: number; updatedFiles: number; removedMissing: number } {
    const vaultDir = this.getUserVaultDir(userId);
    let addedFolders = 0;
    let addedFiles = 0;
    let updatedFiles = 0;
    let removedMissing = 0;

    // 1. Remove active metadata entries whose physical file no longer exists on disk
    const keptFiles: FileItem[] = [];
    for (const file of this.state.files) {
      if (file.userId !== userId || file.trashedAt) {
        keptFiles.push(file);
        continue;
      }
      const abs = this.getFileAbsolutePath(file);
      if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
        const stat = fs.statSync(abs);
        if (stat.size !== file.size) {
          file.size = stat.size;
          file.updatedAt = stat.mtime.toISOString();
          updatedFiles += 1;
        }
        keptFiles.push(file);
      } else {
        removedMissing += 1;
      }
    }
    this.state.files = keptFiles;

    // 2. Recursively walk physical vault directory to discover externally added folders & files
    const scanDir = (dirPath: string, parentFolderId: string | null) => {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue; // skip .trash and hidden files
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          let folder = this.state.folders.find(
            (f) =>
              f.userId === userId &&
              !f.trashedAt &&
              f.parentId === parentFolderId &&
              f.name.toLowerCase() === entry.name.toLowerCase()
          );
          if (!folder) {
            const stat = fs.statSync(fullPath);
            folder = {
              id: `fld-${crypto.randomUUID().slice(0, 8)}`,
              userId,
              name: entry.name,
              parentId: parentFolderId,
              color: 'slate',
              createdAt: stat.birthtime.toISOString(),
              updatedAt: stat.mtime.toISOString(),
              trashedAt: null,
            };
            this.state.folders.push(folder);
            addedFolders += 1;
          }
          scanDir(fullPath, folder.id);
        } else if (entry.isFile()) {
          const exists = this.state.files.some(
            (f) =>
              f.userId === userId &&
              !f.trashedAt &&
              f.folderId === parentFolderId &&
              f.name.toLowerCase() === entry.name.toLowerCase()
          );
          if (!exists) {
            const stat = fs.statSync(fullPath);
            const file: FileItem = {
              id: `fil-${crypto.randomUUID().slice(0, 8)}`,
              userId,
              name: entry.name,
              folderId: parentFolderId,
              mimeType: this.inferMimeFromExtension(entry.name),
              size: stat.size,
              relativeDiskPath: '',
              starred: false,
              createdAt: stat.birthtime.toISOString(),
              updatedAt: stat.mtime.toISOString(),
              trashedAt: null,
            };
            file.relativeDiskPath = this.recomputeRelativeDiskPath(file);
            this.state.files.push(file);
            addedFiles += 1;
          }
        }
      }
    };

    scanDir(vaultDir, null);
    this.saveState();
    return { addedFolders, addedFiles, updatedFiles, removedMissing };
  }

  // ==================== FOLDER OPERATIONS ====================

  public createFolder(userId: string, name: string, parentId: string | null, color = 'blue'): FolderItem {
    const userFolders = this.state.folders.filter((f) => f.userId === userId && !f.trashedAt);
    if (parentId !== null && !userFolders.some((f) => f.id === parentId)) {
      throw new Error('Folder induk tidak ditemukan.');
    }

    const siblingNames = userFolders.filter((f) => f.parentId === parentId).map((f) => f.name);
    const check = validateEntryName(name, siblingNames);
    if (!check.valid) {
      throw new Error(check.error || 'Nama folder tidak valid.');
    }

    const now = new Date().toISOString();
    const folder: FolderItem = {
      id: `fld-${crypto.randomUUID().slice(0, 8)}`,
      userId,
      name: check.sanitized,
      parentId,
      color,
      createdAt: now,
      updatedAt: now,
      trashedAt: null,
    };

    this.state.folders.push(folder);
    const diskDir = this.getFolderDiskPath(userId, folder.id);
    ensureDir(diskDir);
    this.saveState();
    return folder;
  }

  public renameFolder(userId: string, folderId: string, newName: string, color?: string): FolderItem {
    const folder = this.state.folders.find((f) => f.id === folderId && f.userId === userId && !f.trashedAt);
    if (!folder) {
      throw new Error('Folder tidak ditemukan.');
    }

    const siblingNames = this.state.folders
      .filter((f) => f.userId === userId && !f.trashedAt && f.parentId === folder.parentId && f.id !== folder.id)
      .map((f) => f.name);

    const check = validateEntryName(newName, siblingNames, folder.name);
    if (!check.valid) {
      throw new Error(check.error || 'Nama folder tidak valid.');
    }

    const oldDiskPath = this.getFolderDiskPath(userId, folder.id);
    folder.name = check.sanitized;
    if (color && ['blue', 'slate', 'emerald', 'amber', 'rose'].includes(color)) {
      folder.color = color;
    }
    folder.updatedAt = new Date().toISOString();
    const newDiskPath = this.getFolderDiskPath(userId, folder.id);

    if (fs.existsSync(oldDiskPath) && oldDiskPath !== newDiskPath) {
      moveOnDiskSafe(oldDiskPath, newDiskPath);
    } else {
      ensureDir(newDiskPath);
    }

    this.syncAllDescendantFilePaths(userId, folder.id);
    this.saveState();
    return folder;
  }

  public moveFolder(userId: string, folderId: string, targetParentId: string | null): FolderItem {
    const userFolders = this.state.folders.filter((f) => f.userId === userId);
    const folder = userFolders.find((f) => f.id === folderId && !f.trashedAt);
    if (!folder) {
      throw new Error('Folder tidak ditemukan.');
    }

    if (!canMoveFolder(userFolders, folderId, targetParentId)) {
      throw new Error('Tidak dapat memindahkan folder ke lokasi tersebut.');
    }

    const targetSiblings = userFolders
      .filter((f) => !f.trashedAt && f.parentId === targetParentId && f.id !== folder.id)
      .map((f) => f.name);
    const dupCheck = validateEntryName(folder.name, targetSiblings);
    if (!dupCheck.valid) {
      throw new Error(`Folder bernama "${folder.name}" sudah ada di folder tujuan.`);
    }

    const oldDiskPath = this.getFolderDiskPath(userId, folder.id);
    folder.parentId = targetParentId;
    folder.updatedAt = new Date().toISOString();
    const newDiskPath = this.getFolderDiskPath(userId, folder.id);

    if (fs.existsSync(oldDiskPath) && oldDiskPath !== newDiskPath) {
      moveOnDiskSafe(oldDiskPath, newDiskPath);
    } else {
      ensureDir(newDiskPath);
    }

    this.syncAllDescendantFilePaths(userId, folder.id);
    this.saveState();
    return folder;
  }

  public trashFolder(userId: string, folderId: string): { trashedFolderIds: string[]; trashedFileIds: string[] } {
    const userFolders = this.state.folders.filter((f) => f.userId === userId);
    const folder = userFolders.find((f) => f.id === folderId && !f.trashedAt);
    if (!folder) {
      throw new Error('Folder tidak ditemukan.');
    }

    const now = new Date().toISOString();
    const descendantIds = getDescendantFolderIds(userFolders, folderId);
    const affectedFolderIds = [folderId, ...descendantIds];
    const affectedSet = new Set(affectedFolderIds);

    // Move files inside this folder subtree into .trash on disk first
    const trashedFileIds: string[] = [];
    const vaultDir = this.getUserVaultDir(userId);
    for (const file of this.state.files) {
      if (file.userId === userId && !file.trashedAt && file.folderId && affectedSet.has(file.folderId)) {
        const currentAbs = this.getFileAbsolutePath(file);
        file.trashedAt = now;
        const trashAbs = assertInsideVault(vaultDir, path.join(vaultDir, '.trash', `${file.id}_${file.name}`));
        moveOnDiskSafe(currentAbs, trashAbs);
        trashedFileIds.push(file.id);
      }
    }

    const folderDiskPath = this.getFolderDiskPath(userId, folderId);
    for (const f of this.state.folders) {
      if (f.userId === userId && affectedSet.has(f.id) && !f.trashedAt) {
        f.trashedAt = now;
      }
    }

    // Remove the empty folder directory on disk (will be recreated upon restore)
    if (fs.existsSync(folderDiskPath) && folderDiskPath !== vaultDir) {
      fs.rmSync(folderDiskPath, { recursive: true, force: true });
    }

    this.saveState();
    return { trashedFolderIds: affectedFolderIds, trashedFileIds };
  }

  public restoreFolder(userId: string, folderId: string): FolderItem {
    const userFolders = this.state.folders.filter((f) => f.userId === userId);
    const folder = userFolders.find((f) => f.id === folderId && f.trashedAt);
    if (!folder) {
      throw new Error('Folder di sampah tidak ditemukan.');
    }

    // If parent is still trashed or deleted, restore to root
    if (folder.parentId) {
      const parent = userFolders.find((f) => f.id === folder.parentId && !f.trashedAt);
      if (!parent) {
        folder.parentId = null;
      }
    }

    // Ensure unique name at destination
    const activeSiblings = userFolders
      .filter((f) => !f.trashedAt && f.parentId === folder.parentId && f.id !== folder.id)
      .map((f) => f.name);
    if (!validateEntryName(folder.name, activeSiblings).valid) {
      folder.name = `${folder.name} (Dipulihkan)`;
    }

    const descendantIds = getDescendantFolderIds(userFolders, folderId);
    const affectedSet = new Set([folderId, ...descendantIds]);

    for (const f of this.state.folders) {
      if (f.userId === userId && affectedSet.has(f.id)) {
        f.trashedAt = null;
        f.updatedAt = new Date().toISOString();
      }
    }

    // Recreate directories on disk
    for (const id of [folderId, ...descendantIds]) {
      ensureDir(this.getFolderDiskPath(userId, id));
    }

    // Restore files belonging to this folder subtree from .trash
    const vaultDir = this.getUserVaultDir(userId);
    for (const file of this.state.files) {
      if (file.userId === userId && file.trashedAt && file.folderId && affectedSet.has(file.folderId)) {
        const trashAbs = assertInsideVault(vaultDir, path.join(vaultDir, '.trash', `${file.id}_${file.name}`));
        file.trashedAt = null;
        file.updatedAt = new Date().toISOString();
        const destAbs = this.getFileAbsolutePath(file);
        moveOnDiskSafe(trashAbs, destAbs);
        file.relativeDiskPath = this.recomputeRelativeDiskPath(file);
      }
    }

    this.saveState();
    return folder;
  }

  public deleteFolderPermanently(userId: string, folderId: string): void {
    const userFolders = this.state.folders.filter((f) => f.userId === userId);
    const folder = userFolders.find((f) => f.id === folderId);
    if (!folder) {
      throw new Error('Folder tidak ditemukan.');
    }

    const affectedSet = new Set([folderId, ...getDescendantFolderIds(userFolders, folderId)]);
    const vaultDir = this.getUserVaultDir(userId);

    // Delete physical files in vault or .trash
    for (const file of this.state.files) {
      if (file.userId === userId && file.folderId && affectedSet.has(file.folderId)) {
        const absPath = this.getFileAbsolutePath(file);
        if (fs.existsSync(absPath)) {
          fs.rmSync(absPath, { force: true });
        }
        const trashPath = assertInsideVault(vaultDir, path.join(vaultDir, '.trash', `${file.id}_${file.name}`));
        if (fs.existsSync(trashPath)) {
          fs.rmSync(trashPath, { force: true });
        }
      }
    }

    if (!folder.trashedAt) {
      const dirPath = this.getFolderDiskPath(userId, folderId);
      if (fs.existsSync(dirPath) && dirPath !== vaultDir) {
        fs.rmSync(dirPath, { recursive: true, force: true });
      }
    }

    this.state.files = this.state.files.filter(
      (f) => !(f.userId === userId && f.folderId && affectedSet.has(f.folderId))
    );
    this.state.folders = this.state.folders.filter((f) => !(f.userId === userId && affectedSet.has(f.id)));
    this.saveState();
  }

  // ==================== FILE OPERATIONS ====================

  private resolveUniqueFileName(userId: string, folderId: string | null, desiredName: string): string {
    const clean = sanitizeEntryName(desiredName) || 'berkas-tanpa-nama';
    const existingNames = new Set(
      this.state.files
        .filter((f) => f.userId === userId && !f.trashedAt && f.folderId === folderId)
        .map((f) => f.name.toLowerCase())
    );
    if (!existingNames.has(clean.toLowerCase())) return clean;

    const ext = path.extname(clean);
    const base = ext ? clean.slice(0, -ext.length) : clean;
    let counter = 2;
    while (existingNames.has(`${base} (${counter})${ext}`.toLowerCase())) {
      counter += 1;
    }
    return `${base} (${counter})${ext}`;
  }

  public saveUploadedFile(
    userId: string,
    folderId: string | null,
    originalName: string,
    mimeType: string,
    buffer: Buffer
  ): FileItem {
    if (folderId !== null) {
      const folder = this.state.folders.find((f) => f.id === folderId && f.userId === userId && !f.trashedAt);
      if (!folder) throw new Error('Folder tujuan tidak ditemukan.');
    }

    const uniqueName = this.resolveUniqueFileName(userId, folderId, originalName);
    const folderDir = this.getFolderDiskPath(userId, folderId);
    ensureDir(folderDir);
    const vaultDir = this.getUserVaultDir(userId);
    const destAbs = assertInsideVault(vaultDir, path.join(folderDir, uniqueName));
    fs.writeFileSync(destAbs, buffer);

    const now = new Date().toISOString();
    const file: FileItem = {
      id: `fil-${crypto.randomUUID().slice(0, 8)}`,
      userId,
      name: uniqueName,
      folderId,
      mimeType: mimeType || 'application/octet-stream',
      size: buffer.length,
      relativeDiskPath: '',
      starred: false,
      createdAt: now,
      updatedAt: now,
      trashedAt: null,
    };
    file.relativeDiskPath = this.recomputeRelativeDiskPath(file);
    this.state.files.push(file);
    this.saveState();
    return file;
  }

  public updateFileContent(userId: string, fileId: string, content: string): FileItem {
    const file = this.state.files.find((f) => f.id === fileId && f.userId === userId && !f.trashedAt);
    if (!file) throw new Error('File tidak ditemukan.');
    const absPath = this.getFileAbsolutePath(file);
    ensureDir(path.dirname(absPath));
    const buffer = Buffer.from(content, 'utf8');
    fs.writeFileSync(absPath, buffer);
    file.size = buffer.length;
    file.updatedAt = new Date().toISOString();
    this.saveState();
    return file;
  }

  public duplicateFile(userId: string, fileId: string): FileItem {
    const original = this.state.files.find((f) => f.id === fileId && f.userId === userId && !f.trashedAt);
    if (!original) throw new Error('File tidak ditemukan.');
    const srcAbs = this.getFileAbsolutePath(original);
    if (!fs.existsSync(srcAbs)) throw new Error('Berkas fisik tidak ditemukan di disk.');

    const uniqueName = this.resolveUniqueFileName(userId, original.folderId, original.name);
    const folderDir = this.getFolderDiskPath(userId, original.folderId);
    const vaultDir = this.getUserVaultDir(userId);
    const destAbs = assertInsideVault(vaultDir, path.join(folderDir, uniqueName));
    fs.copyFileSync(srcAbs, destAbs);
    const stat = fs.statSync(destAbs);

    const now = new Date().toISOString();
    const copy: FileItem = {
      id: `fil-${crypto.randomUUID().slice(0, 8)}`,
      userId,
      name: uniqueName,
      folderId: original.folderId,
      mimeType: original.mimeType,
      size: stat.size,
      relativeDiskPath: '',
      starred: false,
      createdAt: now,
      updatedAt: now,
      trashedAt: null,
    };
    copy.relativeDiskPath = this.recomputeRelativeDiskPath(copy);
    this.state.files.push(copy);
    this.saveState();
    return copy;
  }

  public renameFile(userId: string, fileId: string, newName: string): FileItem {
    const file = this.state.files.find((f) => f.id === fileId && f.userId === userId && !f.trashedAt);
    if (!file) throw new Error('File tidak ditemukan.');

    const siblings = this.state.files
      .filter((f) => f.userId === userId && !f.trashedAt && f.folderId === file.folderId && f.id !== file.id)
      .map((f) => f.name);

    const check = validateEntryName(newName, siblings, file.name);
    if (!check.valid) throw new Error(check.error || 'Nama file tidak valid.');

    const oldAbs = this.getFileAbsolutePath(file);
    file.name = check.sanitized;
    file.updatedAt = new Date().toISOString();
    const newAbs = this.getFileAbsolutePath(file);
    moveOnDiskSafe(oldAbs, newAbs);
    file.relativeDiskPath = this.recomputeRelativeDiskPath(file);

    this.saveState();
    return file;
  }

  public moveFiles(userId: string, fileIds: string[], targetFolderId: string | null): FileItem[] {
    if (targetFolderId !== null) {
      const target = this.state.folders.find(
        (f) => f.id === targetFolderId && f.userId === userId && !f.trashedAt
      );
      if (!target) throw new Error('Folder tujuan tidak ditemukan.');
    }

    const moved: FileItem[] = [];
    for (const fileId of fileIds) {
      const file = this.state.files.find((f) => f.id === fileId && f.userId === userId && !f.trashedAt);
      if (!file || file.folderId === targetFolderId) continue;

      const oldAbs = this.getFileAbsolutePath(file);
      const uniqueName = this.resolveUniqueFileName(userId, targetFolderId, file.name);
      file.folderId = targetFolderId;
      file.name = uniqueName;
      file.updatedAt = new Date().toISOString();
      const newAbs = this.getFileAbsolutePath(file);

      moveOnDiskSafe(oldAbs, newAbs);
      file.relativeDiskPath = this.recomputeRelativeDiskPath(file);
      moved.push(file);
    }

    this.saveState();
    return moved;
  }

  public toggleStarFile(userId: string, fileId: string): FileItem {
    const file = this.state.files.find((f) => f.id === fileId && f.userId === userId && !f.trashedAt);
    if (!file) throw new Error('File tidak ditemukan.');
    file.starred = !file.starred;
    this.saveState();
    return file;
  }

  public trashFiles(userId: string, fileIds: string[]): void {
    const now = new Date().toISOString();
    const vaultDir = this.getUserVaultDir(userId);
    for (const fileId of fileIds) {
      const file = this.state.files.find((f) => f.id === fileId && f.userId === userId && !f.trashedAt);
      if (!file) continue;
      const oldAbs = this.getFileAbsolutePath(file);
      file.trashedAt = now;
      const trashAbs = assertInsideVault(vaultDir, path.join(vaultDir, '.trash', `${file.id}_${file.name}`));
      moveOnDiskSafe(oldAbs, trashAbs);
    }
    this.saveState();
  }

  public restoreFile(userId: string, fileId: string): FileItem {
    const file = this.state.files.find((f) => f.id === fileId && f.userId === userId && f.trashedAt);
    if (!file) throw new Error('File di sampah tidak ditemukan.');

    // If original folder is gone or still trashed, restore to root
    if (file.folderId) {
      const parent = this.state.folders.find(
        (f) => f.id === file.folderId && f.userId === userId && !f.trashedAt
      );
      if (!parent) {
        file.folderId = null;
      }
    }

    const vaultDir = this.getUserVaultDir(userId);
    const trashAbs = assertInsideVault(vaultDir, path.join(vaultDir, '.trash', `${file.id}_${file.name}`));
    const uniqueName = this.resolveUniqueFileName(userId, file.folderId, file.name);

    file.name = uniqueName;
    file.trashedAt = null;
    file.updatedAt = new Date().toISOString();

    const destAbs = this.getFileAbsolutePath(file);
    moveOnDiskSafe(trashAbs, destAbs);
    file.relativeDiskPath = this.recomputeRelativeDiskPath(file);

    this.saveState();
    return file;
  }

  public deleteFilePermanently(userId: string, fileId: string): void {
    const idx = this.state.files.findIndex((f) => f.id === fileId && f.userId === userId);
    if (idx === -1) throw new Error('File tidak ditemukan.');
    const file = this.state.files[idx];
    const absPath = this.getFileAbsolutePath(file);
    if (fs.existsSync(absPath)) {
      fs.rmSync(absPath, { force: true });
    }
    this.state.files.splice(idx, 1);
    this.saveState();
  }

  public emptyTrash(userId: string): void {
    const trashedFiles = this.state.files.filter((f) => f.userId === userId && f.trashedAt);
    for (const file of trashedFiles) {
      const absPath = this.getFileAbsolutePath(file);
      if (fs.existsSync(absPath)) {
        fs.rmSync(absPath, { force: true });
      }
    }
    this.state.files = this.state.files.filter((f) => !(f.userId === userId && f.trashedAt));
    this.state.folders = this.state.folders.filter((f) => !(f.userId === userId && f.trashedAt));
    this.saveState();
  }

  public getFileForContent(userId: string, fileId: string): { file: FileItem; absPath: string } {
    const file = this.state.files.find((f) => f.id === fileId && f.userId === userId);
    if (!file) throw new Error('File tidak ditemukan.');
    const absPath = this.getFileAbsolutePath(file);
    if (!fs.existsSync(absPath)) {
      throw new Error('Berkas fisik tidak ditemukan di penyimpanan internal.');
    }
    return { file, absPath };
  }
}

export const cloudStore = new LocalCloudStore();
