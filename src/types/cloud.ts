export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  createdAt: string;
}

export interface FolderItem {
  id: string;
  userId: string;
  name: string;
  parentId: string | null;
  color: string;
  createdAt: string;
  updatedAt: string;
  trashedAt: string | null;
}

export interface FileItem {
  id: string;
  userId: string;
  name: string;
  folderId: string | null;
  mimeType: string;
  size: number;
  relativeDiskPath: string;
  starred: boolean;
  createdAt: string;
  updatedAt: string;
  trashedAt: string | null;
}

export interface StorageDiskInfo {
  storageRootDisplay: string;
  userVaultDisplay: string;
  usedBytes: number;
  trashBytes: number;
  quotaBytes: number;
  diskFreeBytes: number | null;
  diskTotalBytes: number | null;
  totalFiles: number;
  totalFolders: number;
}

export interface BreadcrumbItem {
  id: string | null;
  name: string;
}

export interface FolderTreeNode {
  folder: FolderItem;
  children: FolderTreeNode[];
  depth: number;
}

export type NavSection = 'all' | 'recent' | 'starred' | 'trash';
export type ViewMode = 'list' | 'grid';
export type SortKey = 'updated_desc' | 'name_asc' | 'name_desc' | 'size_desc';
export type FileCategory = 'all' | 'document' | 'image' | 'media' | 'archive' | 'other';
