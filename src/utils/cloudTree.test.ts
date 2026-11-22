import test from 'node:test';
import assert from 'node:assert/strict';
import type { FileItem, FolderItem } from '../types/cloud';
import {
  buildBreadcrumbs,
  buildFolderTree,
  calculateCategoryBreakdown,
  calculateUsageStats,
  canMoveFolder,
  countFolderContents,
  filterAndSortWorkspaceItems,
  formatBytes,
  formatFolderSummary,
  getDescendantFolderIds,
  getFileCategory,
  validateEntryName,
} from './cloudTree';

const sampleFolders: FolderItem[] = [
  {
    id: 'f-root-1',
    userId: 'u1',
    name: 'Dokumen Kerja',
    parentId: null,
    color: 'blue',
    createdAt: '2026-11-01T08:00:00.000Z',
    updatedAt: '2026-11-10T09:00:00.000Z',
    trashedAt: null,
  },
  {
    id: 'f-child-1',
    userId: 'u1',
    name: 'Laporan Q4',
    parentId: 'f-root-1',
    color: 'slate',
    createdAt: '2026-11-02T08:00:00.000Z',
    updatedAt: '2026-11-12T10:00:00.000Z',
    trashedAt: null,
  },
  {
    id: 'f-grandchild-1',
    userId: 'u1',
    name: 'Revisi Final',
    parentId: 'f-child-1',
    color: 'slate',
    createdAt: '2026-11-03T08:00:00.000Z',
    updatedAt: '2026-11-13T10:00:00.000Z',
    trashedAt: null,
  },
  {
    id: 'f-root-2',
    userId: 'u1',
    name: 'Foto & Media',
    parentId: null,
    color: 'emerald',
    createdAt: '2026-11-01T09:00:00.000Z',
    updatedAt: '2026-11-15T11:00:00.000Z',
    trashedAt: null,
  },
];

const sampleFiles: FileItem[] = [
  {
    id: 'file-1',
    userId: 'u1',
    name: 'ringkasan.md',
    folderId: 'f-child-1',
    mimeType: 'text/markdown',
    size: 4096,
    relativeDiskPath: 'Dokumen Kerja/Laporan Q4/ringkasan.md',
    starred: true,
    createdAt: '2026-11-05T08:00:00.000Z',
    updatedAt: '2026-11-18T08:00:00.000Z',
    trashedAt: null,
  },
  {
    id: 'file-2',
    userId: 'u1',
    name: 'ubud.jpg',
    folderId: 'f-root-2',
    mimeType: 'image/jpeg',
    size: 1_500_000,
    relativeDiskPath: 'Foto & Media/ubud.jpg',
    starred: false,
    createdAt: '2026-11-06T08:00:00.000Z',
    updatedAt: '2026-11-19T08:00:00.000Z',
    trashedAt: null,
  },
  {
    id: 'file-3',
    userId: 'u1',
    name: 'backup-lama.zip',
    folderId: null,
    mimeType: 'application/zip',
    size: 250_000,
    relativeDiskPath: 'backup-lama.zip',
    starred: false,
    createdAt: '2026-11-01T08:00:00.000Z',
    updatedAt: '2026-11-01T08:00:00.000Z',
    trashedAt: '2026-11-20T08:00:00.000Z',
  },
];

test('formatBytes formats bytes cleanly with Indonesian decimal comma', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(1536), '1,5 KB');
  assert.equal(formatBytes(1024 * 1024 * 2.5), '2,5 MB');
});

test('buildBreadcrumbs constructs full root-to-nested path', () => {
  const crumbs = buildBreadcrumbs(sampleFolders, 'f-grandchild-1');
  assert.deepEqual(
    crumbs.map((c) => c.name),
    ['Penyimpanan Saya', 'Dokumen Kerja', 'Laporan Q4', 'Revisi Final']
  );
  assert.deepEqual(buildBreadcrumbs(sampleFolders, null), [{ id: null, name: 'Penyimpanan Saya' }]);
});

test('buildFolderTree creates sorted hierarchical tree', () => {
  const tree = buildFolderTree(sampleFolders);
  assert.equal(tree.length, 2);
  assert.equal(tree[0].folder.name, 'Dokumen Kerja');
  assert.equal(tree[0].children[0].folder.name, 'Laporan Q4');
  assert.equal(tree[0].children[0].children[0].folder.name, 'Revisi Final');
  assert.equal(tree[0].children[0].children[0].depth, 2);
});

test('canMoveFolder blocks circular moves and allows valid relocations', () => {
  assert.equal(canMoveFolder(sampleFolders, 'f-root-1', 'f-root-1'), false);
  assert.equal(canMoveFolder(sampleFolders, 'f-root-1', 'f-child-1'), false);
  assert.equal(canMoveFolder(sampleFolders, 'f-root-1', 'f-grandchild-1'), false);
  assert.equal(canMoveFolder(sampleFolders, 'f-root-1', null), false); // already in root
  assert.equal(canMoveFolder(sampleFolders, 'f-root-1', 'f-root-2'), true);
  assert.equal(canMoveFolder(sampleFolders, 'f-grandchild-1', null), true);
});

test('getDescendantFolderIds and countFolderContents traverse nested subtrees', () => {
  const descendants = getDescendantFolderIds(sampleFolders, 'f-root-1');
  assert.deepEqual(descendants.sort(), ['f-child-1', 'f-grandchild-1'].sort());

  const counts = countFolderContents(sampleFolders, sampleFiles, 'f-root-1');
  assert.deepEqual(counts, { subfolderCount: 2, fileCount: 1 });
});

test('validateEntryName rejects invalid characters, empty names, and duplicates', () => {
  assert.equal(validateEntryName('   ', []).valid, false);
  assert.equal(validateEntryName('..', []).valid, false);
  assert.equal(validateEntryName('Dokumen Kerja', ['dokumen kerja']).valid, false);
  assert.equal(validateEntryName('Dokumen Kerja', ['Dokumen Kerja'], 'Dokumen Kerja').valid, true);
  const cleaned = validateEntryName('Arsip/Pajak:2026', []);
  assert.equal(cleaned.valid, true);
  assert.equal(cleaned.sanitized, 'ArsipPajak2026');
});

test('filterAndSortWorkspaceItems filters by search/category and sorts correctly', () => {
  const byCategory = filterAndSortWorkspaceItems({
    folders: sampleFolders,
    files: sampleFiles.filter((f) => !f.trashedAt),
    searchQuery: '',
    category: 'image',
    sortKey: 'name_asc',
  });
  assert.equal(byCategory.folders.length, 0);
  assert.equal(byCategory.files.length, 1);
  assert.equal(byCategory.files[0].name, 'ubud.jpg');
  assert.equal(getFileCategory('image/jpeg', 'ubud.jpg'), 'image');

  const bySize = filterAndSortWorkspaceItems({
    folders: [],
    files: sampleFiles.filter((f) => !f.trashedAt),
    searchQuery: '',
    category: 'all',
    sortKey: 'size_desc',
  });
  assert.equal(bySize.files[0].id, 'file-2');
});

test('calculateUsageStats separates active and trashed storage usage', () => {
  const usage = calculateUsageStats(sampleFiles);
  assert.equal(usage.activeBytes, 1_504_096);
  assert.equal(usage.trashBytes, 250_000);
});

test('calculateCategoryBreakdown aggregates active files by category and excludes trashed files', () => {
  const breakdown = calculateCategoryBreakdown(sampleFiles);
  const imageBucket = breakdown.find((b) => b.category === 'image');
  const docBucket = breakdown.find((b) => b.category === 'document');
  const archiveBucket = breakdown.find((b) => b.category === 'archive');

  assert.equal(imageBucket?.count, 1);
  assert.equal(imageBucket?.bytes, 1_500_000);
  assert.equal(docBucket?.count, 1);
  assert.equal(docBucket?.bytes, 4096);
  assert.equal(archiveBucket?.count, 0); // trashed zip excluded
});

test('formatFolderSummary renders readable nested counts', () => {
  assert.equal(formatFolderSummary(0, 0), 'Kosong');
  assert.equal(formatFolderSummary(0, 3), '3 file');
  assert.equal(formatFolderSummary(2, 0), '2 folder');
  assert.equal(formatFolderSummary(1, 4), '1 folder · 4 file');
});
