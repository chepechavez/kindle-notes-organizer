/**
 * @fileoverview Destination Folder Scanner, Previous Export Detector, and File Writer.
 * Supports File System Access API (showDirectoryPicker) with universal fallback.
 */

import { normalizeBookKey } from './parser.js';

export const SYNC_MANIFEST_FILENAME = '.kindle-sync.json';

/**
 * Generates a Windows/macOS/Linux safe filename for a book export.
 * @param {Object} book
 * @param {string} ext - 'docx' | 'md' | 'pdf'
 * @param {{ includeAuthorInFilename?: boolean, conflictPolicy?: string, hasExistingFile?: boolean }} options
 */
export function buildSafeBookFilename(book, ext, options = {}) {
  const baseTitle = (book.cleanTitle || book.title || 'Libro Kindle')
    .replace(/[<>:"/\\|?*\x00-\x1F¡!¿?]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const cleanAuthor = (book.author || '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  let name = baseTitle || 'Libro Kindle';
  if (
    options.includeAuthorInFilename &&
    cleanAuthor &&
    !cleanAuthor.startsWith('Documento') &&
    !cleanAuthor.startsWith('Sistema')
  ) {
    name = `${name} - ${cleanAuthor}`;
  }

  if (options.conflictPolicy === 'keep_both' && options.hasExistingFile) {
    const today = new Date().toISOString().slice(0, 10);
    name = `${name} (${today})`;
  }

  return `${name}.${ext}`;
}

/**
 * Scans a FileSystemDirectoryHandle (from showDirectoryPicker) for existing exports and manifest.
 * @param {FileSystemDirectoryHandle} dirHandle
 */
export async function scanDestinationDirectoryHandle(dirHandle) {
  let manifest = { version: 1, updatedAt: null, books: {} };
  const existingFiles = [];

  for await (const [name, entry] of dirHandle.entries()) {
    if (entry.kind === 'file') {
      if (name === SYNC_MANIFEST_FILENAME) {
        try {
          const file = await entry.getFile();
          const text = await file.text();
          const parsed = JSON.parse(text);
          if (parsed && typeof parsed === 'object' && parsed.books) {
            manifest = parsed;
          }
        } catch {
          // Ignore corrupted manifest and rebuild
        }
      } else if (/\.(docx|md|pdf)$/i.test(name)) {
        existingFiles.push(name);
      }
    }
  }

  return {
    folderName: dirHandle.name,
    mode: 'readwrite',
    dirHandle,
    manifest,
    existingFiles
  };
}

/**
 * Scans a FileList from <input type="file" webkitdirectory> (universal read fallback).
 * @param {FileList} fileList
 */
export async function scanDestinationFileList(fileList) {
  let manifest = { version: 1, updatedAt: null, books: {} };
  const existingFiles = [];
  let folderName = 'Carpeta seleccionada';

  const files = Array.from(fileList || []);
  if (files.length > 0 && files[0].webkitRelativePath) {
    folderName = files[0].webkitRelativePath.split('/')[0] || folderName;
  }

  for (const file of files) {
    const relParts = (file.webkitRelativePath || file.name).split('/');
    // Only inspect top-level files in that directory
    if (relParts.length <= 2) {
      const name = file.name;
      if (name === SYNC_MANIFEST_FILENAME) {
        try {
          const text = await file.text();
          const parsed = JSON.parse(text);
          if (parsed && typeof parsed === 'object' && parsed.books) {
            manifest = parsed;
          }
        } catch {
          // Ignore invalid JSON
        }
      } else if (/\.(docx|md|pdf)$/i.test(name)) {
        existingFiles.push(name);
      }
    }
  }

  return {
    folderName,
    mode: 'download_fallback',
    dirHandle: null,
    manifest,
    existingFiles
  };
}

/**
 * Compares all books in the catalog against the scanned destination folder state.
 * Annotates each book with `syncInfo`:
 * - status: 'new' | 'updated' | 'up_to_date'
 * - matchedFiles: string[]
 * - deltaHighlights: number
 * - deltaNotes: number
 * - lastExportedAt: string | null
 * @param {Array<Object>} books
 * @param {Object | null} destState
 */
export function evaluateBooksSyncStatus(books, destState) {
  const summary = {
    hasDestination: Boolean(destState),
    newCount: 0,
    updatedCount: 0,
    upToDateCount: 0
  };

  if (!destState) {
    for (const book of books) {
      book.syncInfo = {
        status: 'new',
        matchedFiles: [],
        deltaHighlights: book.highlightsCount,
        deltaNotes: book.notesCount,
        lastExportedAt: null
      };
      if (!book.isSystemClippingsBook) summary.newCount++;
    }
    return summary;
  }

  const manifestBooks = (destState.manifest && destState.manifest.books) || {};
  const existingFiles = destState.existingFiles || [];

  for (const book of books) {
    const manifestEntry = manifestBooks[book.bookKey];
    const normCleanTitle = normalizeBookKey(book.cleanTitle);
    const normRawTitle = normalizeBookKey(book.title);

    // Match any existing .docx/.md/.pdf file in destination folder by normalized title prefix
    const matchedFiles = existingFiles.filter((fileName) => {
      const baseName = fileName.replace(/\.(docx|md|pdf)$/i, '');
      const normFile = normalizeBookKey(baseName);
      return (
        normFile === normCleanTitle ||
        normFile === normRawTitle ||
        (normCleanTitle.length >= 5 && normFile.startsWith(normCleanTitle))
      );
    });

    if (manifestEntry) {
      const sameSignature = manifestEntry.contentSignature === book.contentSignature;
      const deltaHl = Math.max(0, book.highlightsCount - (manifestEntry.highlightsCount || 0));
      const deltaNotes = Math.max(0, book.notesCount - (manifestEntry.notesCount || 0));

      if (sameSignature && matchedFiles.length > 0) {
        book.syncInfo = {
          status: 'up_to_date',
          matchedFiles,
          deltaHighlights: 0,
          deltaNotes: 0,
          lastExportedAt: manifestEntry.exportedAt || null
        };
        if (!book.isSystemClippingsBook) summary.upToDateCount++;
      } else {
        book.syncInfo = {
          status: 'updated',
          matchedFiles,
          deltaHighlights: deltaHl,
          deltaNotes: deltaNotes,
          lastExportedAt: manifestEntry.exportedAt || null
        };
        if (!book.isSystemClippingsBook) summary.updatedCount++;
      }
    } else if (matchedFiles.length > 0) {
      // Found existing exported files by filename even without manifest entry
      book.syncInfo = {
        status: 'updated',
        matchedFiles,
        deltaHighlights: 0,
        deltaNotes: 0,
        lastExportedAt: null
      };
      if (!book.isSystemClippingsBook) summary.updatedCount++;
    } else {
      book.syncInfo = {
        status: 'new',
        matchedFiles: [],
        deltaHighlights: book.highlightsCount,
        deltaNotes: book.notesCount,
        lastExportedAt: null
      };
      if (!book.isSystemClippingsBook) summary.newCount++;
    }
  }

  return summary;
}

/**
 * Writes a file (Uint8Array or string) to the destination DirectoryHandle or triggers browser download.
 * @param {Object | null} destState
 * @param {string} fileName
 * @param {Uint8Array | string} content
 * @param {string} mimeType
 */
export async function writeExportFile(destState, fileName, content, mimeType) {
  if (destState && destState.dirHandle && destState.mode === 'readwrite') {
    const fileHandle = await destState.dirHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
    if (!destState.existingFiles.includes(fileName) && fileName !== SYNC_MANIFEST_FILENAME) {
      destState.existingFiles.push(fileName);
    }
    return { method: 'direct_fs', fileName };
  }

  // Fallback: trigger standard browser download
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return { method: 'browser_download', fileName };
}

/**
 * Updates and saves the .kindle-sync.json manifest in the destination directory.
 * @param {Object | null} destState
 * @param {Array<{ book: Object, exportedFiles: string[] }>} exportedRecords
 */
export async function updateSyncManifest(destState, exportedRecords) {
  if (!destState) return;
  if (!destState.manifest) {
    destState.manifest = { version: 1, updatedAt: null, books: {} };
  }

  const nowIso = new Date().toISOString();
  destState.manifest.updatedAt = nowIso;

  for (const rec of exportedRecords) {
    const { book, exportedFiles } = rec;
    destState.manifest.books[book.bookKey] = {
      title: book.cleanTitle,
      author: book.author,
      highlightsCount: book.highlightsCount,
      notesCount: book.notesCount,
      contentSignature: book.contentSignature,
      exportedAt: nowIso,
      files: exportedFiles
    };
  }

  if (destState.dirHandle && destState.mode === 'readwrite') {
    const jsonText = JSON.stringify(destState.manifest, null, 2);
    await writeExportFile(destState, SYNC_MANIFEST_FILENAME, jsonText, 'application/json');
  }
}
