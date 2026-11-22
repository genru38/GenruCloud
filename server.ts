import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import { cloudStore } from './src/server/storageStore';
import type { UserProfile } from './src/types/cloud';

interface AuthenticatedRequest extends Request {
  user?: UserProfile;
  authToken?: string;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB per file
    files: 20,
  },
});

function extractToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    return header.slice(7).trim();
  }
  if (typeof req.query.token === 'string' && req.query.token.trim()) {
    return req.query.token.trim();
  }
  return undefined;
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const token = extractToken(req);
  const user = cloudStore.getUserByToken(token);
  if (!user) {
    res.status(401).json({ error: 'Sesi tidak valid atau telah berakhir. Silakan masuk kembali.' });
    return;
  }
  req.user = user;
  req.authToken = token;
  next();
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '5mb' }));

  // ==================== AUTH ROUTES ====================

  app.post('/api/auth/register', (req: Request, res: Response) => {
    try {
      const { name, email, password } = req.body ?? {};
      const result = cloudStore.register(String(name ?? ''), String(email ?? ''), String(password ?? ''));
      res.status(201).json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Gagal mendaftar akun.' });
    }
  });

  app.post('/api/auth/login', (req: Request, res: Response) => {
    try {
      const { email, password } = req.body ?? {};
      const result = cloudStore.login(String(email ?? ''), String(password ?? ''));
      res.json(result);
    } catch (err) {
      res.status(401).json({ error: err instanceof Error ? err.message : 'Gagal masuk.' });
    }
  });

  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    res.json({ user: req.user });
  });

  app.post('/api/auth/logout', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    cloudStore.logout(req.authToken);
    res.json({ ok: true });
  });

  app.patch('/api/auth/profile', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = cloudStore.updateProfile(req.user!.id, String(req.body?.name ?? ''));
      res.json({ user });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Gagal memperbarui profil.' });
    }
  });

  app.patch('/api/auth/password', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    try {
      const { currentPassword, newPassword } = req.body ?? {};
      cloudStore.changePassword(req.user!.id, String(currentPassword ?? ''), String(newPassword ?? ''));
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Gagal mengganti kata sandi.' });
    }
  });

  // ==================== WORKSPACE ROUTES ====================

  app.get('/api/workspace', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const data = cloudStore.getWorkspaceData(req.user!.id);
    res.json(data);
  });

  app.post('/api/storage/sync', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    try {
      const summary = cloudStore.syncUserDisk(req.user!.id);
      const workspace = cloudStore.getWorkspaceData(req.user!.id);
      res.json({ summary, ...workspace });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Gagal menyinkronkan disk.' });
    }
  });

  // ==================== FOLDER ROUTES ====================

  app.post('/api/folders', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    try {
      const { name, parentId, color } = req.body ?? {};
      const folder = cloudStore.createFolder(
        req.user!.id,
        String(name ?? ''),
        parentId ? String(parentId) : null,
        typeof color === 'string' ? color : 'blue'
      );
      res.status(201).json({ folder });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Gagal membuat folder.' });
    }
  });

  app.patch('/api/folders/:id/rename', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    try {
      const folder = cloudStore.renameFolder(
        req.user!.id,
        req.params.id,
        String(req.body?.name ?? ''),
        typeof req.body?.color === 'string' ? req.body.color : undefined
      );
      res.json({ folder });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Gagal mengganti nama folder.' });
    }
  });

  app.patch('/api/folders/:id/move', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    try {
      const targetParentId = req.body?.targetParentId ? String(req.body.targetParentId) : null;
      const folder = cloudStore.moveFolder(req.user!.id, req.params.id, targetParentId);
      res.json({ folder });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Gagal memindahkan folder.' });
    }
  });

  app.delete('/api/folders/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    try {
      const permanent = req.query.permanent === 'true';
      if (permanent) {
        cloudStore.deleteFolderPermanently(req.user!.id, req.params.id);
      } else {
        cloudStore.trashFolder(req.user!.id, req.params.id);
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Gagal menghapus folder.' });
    }
  });

  app.post('/api/folders/:id/restore', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    try {
      const folder = cloudStore.restoreFolder(req.user!.id, req.params.id);
      res.json({ folder });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Gagal memulihkan folder.' });
    }
  });

  // ==================== FILE ROUTES ====================

  app.post('/api/files/upload', requireAuth, upload.array('files', 20), (req: AuthenticatedRequest, res: Response) => {
    try {
      const uploadedFiles = (req.files as Express.Multer.File[]) || [];
      if (uploadedFiles.length === 0) {
        res.status(400).json({ error: 'Tidak ada file yang dipilih untuk diunggah.' });
        return;
      }
      const folderId = typeof req.body?.folderId === 'string' && req.body.folderId.trim()
        ? req.body.folderId.trim()
        : null;

      const created = uploadedFiles.map((file) => {
        const decodedName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        return cloudStore.saveUploadedFile(req.user!.id, folderId, decodedName, file.mimetype, file.buffer);
      });
      res.status(201).json({ files: created });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Gagal mengunggah file.' });
    }
  });

  app.post('/api/files/note', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    try {
      const { name, content, folderId } = req.body ?? {};
      const cleanName = String(name ?? '').trim();
      if (!cleanName) {
        res.status(400).json({ error: 'Nama dokumen tidak boleh kosong.' });
        return;
      }
      const finalName = /\.[a-z0-9]+$/i.test(cleanName) ? cleanName : `${cleanName}.md`;
      const mimeType = finalName.endsWith('.json')
        ? 'application/json'
        : finalName.endsWith('.txt')
          ? 'text/plain'
          : 'text/markdown';
      const file = cloudStore.saveUploadedFile(
        req.user!.id,
        folderId ? String(folderId) : null,
        finalName,
        mimeType,
        Buffer.from(String(content ?? ''), 'utf8')
      );
      res.status(201).json({ file });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Gagal membuat catatan.' });
    }
  });

  app.patch('/api/files/:id/rename', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    try {
      const file = cloudStore.renameFile(req.user!.id, req.params.id, String(req.body?.name ?? ''));
      res.json({ file });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Gagal mengganti nama file.' });
    }
  });

  app.put('/api/files/:id/content', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    try {
      const file = cloudStore.updateFileContent(req.user!.id, req.params.id, String(req.body?.content ?? ''));
      res.json({ file });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Gagal menyimpan isi berkas.' });
    }
  });

  app.post('/api/files/:id/duplicate', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    try {
      const file = cloudStore.duplicateFile(req.user!.id, req.params.id);
      res.status(201).json({ file });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Gagal menduplikasi berkas.' });
    }
  });

  app.post('/api/files/move', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    try {
      const fileIds = Array.isArray(req.body?.fileIds) ? req.body.fileIds.map(String) : [];
      if (fileIds.length === 0) {
        res.status(400).json({ error: 'Pilih minimal satu file untuk dipindahkan.' });
        return;
      }
      const targetFolderId = req.body?.targetFolderId ? String(req.body.targetFolderId) : null;
      const files = cloudStore.moveFiles(req.user!.id, fileIds, targetFolderId);
      res.json({ files });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Gagal memindahkan file.' });
    }
  });

  app.patch('/api/files/:id/star', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    try {
      const file = cloudStore.toggleStarFile(req.user!.id, req.params.id);
      res.json({ file });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Gagal memperbarui bintang.' });
    }
  });

  app.post('/api/files/trash', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    try {
      const fileIds = Array.isArray(req.body?.fileIds) ? req.body.fileIds.map(String) : [];
      cloudStore.trashFiles(req.user!.id, fileIds);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Gagal memindahkan ke sampah.' });
    }
  });

  app.post('/api/files/:id/restore', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    try {
      const file = cloudStore.restoreFile(req.user!.id, req.params.id);
      res.json({ file });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Gagal memulihkan file.' });
    }
  });

  app.delete('/api/files/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    try {
      const permanent = req.query.permanent === 'true';
      if (permanent) {
        cloudStore.deleteFilePermanently(req.user!.id, req.params.id);
      } else {
        cloudStore.trashFiles(req.user!.id, [req.params.id]);
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Gagal menghapus file.' });
    }
  });

  app.post('/api/trash/empty', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    try {
      cloudStore.emptyTrash(req.user!.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Gagal mengosongkan sampah.' });
    }
  });

  app.get('/api/files/:id/content', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    try {
      const { file, absPath } = cloudStore.getFileForContent(req.user!.id, req.params.id);
      const isDownload = req.query.download === '1';
      res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
      res.setHeader(
        'Content-Disposition',
        `${isDownload ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(file.name)}`
      );
      fs.createReadStream(absPath).pipe(res);
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'File tidak ditemukan.' });
    }
  });

  // ==================== FRONTEND SERVING ====================

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AwanKu server listening on http://localhost:${PORT}`);
  });
}

startServer();
