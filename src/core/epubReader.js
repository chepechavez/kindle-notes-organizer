/**
 * @fileoverview Pure Browser-Native EPUB Reader & TOC Chapter Matcher.
 * Uses native ArrayBuffer + DecompressionStream('deflate-raw') + DOMParser.
 * Zero external libraries or Node.js dependencies.
 */

import { normalizeTextForComparison } from './deduplicator.js';

/**
 * Minimal browser-native ZIP reader supporting Store (0) and Deflate (8) entries.
 * @param {ArrayBuffer} buffer
 * @returns {Promise<Map<string, Uint8Array>>}
 */
export async function unzipBuffer(buffer) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const files = new Map();

  // Locate End of Central Directory (EOCD) signature 0x06054b50
  let eocdOffset = -1;
  const minEocdOffset = Math.max(0, bytes.length - 65557);
  for (let i = bytes.length - 22; i >= minEocdOffset; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    throw new Error('El archivo no es un contenedor ZIP/EPUB válido.');
  }

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const cdOffset = view.getUint32(eocdOffset + 16, true);

  let ptr = cdOffset;
  const decoder = new TextDecoder('utf-8');

  for (let i = 0; i < totalEntries; i++) {
    if (ptr + 46 > bytes.length || view.getUint32(ptr, true) !== 0x02014b50) break;

    const compressionMethod = view.getUint16(ptr + 10, true);
    const compressedSize = view.getUint32(ptr + 20, true);
    const fileNameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localHeaderOffset = view.getUint32(ptr + 42, true);

    const fileName = decoder.decode(bytes.subarray(ptr + 46, ptr + 46 + fileNameLen));
    ptr += 46 + fileNameLen + extraLen + commentLen;

    if (fileName.endsWith('/')) continue;

    // Read Local File Header (0x04034b50)
    if (localHeaderOffset + 30 > bytes.length) continue;
    const localNameLen = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const rawSlice = bytes.subarray(dataStart, dataStart + compressedSize);

    if (compressionMethod === 0) {
      files.set(fileName, rawSlice);
    } else if (compressionMethod === 8 && typeof DecompressionStream !== 'undefined') {
      try {
        const ds = new DecompressionStream('deflate-raw');
        const writer = ds.writable.getWriter();
        writer.write(rawSlice);
        writer.close();
        const decompressedBuf = await new Response(ds.readable).arrayBuffer();
        files.set(fileName, new Uint8Array(decompressedBuf));
      } catch {
        // Skip unreadable entry gracefully
      }
    }
  }

  return files;
}

/**
 * Resolves a relative path inside an EPUB archive against a base directory.
 * @param {string} basePath
 * @param {string} relativePath
 */
function resolveEpubPath(basePath, relativePath) {
  if (!relativePath) return '';
  const cleanRel = decodeURIComponent(relativePath.split('#')[0]);
  const baseParts = basePath.split('/').slice(0, -1).filter(Boolean);
  const relParts = cleanRel.split('/');

  for (const part of relParts) {
    if (part === '.' || part === '') continue;
    if (part === '..') baseParts.pop();
    else baseParts.push(part);
  }
  return baseParts.join('/');
}

/**
 * Parses an EPUB file and extracts its metadata, Table of Contents (TOC), and chapter text segments.
 * @param {File} file
 */
export async function parseEpubFile(file) {
  const buffer = await file.arrayBuffer();
  const zipFiles = await unzipBuffer(buffer);
  const decoder = new TextDecoder('utf-8');
  const domParser = new DOMParser();

  const getTextFile = (path) => {
    const exact = zipFiles.get(path);
    if (exact) return decoder.decode(exact);
    const lowerPath = path.toLowerCase();
    for (const [k, v] of zipFiles.entries()) {
      if (k.toLowerCase() === lowerPath) return decoder.decode(v);
    }
    return null;
  };

  // 1. Locate OPF path via META-INF/container.xml
  const containerXml = getTextFile('META-INF/container.xml');
  let opfPath = null;
  if (containerXml) {
    const doc = domParser.parseFromString(containerXml, 'application/xml');
    const rootfile = doc.querySelector('rootfile');
    if (rootfile) opfPath = rootfile.getAttribute('full-path');
  }
  if (!opfPath) {
    for (const k of zipFiles.keys()) {
      if (k.toLowerCase().endsWith('.opf')) {
        opfPath = k;
        break;
      }
    }
  }
  if (!opfPath) {
    throw new Error(`No se encontró el archivo OPF en ${file.name}`);
  }

  const opfContent = getTextFile(opfPath);
  const opfDoc = domParser.parseFromString(opfContent, 'application/xml');

  const titleEl = opfDoc.getElementsByTagNameNS('*', 'title')[0] || opfDoc.querySelector('title');
  const creatorEl = opfDoc.getElementsByTagNameNS('*', 'creator')[0] || opfDoc.querySelector('creator');
  const epubTitle = titleEl ? titleEl.textContent.trim() : file.name.replace(/\.epub$/i, '');
  const epubAuthor = creatorEl ? creatorEl.textContent.trim() : '';

  // 2. Build manifest map (id -> href)
  const manifest = new Map();
  let navHref = null;
  let ncxHref = null;

  const itemEls = Array.from(opfDoc.getElementsByTagNameNS('*', 'item'));
  for (const item of itemEls) {
    const id = item.getAttribute('id');
    const href = item.getAttribute('href');
    const mediaType = (item.getAttribute('media-type') || '').toLowerCase();
    const props = (item.getAttribute('properties') || '').toLowerCase();
    if (id && href) {
      manifest.set(id, href);
      if (props.includes('nav')) navHref = href;
      if (mediaType.includes('ncx') || href.toLowerCase().endsWith('.ncx')) ncxHref = href;
    }
  }

  // 3. Parse Table of Contents (TOC) entries: [{ title, href, filePath, anchor }]
  const tocEntries = [];

  if (ncxHref) {
    const ncxPath = resolveEpubPath(opfPath, ncxHref);
    const ncxXml = getTextFile(ncxPath);
    if (ncxXml) {
      const ncxDoc = domParser.parseFromString(ncxXml, 'application/xml');
      const navPoints = Array.from(ncxDoc.getElementsByTagNameNS('*', 'navPoint'));
      for (const np of navPoints) {
        const labelEl = np.getElementsByTagNameNS('*', 'text')[0];
        const contentEl = np.getElementsByTagNameNS('*', 'content')[0];
        if (labelEl && contentEl) {
          const title = labelEl.textContent.replace(/\s+/g, ' ').trim();
          const rawSrc = contentEl.getAttribute('src') || '';
          const [relFile, anchor] = rawSrc.split('#');
          const filePath = resolveEpubPath(ncxPath, relFile);
          if (title && filePath) {
            tocEntries.push({ title, filePath, anchor: anchor || null });
          }
        }
      }
    }
  }

  if (tocEntries.length === 0 && navHref) {
    const navPath = resolveEpubPath(opfPath, navHref);
    const navHtml = getTextFile(navPath);
    if (navHtml) {
      const navDoc = domParser.parseFromString(navHtml, 'text/html');
      const links = Array.from(navDoc.querySelectorAll('nav a[href], a[href]'));
      for (const a of links) {
        const title = a.textContent.replace(/\s+/g, ' ').trim();
        const rawHref = a.getAttribute('href') || '';
        const [relFile, anchor] = rawHref.split('#');
        const filePath = resolveEpubPath(navPath, relFile);
        if (title && filePath) {
          tocEntries.push({ title, filePath, anchor: anchor || null });
        }
      }
    }
  }

  // 4. Read Spine order and build sequential chapter blocks with normalized text & char offsets
  const spineItemRefs = Array.from(opfDoc.getElementsByTagNameNS('*', 'itemref'));
  const spineFiles = [];
  for (const ref of spineItemRefs) {
    const idref = ref.getAttribute('idref');
    const href = manifest.get(idref);
    if (href) {
      const fullPath = resolveEpubPath(opfPath, href);
      if (!spineFiles.includes(fullPath)) spineFiles.push(fullPath);
    }
  }

  // Map filePath -> first matching TOC title (or nested anchor titles)
  const chapters = [];
  let cumulativeChars = 0;
  let currentChapterTitle = 'Inicio / Preliminares';

  for (const spinePath of spineFiles) {
    const html = getTextFile(spinePath);
    if (!html) continue;

    const matchingTocs = tocEntries.filter(
      (t) => t.filePath.toLowerCase() === spinePath.toLowerCase()
    );
    if (matchingTocs.length > 0) {
      currentChapterTitle = matchingTocs[0].title;
    }

    const doc = domParser.parseFromString(html, 'text/html');
    // If no TOC entry matched this spine file, check if the file has a clear h1/h2 heading
    if (matchingTocs.length === 0) {
      const headingEl = doc.querySelector('h1, h2');
      if (headingEl && headingEl.textContent.trim().length > 2 && headingEl.textContent.trim().length < 100) {
        currentChapterTitle = headingEl.textContent.replace(/\s+/g, ' ').trim();
      }
    }

    const bodyText = doc.body ? doc.body.textContent || '' : '';
    const normText = normalizeTextForComparison(bodyText);
    const charLen = Math.max(1, bodyText.length);

    chapters.push({
      title: currentChapterTitle,
      spinePath,
      normText,
      charStart: cumulativeChars,
      charEnd: cumulativeChars + charLen
    });

    cumulativeChars += charLen;
  }

  // Merge consecutive spine items that share the same chapter title
  const mergedChapters = [];
  for (const ch of chapters) {
    const prev = mergedChapters[mergedChapters.length - 1];
    if (prev && prev.title === ch.title) {
      prev.normText += ' ' + ch.normText;
      prev.charEnd = ch.charEnd;
    } else {
      mergedChapters.push({ ...ch });
    }
  }

  return {
    fileName: file.name,
    title: epubTitle,
    author: epubAuthor,
    totalChars: Math.max(1, cumulativeChars),
    chapters: mergedChapters
  };
}

/**
 * Matches parsed EPUBs against the catalog of books and assigns chapter titles to every highlight/note.
 * @param {Array<Object>} books
 * @param {Array<Object>} parsedEpubs
 */
export function attachEpubsToBooks(books, parsedEpubs) {
  let matchedCount = 0;

  for (const epub of parsedEpubs) {
    const normEpubTitle = normalizeTextForComparison(epub.title);
    const normFileName = normalizeTextForComparison(epub.fileName.replace(/\.epub$/i, '').replace(/_/g, ' '));

    let bestBook = null;
    let bestScore = 0;

    for (const book of books) {
      const normBookTitle = normalizeTextForComparison(book.cleanTitle);
      if (!normBookTitle) continue;

      let score = 0;
      if (normBookTitle === normEpubTitle || normBookTitle === normFileName) {
        score = 100;
      } else if (normBookTitle.includes(normEpubTitle) || normEpubTitle.includes(normBookTitle)) {
        score = 80;
      } else if (normBookTitle.includes(normFileName) || normFileName.includes(normBookTitle)) {
        score = 75;
      } else {
        // Word overlap score
        const bookWords = normBookTitle.split(' ').filter((w) => w.length > 3);
        const epubWords = (normEpubTitle + ' ' + normFileName).split(' ');
        const hits = bookWords.filter((w) => epubWords.includes(w)).length;
        if (bookWords.length > 0 && hits / bookWords.length >= 0.6) {
          score = Math.round((hits / bookWords.length) * 65);
        }
      }

      if (score > bestScore && score >= 50) {
        bestScore = score;
        bestBook = book;
      }
    }

    if (bestBook && epub.chapters.length > 0) {
      bestBook.epubMatchedFile = epub.fileName;
      bestBook.epubChapters = epub.chapters.map((c) => c.title);
      matchedCount++;

      const maxBookLoc = Math.max(
        1,
        ...bestBook.studyItems.map((it) => it.locEnd || it.locStart || 1)
      );

      for (const item of bestBook.studyItems) {
        const normQuote = normalizeTextForComparison(item.text);
        const searchSnippet = normQuote.slice(0, Math.min(65, normQuote.length));
        let foundChapter = null;

        // 1. Exact/substring text lookup inside the EPUB chapter text
        if (searchSnippet.length >= 12) {
          for (const ch of epub.chapters) {
            if (ch.normText.includes(searchSnippet)) {
              foundChapter = ch.title;
              break;
            }
          }
        }

        // 2. Fallback: proportional Kindle Location mapping to character offset
        if (!foundChapter && item.locStart) {
          const ratio = Math.min(1, Math.max(0, item.locStart / (maxBookLoc * 1.05)));
          const targetChar = ratio * epub.totalChars;
          for (const ch of epub.chapters) {
            if (targetChar >= ch.charStart && targetChar <= ch.charEnd) {
              foundChapter = ch.title;
              break;
            }
          }
        }

        item.chapterTitle = foundChapter || epub.chapters[0].title;
      }
    }
  }

  return matchedCount;
}
