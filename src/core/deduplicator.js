/**
 * @fileoverview 3-Level Smart Deduplication Engine, Note-to-Highlight Linker,
 * and Chapter/Section Hierarchy Builder for Kindle Clippings.
 */

/**
 * Normalizes text for duplicate and substring comparison.
 * @param {string} str
 */
export function normalizeTextForComparison(str) {
  return (str || '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/^[\s"«“'‘—–-]+|[\s"»”'’—–-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Computes a fast deterministic hash string for a book's clean annotations
 * to detect changes against previous exports in the destination folder.
 * @param {Array<Object>} items
 */
export function computeContentSignature(items) {
  let str = '';
  for (const item of items) {
    const notesText = (item.notes || []).map((n) => n.text).join('|');
    str += `${item.kind}:${item.locStart || 0}-${item.locEnd || 0}:${item.text}:${notesText};`;
  }
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0') + `-${items.length}`;
}

/**
 * Checks if two location ranges overlap or are immediately adjacent (within tolerance).
 * @param {Object} a
 * @param {Object} b
 * @param {number} tolerance
 */
function locationsOverlap(a, b, tolerance = 2) {
  if (a.locStart !== null && b.locStart !== null) {
    const aStart = a.locStart;
    const aEnd = a.locEnd !== null ? a.locEnd : a.locStart;
    const bStart = b.locStart;
    const bEnd = b.locEnd !== null ? b.locEnd : b.locStart;
    return aStart <= bEnd + tolerance && bStart <= aEnd + tolerance;
  }
  if (a.page !== null && b.page !== null) {
    return String(a.page) === String(b.page);
  }
  return false;
}

/**
 * Checks whether two highlights at overlapping locations represent a Kindle highlight resize/edit.
 * @param {string} normA
 * @param {string} normB
 */
function isHighlightResizeOverlap(normA, normB) {
  if (!normA || !normB) return false;
  if (normA === normB) return true;
  if (normA.includes(normB) || normB.includes(normA)) return true;

  const shorter = normA.length <= normB.length ? normA : normB;
  const longer = normA.length <= normB.length ? normB : normA;

  if (shorter.length >= 16) {
    const prefix70 = shorter.slice(0, Math.floor(shorter.length * 0.7));
    const suffix70 = shorter.slice(Math.ceil(shorter.length * 0.3));
    if (longer.includes(prefix70) || longer.includes(suffix70)) {
      return true;
    }
  }
  return false;
}

/**
 * Deduplicates highlights, notes, and bookmarks for a single book and pairs notes with highlights.
 * @param {Array<Object>} rawBookEntries
 * @param {{ dedupStrategy?: 'latest' | 'longest' }} options
 */
export function processBookEntries(rawBookEntries, options = {}) {
  const strategy = options.dedupStrategy || 'latest';
  const removedDuplicates = [];

  const rawHighlights = rawBookEntries.filter((e) => e.kind === 'highlight' && e.text);
  const rawNotes = rawBookEntries.filter((e) => e.kind === 'note' && e.text);
  const rawBookmarks = rawBookEntries.filter((e) => e.kind === 'bookmark');

  // 1. Deduplicate Highlights (3-Level: Exact, Substring/Location Overlap, Fuzzy Handle Resize)
  const keptHighlights = [];
  for (const hl of rawHighlights) {
    const normCurrent = normalizeTextForComparison(hl.text);
    if (!normCurrent) continue;

    let matchedIdx = -1;
    let duplicateType = null;

    for (let i = 0; i < keptHighlights.length; i++) {
      const existing = keptHighlights[i];
      const normExisting = normalizeTextForComparison(existing.text);

      if (normCurrent === normExisting) {
        matchedIdx = i;
        duplicateType = 'exact';
        break;
      }

      if (locationsOverlap(hl, existing, 2) && isHighlightResizeOverlap(normCurrent, normExisting)) {
        matchedIdx = i;
        duplicateType = 'resize';
        break;
      }
    }

    if (matchedIdx !== -1) {
      const existing = keptHighlights[matchedIdx];
      let keepCurrent = true;
      if (strategy === 'longest') {
        keepCurrent = hl.text.length >= existing.text.length;
      } else {
        // 'latest' (Default): Kindle appends the user's final adjustment after the initial highlight
        keepCurrent = hl.idx >= existing.idx;
      }

      const discarded = keepCurrent ? existing : hl;
      const survivor = keepCurrent ? hl : existing;

      removedDuplicates.push({
        id: `dup-${discarded.id}`,
        kind: 'highlight',
        reason: duplicateType === 'exact' ? 'Duplicado exacto' : 'Ajuste/redimensionamiento de resaltado',
        discardedText: discarded.text,
        keptText: survivor.text,
        locStart: survivor.locStart,
        page: survivor.page,
        discardedDate: discarded.dateRaw,
        keptDate: survivor.dateRaw
      });

      if (keepCurrent) {
        keptHighlights[matchedIdx] = { ...hl, notes: existing.notes || [] };
      }
    } else {
      keptHighlights.push({ ...hl, notes: [] });
    }
  }

  // 2. Deduplicate Edited Notes at the same location
  const keptNotes = [];
  for (const note of rawNotes) {
    const normCurrent = normalizeTextForComparison(note.text);
    if (!normCurrent) continue;

    let matchedIdx = -1;
    for (let i = 0; i < keptNotes.length; i++) {
      const existing = keptNotes[i];
      const normExisting = normalizeTextForComparison(existing.text);
      const sameLocation =
        note.locStart !== null &&
        existing.locStart !== null &&
        Math.abs(note.locStart - existing.locStart) <= 1;

      if (
        sameLocation &&
        (normCurrent === normExisting ||
          normCurrent.includes(normExisting) ||
          normExisting.includes(normCurrent))
      ) {
        matchedIdx = i;
        break;
      }
    }

    if (matchedIdx !== -1) {
      const existing = keptNotes[matchedIdx];
      const keepCurrent =
        strategy === 'longest' ? note.text.length >= existing.text.length : note.idx >= existing.idx;
      const discarded = keepCurrent ? existing : note;
      const survivor = keepCurrent ? note : existing;

      removedDuplicates.push({
        id: `dup-${discarded.id}`,
        kind: 'note',
        reason: 'Edición/corrección de nota en la misma posición',
        discardedText: discarded.text,
        keptText: survivor.text,
        locStart: survivor.locStart,
        page: survivor.page,
        discardedDate: discarded.dateRaw,
        keptDate: survivor.dateRaw
      });

      if (keepCurrent) {
        keptNotes[matchedIdx] = note;
      }
    } else {
      keptNotes.push(note);
    }
  }

  // 3. Deduplicate Bookmarks at identical locations
  const keptBookmarks = [];
  const seenBookmarkLocs = new Set();
  for (let i = rawBookmarks.length - 1; i >= 0; i--) {
    const bm = rawBookmarks[i];
    const key = `${bm.page || ''}-${bm.locStart || ''}`;
    if (!seenBookmarkLocs.has(key)) {
      seenBookmarkLocs.add(key);
      keptBookmarks.unshift(bm);
    } else {
      removedDuplicates.push({
        id: `dup-${bm.id}`,
        kind: 'bookmark',
        reason: 'Marcador duplicado en la misma posición',
        discardedText: `Marcador en posición ${bm.locStart || bm.page || '?'}`,
        keptText: `Marcador en posición ${bm.locStart || bm.page || '?'}`,
        locStart: bm.locStart,
        page: bm.page,
        discardedDate: bm.dateRaw,
        keptDate: bm.dateRaw
      });
    }
  }

  // 4. Pair each Note with its corresponding Highlight (or keep as standalone if no highlight matches)
  const standaloneNotes = [];
  for (const note of keptNotes) {
    let bestHighlight = null;
    let bestScore = -Infinity;

    for (const hl of keptHighlights) {
      if (!locationsOverlap(note, hl, 2)) continue;

      let score = 0;
      const hlStart = hl.locStart ?? 0;
      const hlEnd = hl.locEnd ?? hlStart;
      const nLoc = note.locStart ?? 0;

      // Exact boundary match (Kindle usually places a note at the end or start location of its highlight)
      if (nLoc === hlEnd || nLoc === hlStart) score += 60;
      else if (nLoc >= hlStart && nLoc <= hlEnd) score += 45;
      else score += 20;

      // Entry index proximity in My Clippings.txt (note is normally created right after the highlight)
      const idxDiff = note.idx - hl.idx;
      if (idxDiff === 1) score += 100;
      else if (idxDiff > 1 && idxDiff <= 4) score += 70;
      else if (idxDiff === -1) score += 50; // Highlight was resized right after adding the note
      else score -= Math.min(40, Math.abs(idxDiff));

      // Timestamp proximity
      if (note.timestamp && hl.timestamp) {
        const secDiff = Math.abs(note.timestamp - hl.timestamp) / 1000;
        if (secDiff <= 120) score += 40;
        else if (secDiff <= 600) score += 20;
      }

      if (score > bestScore) {
        bestScore = score;
        bestHighlight = hl;
      }
    }

    if (bestHighlight) {
      bestHighlight.notes.push(note);
      // Merge tags and categories onto the parent highlight for unified filtering
      for (const t of note.tags || []) {
        if (!bestHighlight.tags.includes(t)) bestHighlight.tags.push(t);
      }
      for (const c of note.categories || []) {
        if (!bestHighlight.categories.includes(c)) bestHighlight.categories.push(c);
      }
    } else {
      standaloneNotes.push({ ...note, notes: [] });
    }
  }

  // 5. Combine highlights and standalone notes sorted in reading order (by Location, then Page, then Index)
  const studyItems = [...keptHighlights, ...standaloneNotes].sort((a, b) => {
    if (a.locStart !== null && b.locStart !== null && a.locStart !== b.locStart) {
      return a.locStart - b.locStart;
    }
    if (a.pageNum !== null && b.pageNum !== null && a.pageNum !== b.pageNum) {
      return a.pageNum - b.pageNum;
    }
    return a.idx - b.idx;
  });

  const sortedBookmarks = [...keptBookmarks].sort((a, b) => {
    if (a.locStart !== null && b.locStart !== null && a.locStart !== b.locStart) {
      return a.locStart - b.locStart;
    }
    return a.idx - b.idx;
  });

  return {
    studyItems,
    highlightsCount: keptHighlights.length,
    notesCount: keptNotes.length,
    pairedNotesCount: keptNotes.length - standaloneNotes.length,
    standaloneNotesCount: standaloneNotes.length,
    bookmarks: sortedBookmarks,
    bookmarksCount: sortedBookmarks.length,
    removedDuplicates,
    removedDuplicatesCount: removedDuplicates.length
  };
}

/**
 * Organizes a book's studyItems into chapters/sections based on:
 * 1) Loaded EPUB TOC chapters (if available),
 * 2) Highlighted section headings inside the clippings (if autoDetectHeadings is enabled),
 * 3) Or continuous / page-range sections.
 * @param {Object} book
 * @param {{ groupingMode?: 'chapters' | 'continuous' | 'by_tag', autoDetectHeadings?: boolean }} config
 */
export function buildBookHierarchy(book, config = {}) {
  const groupingMode = config.groupingMode || 'chapters';
  const autoDetectHeadings = config.autoDetectHeadings !== false;
  const items = book.studyItems || [];

  if (groupingMode === 'continuous' || items.length === 0) {
    return [
      {
        id: 'sec-all',
        title: null,
        items
      }
    ];
  }

  if (groupingMode === 'by_tag') {
    const groups = [
      { id: 'cat-duda', title: '❓ Dudas y Preguntas de Estudio', items: [] },
      { id: 'cat-idea', title: '💡 Ideas, Proyectos y Conceptos Clave', items: [] },
      { id: 'cat-ref', title: '🔗 Referencias y Recursos Citados', items: [] },
      { id: 'cat-reflexion', title: '📝 Otras Notas y Reflexiones Personales', items: [] },
      { id: 'cat-hl', title: '📖 Resaltados de Lectura', items: [] }
    ];

    for (const item of items) {
      const cats = item.categories || [];
      if (cats.includes('duda')) groups[0].items.push(item);
      else if (cats.includes('idea') || (item.tags && item.tags.length > 0)) groups[1].items.push(item);
      else if (cats.includes('referencia')) groups[2].items.push(item);
      else if (item.kind === 'note' || (item.notes && item.notes.length > 0)) groups[3].items.push(item);
      else groups[4].items.push(item);
    }

    return groups.filter((g) => g.items.length > 0);
  }

  // groupingMode === 'chapters'
  // Priority 1: Real EPUB chapters matched via epubReader
  if (book.epubChapters && book.epubChapters.length > 0) {
    const sectionsMap = new Map();
    const orderedSections = [];

    for (const item of items) {
      const chapTitle = item.chapterTitle || 'Notas Generales';
      if (!sectionsMap.has(chapTitle)) {
        const sec = {
          id: `chap-${orderedSections.length}`,
          title: chapTitle,
          items: []
        };
        sectionsMap.set(chapTitle, sec);
        orderedSections.push(sec);
      }
      sectionsMap.get(chapTitle).items.push(item);
    }
    return orderedSections;
  }

  // Priority 2: User-defined custom chapter ranges or Auto-detected highlighted headings
  if (autoDetectHeadings) {
    const hasHeadingCandidates = items.some((it) => it.isHeadingCandidate && (!it.notes || it.notes.length === 0));
    if (hasHeadingCandidates) {
      const sections = [];
      let currentSection = {
        id: 'sec-intro',
        title: 'Inicio / Primeras Secciones',
        items: []
      };

      for (const item of items) {
        if (item.isHeadingCandidate && (!item.notes || item.notes.length === 0)) {
          if (currentSection.items.length > 0) {
            sections.push(currentSection);
          }
          currentSection = {
            id: `sec-${sections.length + 1}`,
            title: item.text.replace(/[«»""]/g, '').trim(),
            items: []
          };
        } else {
          currentSection.items.push(item);
        }
      }
      if (currentSection.items.length > 0) {
        sections.push(currentSection);
      }
      if (sections.length > 1) {
        return sections;
      }
    }
  }

  // Priority 3: Group by Page blocks or Location intervals when book has enough notes
  if (items.length >= 12) {
    const sections = [];
    const hasPages = items.some((it) => it.pageNum !== null);

    if (hasPages) {
      const maxPage = Math.max(...items.map((it) => it.pageNum || 1));
      const step = maxPage <= 100 ? 25 : maxPage <= 300 ? 50 : 75;
      const map = new Map();

      for (const item of items) {
        const p = item.pageNum || 1;
        const bucketStart = Math.floor((p - 1) / step) * step + 1;
        const bucketEnd = bucketStart + step - 1;
        const key = `${bucketStart}-${bucketEnd}`;
        if (!map.has(key)) {
          const sec = {
            id: `page-sec-${key}`,
            title: `Páginas ${bucketStart} a ${bucketEnd}`,
            items: []
          };
          map.set(key, sec);
          sections.push(sec);
        }
        map.get(key).items.push(item);
      }
      return sections;
    } else {
      const maxLoc = Math.max(...items.map((it) => it.locStart || 1));
      const step = maxLoc <= 1000 ? 250 : 600;
      const map = new Map();

      for (const item of items) {
        const loc = item.locStart || 1;
        const bucketStart = Math.floor((loc - 1) / step) * step + 1;
        const bucketEnd = bucketStart + step - 1;
        const key = `${bucketStart}-${bucketEnd}`;
        if (!map.has(key)) {
          const sec = {
            id: `loc-sec-${key}`,
            title: `Posiciones ${bucketStart} a ${bucketEnd}`,
            items: []
          };
          map.set(key, sec);
          sections.push(sec);
        }
        map.get(key).items.push(item);
      }
      return sections;
    }
  }

  return [
    {
      id: 'sec-all',
      title: null,
      items
    }
  ];
}

/**
 * Builds the full catalog of deduplicated books from parsed entries.
 * @param {Array<Object>} parsedEntries
 * @param {{ dedupStrategy?: 'latest' | 'longest', customTitles?: Object }} options
 */
export function buildBooksCatalog(parsedEntries, options = {}) {
  const groups = new Map();

  for (const entry of parsedEntries) {
    if (!groups.has(entry.bookKey)) {
      groups.set(entry.bookKey, {
        bookKey: entry.bookKey,
        bookHeader: entry.bookHeader,
        rawEntries: []
      });
    }
    groups.get(entry.bookKey).rawEntries.push(entry);
  }

  const books = [];
  let totalRemovedDuplicates = 0;

  for (const [bookKey, group] of groups.entries()) {
    const processed = processBookEntries(group.rawEntries, options);
    totalRemovedDuplicates += processed.removedDuplicatesCount;

    const timestamps = processed.studyItems
      .map((i) => i.timestamp)
      .filter((t) => t !== null);
    const firstTimestamp = timestamps.length > 0 ? Math.min(...timestamps) : null;
    const lastTimestamp = timestamps.length > 0 ? Math.max(...timestamps) : null;

    const allTags = [];
    const allCategories = [];
    for (const item of processed.studyItems) {
      for (const t of item.tags || []) {
        if (!allTags.includes(t)) allTags.push(t);
      }
      for (const c of item.categories || []) {
        if (!allCategories.includes(c)) allCategories.push(c);
      }
    }

    const customOverride = (options.customTitles && options.customTitles[bookKey]) || {};

    const bookObj = {
      bookKey,
      rawTitle: group.bookHeader.rawTitle,
      title: customOverride.title || group.bookHeader.title,
      cleanTitle: customOverride.title || group.bookHeader.cleanTitle,
      author: customOverride.author || group.bookHeader.author,
      rawAuthor: group.bookHeader.rawAuthor,
      isSideloaded: group.bookHeader.isSideloaded,
      isSystemClippingsBook: group.bookHeader.isSystemClippingsBook,
      rawEntriesCount: group.rawEntries.length,
      ...processed,
      firstTimestamp,
      lastTimestamp,
      tags: allTags,
      categories: allCategories,
      epubChapters: null,
      epubMatchedFile: null,
      contentSignature: computeContentSignature(processed.studyItems)
    };

    books.push(bookObj);
  }

  // Sort books by most recently annotated first (or alphabetically as tie-breaker)
  books.sort((a, b) => {
    if (a.isSystemClippingsBook !== b.isSystemClippingsBook) {
      return a.isSystemClippingsBook ? 1 : -1;
    }
    if (b.lastTimestamp && a.lastTimestamp && b.lastTimestamp !== a.lastTimestamp) {
      return b.lastTimestamp - a.lastTimestamp;
    }
    return a.cleanTitle.localeCompare(b.cleanTitle, 'es');
  });

  return {
    books,
    totalRemovedDuplicates
  };
}
