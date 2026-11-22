import type {
  BreadcrumbItem,
  FileCategory,
  FileItem,
  FolderItem,
  FolderTreeNode,
  SortKey,
} from '../types/cloud';

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exponent);
  if (exponent === 0) return `${Math.round(value)} B`;
  return `${value.toFixed(value >= 100 ? 0 : 1).replace('.', ',')} ${units[exponent]}`;
}

export function formatShortDate(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function getFileCategory(mimeType: string, fileName: string): Exclude<FileCategory, 'all'> {
  const lowerMime = (mimeType || '').toLowerCase();
  const ext = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() ?? '' : '';

  if (lowerMime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'avif'].includes(ext)) {
    return 'image';
  }
  if (
    lowerMime.startsWith('video/') ||
    lowerMime.startsWith('audio/') ||
    ['mp4', 'mov', 'webm', 'mkv', 'mp3', 'wav', 'flac', 'ogg'].includes(ext)
  ) {
    return 'media';
  }
  if (
    lowerMime.includes('zip') ||
    lowerMime.includes('tar') ||
    lowerMime.includes('rar') ||
    lowerMime.includes('7z') ||
    ['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)
  ) {
    return 'archive';
  }
  if (
    lowerMime.includes('pdf') ||
    lowerMime.startsWith('text/') ||
    lowerMime.includes('json') ||
    lowerMime.includes('word') ||
    lowerMime.includes('sheet') ||
    lowerMime.includes('excel') ||
    lowerMime.includes('presentation') ||
    ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'csv', 'json', 'ts', 'tsx', 'js', 'html', 'css'].includes(ext)
  ) {
    return 'document';
  }
  return 'other';
}

export function isTextPreviewable(mimeType: string, fileName: string): boolean {
  const lowerMime = (mimeType || '').toLowerCase();
  const ext = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() ?? '' : '';
  return (
    lowerMime.startsWith('text/') ||
    lowerMime === 'application/json' ||
    ['txt', 'md', 'json', 'csv', 'js', 'ts', 'tsx', 'jsx', 'css', 'html', 'xml', 'yml', 'yaml', 'log'].includes(ext)
  );
}

export function sanitizeEntryName(rawName: string): string {
  return rawName
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function validateEntryName(
  rawName: string,
  siblingNames: string[],
  ignoreName?: string
): { valid: boolean; sanitized: string; error?: string } {
  const sanitized = sanitizeEntryName(rawName);
  if (!sanitized) {
    return { valid: false, sanitized: '', error: 'Nama tidak boleh kosong.' };
  }
  if (sanitized === '.' || sanitized === '..') {
    return { valid: false, sanitized, error: 'Nama tidak valid untuk sistem file.' };
  }
  if (sanitized.length > 80) {
    return { valid: false, sanitized, error: 'Nama maksimal 80 karakter.' };
  }
  const normalizedTarget = sanitized.toLowerCase();
  const normalizedIgnore = ignoreName?.trim().toLowerCase();
  const duplicate = siblingNames.some((sibling) => {
    const lower = sibling.trim().toLowerCase();
    return lower === normalizedTarget && lower !== normalizedIgnore;
  });
  if (duplicate) {
    return { valid: false, sanitized, error: 'Nama yang sama sudah ada di folder ini.' };
  }
  return { valid: true, sanitized };
}

export function buildBreadcrumbs(folders: FolderItem[], currentFolderId: string | null): BreadcrumbItem[] {
  const root: BreadcrumbItem = { id: null, name: 'Penyimpanan Saya' };
  if (!currentFolderId) return [root];

  const byId = new Map<string, FolderItem>();
  for (const folder of folders) {
    byId.set(folder.id, folder);
  }

  const chain: BreadcrumbItem[] = [];
  const visited = new Set<string>();
  let cursor: string | null = currentFolderId;

  while (cursor && !visited.has(cursor)) {
    visited.add(cursor);
    const folder = byId.get(cursor);
    if (!folder) break;
    chain.unshift({ id: folder.id, name: folder.name });
    cursor = folder.parentId;
  }

  return [root, ...chain];
}

export function buildFolderTree(folders: FolderItem[]): FolderTreeNode[] {
  const active = folders.filter((f) => !f.trashedAt);
  const childrenByParent = new Map<string | null, FolderItem[]>();

  for (const folder of active) {
    const key = folder.parentId ?? null;
    const list = childrenByParent.get(key) ?? [];
    list.push(folder);
    childrenByParent.set(key, list);
  }

  for (const list of childrenByParent.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name, 'id'));
  }

  const buildNodes = (parentId: string | null, depth: number, visited: Set<string>): FolderTreeNode[] => {
    const items = childrenByParent.get(parentId) ?? [];
    return items
      .filter((f) => !visited.has(f.id))
      .map((folder) => {
        const nextVisited = new Set(visited);
        nextVisited.add(folder.id);
        return {
          folder,
          depth,
          children: buildNodes(folder.id, depth + 1, nextVisited),
        };
      });
  };

  return buildNodes(null, 0, new Set());
}

export function getDescendantFolderIds(folders: FolderItem[], rootFolderId: string): string[] {
  const childrenByParent = new Map<string, string[]>();
  for (const folder of folders) {
    if (folder.parentId) {
      const list = childrenByParent.get(folder.parentId) ?? [];
      list.push(folder.id);
      childrenByParent.set(folder.parentId, list);
    }
  }

  const result: string[] = [];
  const queue: string[] = [rootFolderId];
  const visited = new Set<string>([rootFolderId]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const children = childrenByParent.get(current) ?? [];
    for (const childId of children) {
      if (!visited.has(childId)) {
        visited.add(childId);
        result.push(childId);
        queue.push(childId);
      }
    }
  }

  return result;
}

export function canMoveFolder(
  folders: FolderItem[],
  sourceFolderId: string,
  targetParentId: string | null
): boolean {
  const source = folders.find((f) => f.id === sourceFolderId);
  if (!source) return false;
  if (source.parentId === targetParentId) return false;
  if (targetParentId === sourceFolderId) return false;
  if (targetParentId === null) return true;

  const target = folders.find((f) => f.id === targetParentId && !f.trashedAt);
  if (!target) return false;

  const descendants = new Set(getDescendantFolderIds(folders, sourceFolderId));
  return !descendants.has(targetParentId);
}

export function getFolderPathSegments(folders: FolderItem[], folderId: string | null): string[] {
  if (!folderId) return [];
  const crumbs = buildBreadcrumbs(folders, folderId);
  return crumbs.slice(1).map((c) => c.name);
}

export function countFolderContents(
  folders: FolderItem[],
  files: FileItem[],
  folderId: string
): { subfolderCount: number; fileCount: number } {
  const descendantIds = new Set([folderId, ...getDescendantFolderIds(folders, folderId)]);
  const subfolderCount = folders.filter((f) => !f.trashedAt && f.id !== folderId && descendantIds.has(f.id)).length;
  const fileCount = files.filter((f) => !f.trashedAt && f.folderId !== null && descendantIds.has(f.folderId)).length;
  return { subfolderCount, fileCount };
}

export function filterAndSortWorkspaceItems(params: {
  folders: FolderItem[];
  files: FileItem[];
  searchQuery: string;
  category: FileCategory;
  sortKey: SortKey;
}): { folders: FolderItem[]; files: FileItem[] } {
  const query = params.searchQuery.trim().toLowerCase();

  let filteredFolders = params.folders.filter((folder) => {
    if (params.category !== 'all') return false;
    if (!query) return true;
    return folder.name.toLowerCase().includes(query);
  });

  let filteredFiles = params.files.filter((file) => {
    if (params.category !== 'all' && getFileCategory(file.mimeType, file.name) !== params.category) {
      return false;
    }
    if (!query) return true;
    return file.name.toLowerCase().includes(query);
  });

  const compareName = (a: string, b: string) => a.localeCompare(b, 'id', { sensitivity: 'base' });

  filteredFolders = [...filteredFolders].sort((a, b) => {
    if (params.sortKey === 'name_asc') return compareName(a.name, b.name);
    if (params.sortKey === 'name_desc') return compareName(b.name, a.name);
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  filteredFiles = [...filteredFiles].sort((a, b) => {
    if (params.sortKey === 'name_asc') return compareName(a.name, b.name);
    if (params.sortKey === 'name_desc') return compareName(b.name, a.name);
    if (params.sortKey === 'size_desc') return b.size - a.size;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  return { folders: filteredFolders, files: filteredFiles };
}

export function calculateUsageStats(files: FileItem[]): { activeBytes: number; trashBytes: number } {
  let activeBytes = 0;
  let trashBytes = 0;
  for (const file of files) {
    if (file.trashedAt) {
      trashBytes += file.size;
    } else {
      activeBytes += file.size;
    }
  }
  return { activeBytes, trashBytes };
}

export interface CategoryBreakdownItem {
  category: Exclude<FileCategory, 'all'>;
  label: string;
  bytes: number;
  count: number;
  percentage: number;
}

const CATEGORY_LABELS: Record<Exclude<FileCategory, 'all'>, string> = {
  document: 'Dokumen & Teks',
  image: 'Gambar & Foto',
  media: 'Video & Audio',
  archive: 'Arsip Terkompresi',
  other: 'Lainnya',
};

export function calculateCategoryBreakdown(files: FileItem[]): CategoryBreakdownItem[] {
  const active = files.filter((f) => !f.trashedAt);
  const totalBytes = active.reduce((sum, f) => sum + f.size, 0);

  const buckets = new Map<Exclude<FileCategory, 'all'>, { bytes: number; count: number }>([
    ['document', { bytes: 0, count: 0 }],
    ['image', { bytes: 0, count: 0 }],
    ['media', { bytes: 0, count: 0 }],
    ['archive', { bytes: 0, count: 0 }],
    ['other', { bytes: 0, count: 0 }],
  ]);

  for (const file of active) {
    const cat = getFileCategory(file.mimeType, file.name);
    const entry = buckets.get(cat)!;
    entry.bytes += file.size;
    entry.count += 1;
  }

  return Array.from(buckets.entries())
    .map(([category, info]) => ({
      category,
      label: CATEGORY_LABELS[category],
      bytes: info.bytes,
      count: info.count,
      percentage: totalBytes > 0 ? Math.round((info.bytes / totalBytes) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.bytes - a.bytes);
}

export function formatFolderSummary(subfolderCount: number, fileCount: number): string {
  const parts: string[] = [];
  if (subfolderCount > 0) parts.push(`${subfolderCount} folder`);
  if (fileCount > 0) parts.push(`${fileCount} file`);
  if (parts.length === 0) return 'Kosong';
  return parts.join(' · ');
}
