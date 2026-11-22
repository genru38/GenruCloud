import type { FileItem, FolderItem, StorageDiskInfo, UserProfile } from '../types/cloud';

const TOKEN_STORAGE_KEY = 'awanku_session_token';

export function getSavedToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveToken(token: string | null): void {
  try {
    if (token) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors in restricted environments
  }
}

async function apiRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = getSavedToken();
  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, { ...options, headers });
  const text = await response.text();
  let parsed: Record<string, unknown> = {};
  if (text) {
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      parsed = { error: text };
    }
  }

  if (!response.ok) {
    const message = typeof parsed.error === 'string' ? parsed.error : `Terjadi kesalahan (${response.status})`;
    throw new Error(message);
  }

  return parsed as T;
}

export const cloudApi = {
  async register(name: string, email: string, password: string): Promise<{ user: UserProfile; token: string }> {
    const res = await apiRequest<{ user: UserProfile; token: string }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    });
    saveToken(res.token);
    return res;
  },

  async login(email: string, password: string): Promise<{ user: UserProfile; token: string }> {
    const res = await apiRequest<{ user: UserProfile; token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    saveToken(res.token);
    return res;
  },

  async getMe(): Promise<{ user: UserProfile }> {
    return apiRequest<{ user: UserProfile }>('/api/auth/me');
  },

  async logout(): Promise<void> {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } finally {
      saveToken(null);
    }
  },

  async updateProfile(name: string): Promise<{ user: UserProfile }> {
    return apiRequest('/api/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await apiRequest('/api/auth/password', {
      method: 'PATCH',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },

  async getWorkspace(): Promise<{
    folders: FolderItem[];
    files: FileItem[];
    storage: StorageDiskInfo;
  }> {
    return apiRequest('/api/workspace');
  },

  async syncDisk(): Promise<{
    summary: { addedFolders: number; addedFiles: number; updatedFiles: number; removedMissing: number };
    folders: FolderItem[];
    files: FileItem[];
    storage: StorageDiskInfo;
  }> {
    return apiRequest('/api/storage/sync', { method: 'POST' });
  },

  async createFolder(name: string, parentId: string | null, color = 'blue'): Promise<{ folder: FolderItem }> {
    return apiRequest('/api/folders', {
      method: 'POST',
      body: JSON.stringify({ name, parentId, color }),
    });
  },

  async renameFolder(folderId: string, name: string, color?: string): Promise<{ folder: FolderItem }> {
    return apiRequest(`/api/folders/${encodeURIComponent(folderId)}/rename`, {
      method: 'PATCH',
      body: JSON.stringify({ name, color }),
    });
  },

  async moveFolder(folderId: string, targetParentId: string | null): Promise<{ folder: FolderItem }> {
    return apiRequest(`/api/folders/${encodeURIComponent(folderId)}/move`, {
      method: 'PATCH',
      body: JSON.stringify({ targetParentId }),
    });
  },

  async deleteFolder(folderId: string, permanent = false): Promise<void> {
    await apiRequest(`/api/folders/${encodeURIComponent(folderId)}?permanent=${permanent ? 'true' : 'false'}`, {
      method: 'DELETE',
    });
  },

  async restoreFolder(folderId: string): Promise<{ folder: FolderItem }> {
    return apiRequest(`/api/folders/${encodeURIComponent(folderId)}/restore`, {
      method: 'POST',
    });
  },

  uploadFiles(
    files: FileList | File[],
    folderId: string | null,
    onProgress?: (percent: number) => void
  ): Promise<{ files: FileItem[] }> {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      if (folderId) {
        formData.append('folderId', folderId);
      }
      Array.from(files).forEach((file) => {
        formData.append('files', file);
      });

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/files/upload');
      const token = getSavedToken();
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      };

      xhr.onload = () => {
        try {
          const parsed = JSON.parse(xhr.responseText || '{}');
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(parsed as { files: FileItem[] });
          } else {
            reject(new Error(parsed.error || 'Gagal mengunggah berkas.'));
          }
        } catch {
          reject(new Error('Respon server tidak valid saat mengunggah.'));
        }
      };

      xhr.onerror = () => reject(new Error('Koneksi terputus saat mengunggah berkas.'));
      xhr.send(formData);
    });
  },

  async createQuickNote(name: string, content: string, folderId: string | null): Promise<{ file: FileItem }> {
    return apiRequest('/api/files/note', {
      method: 'POST',
      body: JSON.stringify({ name, content, folderId }),
    });
  },

  async renameFile(fileId: string, name: string): Promise<{ file: FileItem }> {
    return apiRequest(`/api/files/${encodeURIComponent(fileId)}/rename`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
  },

  async updateFileContent(fileId: string, content: string): Promise<{ file: FileItem }> {
    return apiRequest(`/api/files/${encodeURIComponent(fileId)}/content`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    });
  },

  async duplicateFile(fileId: string): Promise<{ file: FileItem }> {
    return apiRequest(`/api/files/${encodeURIComponent(fileId)}/duplicate`, {
      method: 'POST',
    });
  },

  async moveFiles(fileIds: string[], targetFolderId: string | null): Promise<{ files: FileItem[] }> {
    return apiRequest('/api/files/move', {
      method: 'POST',
      body: JSON.stringify({ fileIds, targetFolderId }),
    });
  },

  async toggleStar(fileId: string): Promise<{ file: FileItem }> {
    return apiRequest(`/api/files/${encodeURIComponent(fileId)}/star`, {
      method: 'PATCH',
    });
  },

  async trashFiles(fileIds: string[]): Promise<void> {
    await apiRequest('/api/files/trash', {
      method: 'POST',
      body: JSON.stringify({ fileIds }),
    });
  },

  async restoreFile(fileId: string): Promise<{ file: FileItem }> {
    return apiRequest(`/api/files/${encodeURIComponent(fileId)}/restore`, {
      method: 'POST',
    });
  },

  async deleteFile(fileId: string, permanent = false): Promise<void> {
    await apiRequest(`/api/files/${encodeURIComponent(fileId)}?permanent=${permanent ? 'true' : 'false'}`, {
      method: 'DELETE',
    });
  },

  async emptyTrash(): Promise<void> {
    await apiRequest('/api/trash/empty', { method: 'POST' });
  },

  getFileContentUrl(fileId: string, download = false): string {
    const token = getSavedToken() || '';
    const params = new URLSearchParams({ token });
    if (download) params.set('download', '1');
    return `/api/files/${encodeURIComponent(fileId)}/content?${params.toString()}`;
  },

  async fetchTextContent(fileId: string): Promise<string> {
    const token = getSavedToken();
    const res = await fetch(`/api/files/${encodeURIComponent(fileId)}/content`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error('Gagal memuat isi berkas.');
    return res.text();
  },
};
