(function() {
'use strict';

// === MODULE: src/data/defaultClippings.js ===
// Clean template: No personal data included by default.
// Users can load their own "My Clippings.txt" or connect their Kindle device.
const DEFAULT_MY_CLIPPINGS_RAW = "";


// === MODULE: src/core/parser.js ===
/**
 * @fileoverview Multilanguage Kindle "My Clippings.txt" Parser & Book Metadata Cleaner.
 * Runs 100% client-side in the browser sandbox with zero external dependencies.
 */

const SPANISH_MONTHS = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
  julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11
};

const ENGLISH_MONTHS = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11
};

/**
 * Parses Spanish or English Kindle date strings into epoch milliseconds and ISO format.
 * Examples:
 * - "Añadido el martes, 26 de febrero de 2019 7:32:16 a. m."
 * - "Added on Sunday, February 12, 2023 3:06:08 PM"
 * @param {string} datePart
 * @returns {{ dateRaw: string, timestamp: number | null, isoDate: string | null }}
 */
function parseKindleDate(datePart) {
  if (!datePart) return { dateRaw: '', timestamp: null, isoDate: null };

  const cleaned = datePart
    .replace(/^(?:a[ñn]adido\s+el|added\s+on|adicionado\s+em|ajout[ée]\s+le|hinzugef[üu]gt\s+am|aggiunto\s+il)\s+/i, '')
    .trim();

  // 1. Try Spanish format: "martes, 26 de febrero de 2019 7:32:16 a. m."
  const esMatch = cleaned.match(
    /(?:[a-záéíóúñü]+,\s*)?(\d{1,2})\s+de\s+([a-záéíóúñ]+)\s+de\s+(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(a\.?\s*m\.?|p\.?\s*m\.?)?/i
  );
  if (esMatch) {
    const day = parseInt(esMatch[1], 10);
    const monthName = esMatch[2].toLowerCase();
    const year = parseInt(esMatch[3], 10);
    let hour = parseInt(esMatch[4], 10);
    const minute = parseInt(esMatch[5], 10);
    const second = esMatch[6] ? parseInt(esMatch[6], 10) : 0;
    const ampm = esMatch[7] ? esMatch[7].toLowerCase().replace(/\s|\./g, '') : null;

    const month = SPANISH_MONTHS[monthName];
    if (month !== undefined) {
      if (ampm === 'pm' && hour < 12) hour += 12;
      if (ampm === 'am' && hour === 12) hour = 0;
      const dt = new Date(year, month, day, hour, minute, second);
      if (!isNaN(dt.getTime())) {
        return { dateRaw: cleaned, timestamp: dt.getTime(), isoDate: dt.toISOString() };
      }
    }
  }

  // 2. Try English format: "Sunday, February 12, 2023 3:06:08 PM"
  const enMatch = cleaned.match(
    /(?:[a-z]+,\s*)?([a-z]+)\s+(\d{1,2}),\s*(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|a\.m\.|p\.m\.)?/i
  );
  if (enMatch) {
    const monthName = enMatch[1].toLowerCase();
    const day = parseInt(enMatch[2], 10);
    const year = parseInt(enMatch[3], 10);
    let hour = parseInt(enMatch[4], 10);
    const minute = parseInt(enMatch[5], 10);
    const second = enMatch[6] ? parseInt(enMatch[6], 10) : 0;
    const ampm = enMatch[7] ? enMatch[7].toLowerCase().replace(/\s|\./g, '') : null;

    const month = ENGLISH_MONTHS[monthName];
    if (month !== undefined) {
      if (ampm === 'pm' && hour < 12) hour += 12;
      if (ampm === 'am' && hour === 12) hour = 0;
      const dt = new Date(year, month, day, hour, minute, second);
      if (!isNaN(dt.getTime())) {
        return { dateRaw: cleaned, timestamp: dt.getTime(), isoDate: dt.toISOString() };
      }
    }
  }

  const fallback = Date.parse(cleaned);
  if (!isNaN(fallback)) {
    return { dateRaw: cleaned, timestamp: fallback, isoDate: new Date(fallback).toISOString() };
  }

  return { dateRaw: cleaned, timestamp: null, isoDate: null };
}

/**
 * Parses raw book header line into clean title, author, and source type (EPUB/Personal vs Store).
 * Examples:
 * - "Elon Musk (edición en español) (Walter Isaacson)"
 * - "EduTrends - Credenciales Alternativas (002) (chepechavez@gmail.com)"
 * - "Trabajo final de máster (Desconocido)"
 * @param {string} rawLine
 */
function parseBookHeader(rawLine) {
  const cleanLine = (rawLine || '').replace(/\uFEFF/g, '').trim();
  if (!cleanLine) {
    return {
      rawTitle: 'Sin título',
      title: 'Sin título',
      cleanTitle: 'Sin título',
      author: 'Autor desconocido',
      isSideloaded: true,
      isSystemClippingsBook: false
    };
  }

  const lower = cleanLine.toLowerCase();
  if (lower === 'mis recortes' || lower === 'my clippings' || lower === 'meus recortes') {
    return {
      rawTitle: cleanLine,
      title: cleanLine,
      cleanTitle: cleanLine,
      author: 'Sistema Kindle',
      isSideloaded: false,
      isSystemClippingsBook: true
    };
  }

  // Extract the LAST parenthesized segment as the author if present
  let titlePart = cleanLine;
  let authorPart = 'Autor desconocido';

  const lastOpenParen = cleanLine.lastIndexOf('(');
  const endsWithParen = cleanLine.endsWith(')');
  if (lastOpenParen > 0 && endsWithParen) {
    const candidateAuthor = cleanLine.slice(lastOpenParen + 1, -1).trim();
    const candidateTitle = cleanLine.slice(0, lastOpenParen).trim();
    if (candidateTitle && candidateAuthor) {
      titlePart = candidateTitle;
      authorPart = candidateAuthor;
    }
  }

  // Detect sideloaded EPUB / personal document indicators
  const isEmailAuthor = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authorPart);
  const isUnknownAuthor = /^(desconocido|unknown|sin autor|anonymous)$/i.test(authorPart);
  const hasFileArtifacts = /(_|\.epub|\.pdf|\.mobi|\(\d{3}\))/i.test(cleanLine);
  const isSideloaded = isEmailAuthor || isUnknownAuthor || hasFileArtifacts;

  // Clean author display
  let cleanAuthor = authorPart;
  if (isEmailAuthor) {
    cleanAuthor = `Documento personal (${authorPart})`;
  } else if (isUnknownAuthor) {
    cleanAuthor = 'Documento / EPUB cargado';
  } else if (/^([^,]+),\s*(.+)$/.test(authorPart) && !authorPart.includes(' and ') && !authorPart.includes(' y ')) {
    // Convert "Chou, Yu-kai" -> "Yu-kai Chou" while keeping original accessible
    const m = authorPart.match(/^([^,]+),\s*(.+)$/);
    if (m && m[1].split(' ').length <= 2) {
      cleanAuthor = `${m[2].trim()} ${m[1].trim()}`;
    }
  }

  // Clean noisy edition/file suffixes from title for cleanTitle option
  let cleanTitle = titlePart
    .replace(/_/g, ' ')
    .replace(/\.(epub|mobi|azw3|pdf|kfx)$/i, '')
    .replace(/\s*\((?:Spanish|English)\s+Edition\)/gi, '')
    .replace(/\s*\(edici[oó]n\s+en\s+espa[ñn]ol\)/gi, '')
    .replace(/\s*\(\d{2,4}\)\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleanTitle) cleanTitle = titlePart;

  return {
    rawTitle: cleanLine,
    title: titlePart,
    cleanTitle,
    author: cleanAuthor,
    rawAuthor: authorPart,
    isSideloaded,
    isSystemClippingsBook: false
  };
}

/**
 * Extracts study tags (#importante, etc.) and auto-categories (question, reference, idea) from text.
 * @param {string} text
 * @param {'highlight'|'note'|'bookmark'} kind
 */
function extractStudyMarkers(text, kind) {
  if (!text) return { tags: [], categories: [] };

  const tags = [];
  const tagRegex = /(?:^|\s)#([a-záéíóúñü0-9_-]{2,30})/gi;
  let match;
  while ((match = tagRegex.exec(text)) !== null) {
    const tag = match[1].toLowerCase();
    if (!tags.includes(tag)) tags.push(tag);
  }

  const categories = [];
  const trimmed = text.trim();

  if (kind === 'note') {
    if (/[¿?]/.test(trimmed) || /^(qu[eé]|c[oó]mo|por\s+qu[eé]|cu[aá]l|d[oó]nde|cu[aá]ndo)\b/i.test(trimmed)) {
      categories.push('duda');
    }
    if (/\b(referencia|cita|fuente|bibliograf[ií]a|link|enlace)\b/i.test(trimmed) || /https?:\/\//i.test(trimmed)) {
      categories.push('referencia');
    }
    if (/\b(idea|aplicar|crear|proyecto|clase|ejercicio|importante|clave|examen)\b/i.test(trimmed)) {
      categories.push('idea');
    }
    if (categories.length === 0) {
      categories.push('reflexion');
    }
  } else if (kind === 'highlight') {
    if (/https?:\/\//i.test(trimmed)) {
      categories.push('referencia');
    }
  }

  return { tags, categories };
}

/**
 * Checks if a short highlight looks like a Chapter or Section Heading highlighted by the reader.
 * Example: "LAS TRES «T» DE LA INNOVACIÓN: TECNOLOGÍA, TOLERANCIA Y… TESTÍCULOS"
 * @param {string} text
 */
function isLikelySectionHeading(text) {
  if (!text) return false;
  const trimmed = text.trim();
  if (trimmed.length < 4 || trimmed.length > 110) return false;
  if (trimmed.includes('\n')) return false;

  // Explicit chapter/part prefix
  if (/^(cap[ií]tulo|chapter|parte|part|secci[oó]n|section|introducci[oó]n|ep[ií]logo|pr[oó]logo|anexo)\s+[0-9ivxlcdm]+/i.test(trimmed)) {
    return true;
  }

  // All uppercase line with at least 3 words and no trailing period
  const lettersOnly = trimmed.replace(/[^a-záéíóúñüA-ZÁÉÍÓÚÑÜ]/g, '');
  if (
    lettersOnly.length >= 10 &&
    lettersOnly === lettersOnly.toUpperCase() &&
    !/[.!?]$/.test(trimmed)
  ) {
    return true;
  }

  return false;
}

/**
 * Generates a deterministic normalized book ID for matching across exports.
 * @param {string} title
 */
function normalizeBookKey(title) {
  return (title || '')
    .replace(/\uFEFF/g, '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^a-záéíóúñü0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Parses the full content of a Kindle `My Clippings.txt` file.
 * @param {string} rawContent
 * @returns {{ rawEntriesCount: number, parsedEntries: Array<Object> }}
 */
function parseMyClippings(rawContent) {
  if (!rawContent || typeof rawContent !== 'string') {
    return { rawEntriesCount: 0, parsedEntries: [] };
  }

  const normalizedContent = rawContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = normalizedContent
    .split(/^={5,}\s*$/m)
    .map((b) => b.trim())
    .filter(Boolean);

  const parsedEntries = [];

  for (let idx = 0; idx < blocks.length; idx++) {
    const block = blocks[idx];
    const rawLines = block.split('\n').map((l) => l.replace(/\uFEFF/g, '').trim());

    // Find first non-empty line (Book title) and second non-empty line (Metadata)
    const nonEmptyIndices = [];
    for (let i = 0; i < rawLines.length; i++) {
      if (rawLines[i] !== '') nonEmptyIndices.push(i);
    }
    if (nonEmptyIndices.length < 2) continue;

    const titleLineIdx = nonEmptyIndices[0];
    const metaLineIdx = nonEmptyIndices[1];

    const bookHeader = parseBookHeader(rawLines[titleLineIdx]);
    const metaLine = rawLines[metaLineIdx];
    const bodyLines = rawLines.slice(metaLineIdx + 1);
    const body = bodyLines.join('\n').trim();

    // Parse entry type (Highlight, Note, Bookmark) across ES/EN/PT/FR/DE/IT
    const typeMatch = metaLine.match(
      /(subrayado|highlight|destaque|surlignement|markierung|evidenziazione|nota|note|notiz|marcador|bookmark|signet|lesezeichen|segnalibro)/i
    );
    let kind = 'highlight';
    if (typeMatch) {
      const token = typeMatch[1].toLowerCase();
      if (token === 'nota' || token === 'note' || token === 'notiz') {
        kind = 'note';
      } else if (
        token === 'marcador' ||
        token === 'bookmark' ||
        token === 'signet' ||
        token === 'lesezeichen' ||
        token === 'segnalibro'
      ) {
        kind = 'bookmark';
      }
    }

    // Parse Page number (supports numbers and roman numerals)
    const pageMatch = metaLine.match(
      /(?:p[aá]gina|page|p[aá]g\.?|seite|pagina)\s+([0-9ivxlcdm]+)(?:\s*-\s*([0-9ivxlcdm]+))?/i
    );
    const pageStartRaw = pageMatch ? pageMatch[1] : null;
    const pageEndRaw = pageMatch && pageMatch[2] ? pageMatch[2] : pageStartRaw;
    const pageNum = pageStartRaw && /^\d+$/.test(pageStartRaw) ? parseInt(pageStartRaw, 10) : null;

    // Parse Kindle Location (Posición)
    const locMatch = metaLine.match(
      /(?:posici[oó]n|location|loc\.?|posi[çc][aã]o|emplacement|position|posizione)\s+([0-9]+)(?:\s*-\s*([0-9]+))?/i
    );
    const locStart = locMatch ? parseInt(locMatch[1], 10) : null;
    const locEnd = locMatch && locMatch[2] ? parseInt(locMatch[2], 10) : locStart;

    // Parse Date segment (usually after the last '|')
    const pipeParts = metaLine.split('|').map((s) => s.trim());
    const dateSegment = pipeParts.length > 1 ? pipeParts[pipeParts.length - 1] : '';
    const dateInfo = parseKindleDate(dateSegment);

    const studyMarkers = extractStudyMarkers(body, kind);

    parsedEntries.push({
      id: `clip-${idx}`,
      idx,
      bookKey: normalizeBookKey(bookHeader.rawTitle),
      bookHeader,
      kind,
      page: pageStartRaw,
      pageEnd: pageEndRaw,
      pageNum,
      locStart,
      locEnd,
      dateRaw: dateInfo.dateRaw,
      timestamp: dateInfo.timestamp,
      isoDate: dateInfo.isoDate,
      metaRaw: metaLine,
      text: body,
      tags: studyMarkers.tags,
      categories: studyMarkers.categories,
      isHeadingCandidate: kind === 'highlight' && isLikelySectionHeading(body)
    });
  }

  return {
    rawEntriesCount: blocks.length,
    parsedEntries
  };
}


// === MODULE: src/core/deduplicator.js ===
/**
 * @fileoverview 3-Level Smart Deduplication Engine, Note-to-Highlight Linker,
 * and Chapter/Section Hierarchy Builder for Kindle Clippings.
 */

/**
 * Normalizes text for duplicate and substring comparison.
 * @param {string} str
 */
function normalizeTextForComparison(str) {
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
function computeContentSignature(items) {
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
function processBookEntries(rawBookEntries, options = {}) {
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
function buildBookHierarchy(book, config = {}) {
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
function buildBooksCatalog(parsedEntries, options = {}) {
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


// === MODULE: src/core/epubReader.js ===
/**
 * @fileoverview Pure Browser-Native EPUB Reader & TOC Chapter Matcher.
 * Uses native ArrayBuffer + DecompressionStream('deflate-raw') + DOMParser.
 * Zero external libraries or Node.js dependencies.
 */

/**
 * Minimal browser-native ZIP reader supporting Store (0) and Deflate (8) entries.
 * @param {ArrayBuffer} buffer
 * @returns {Promise<Map<string, Uint8Array>>}
 */
async function unzipBuffer(buffer) {
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
async function parseEpubFile(file) {
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
function attachEpubsToBooks(books, parsedEpubs) {
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


// === MODULE: src/core/syncManager.js ===
/**
 * @fileoverview Destination Folder Scanner, Previous Export Detector, and File Writer.
 * Supports File System Access API (showDirectoryPicker) with universal fallback.
 */

const SYNC_MANIFEST_FILENAME = '.kindle-sync.json';

/**
 * Generates a Windows/macOS/Linux safe filename for a book export.
 * @param {Object} book
 * @param {string} ext - 'docx' | 'md' | 'pdf'
 * @param {{ includeAuthorInFilename?: boolean, conflictPolicy?: string, hasExistingFile?: boolean }} options
 */
function buildSafeBookFilename(book, ext, options = {}) {
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
async function scanDestinationDirectoryHandle(dirHandle) {
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
async function scanDestinationFileList(fileList) {
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
function evaluateBooksSyncStatus(books, destState) {
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
async function writeExportFile(destState, fileName, content, mimeType) {
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
async function updateSyncManifest(destState, exportedRecords) {
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


// === MODULE: src/exporters/exportViewModel.js ===
/**
 * @fileoverview Shared Export Document Model Builder.
 * Ensures 100% consistency between Live Preview, Markdown (.md), Word (.docx), and PDF (.pdf).
 */

const DEFAULT_EXPORT_CONFIG = {
  formats: {
    docx: true,
    md: true,
    pdf: false
  },
  contentFilter: 'all', // 'all' | 'highlights_only' | 'notes_only' | 'commented_highlights'
  includeBookmarks: false,
  includeExecutiveSummary: true, // Top summary box with personal notes & study questions
  includeStatsHeader: true,
  groupingMode: 'chapters', // 'chapters' | 'continuous' | 'by_tag'
  autoDetectHeadings: true,
  separatorStyle: 'callout_card', // 'callout_card' | 'divider_line' | 'numbered_list' | 'minimal_space'
  metadataFields: {
    page: true,
    location: true,
    date: false,
    tags: true
  },
  dedupStrategy: 'latest', // 'latest' | 'longest'
  includeAuthorInFilename: false,
  conflictPolicy: 'replace' // 'replace' | 'keep_both' | 'skip_existing'
};

/**
 * Formats an item's metadata badge line according to user settings.
 * @param {Object} item
 * @param {Object} metadataFields
 */
function formatItemMetaLine(item, metadataFields = {}) {
  const parts = [];
  if (metadataFields.page && item.page) {
    parts.push(`Pág. ${item.page}`);
  }
  if (metadataFields.location && item.locStart) {
    const locStr =
      item.locEnd && item.locEnd !== item.locStart
        ? `Pos. ${item.locStart}-${item.locEnd}`
        : `Pos. ${item.locStart}`;
    parts.push(locStr);
  }
  if (metadataFields.date && item.dateRaw) {
    parts.push(item.dateRaw);
  }
  return parts.join('  •  ');
}

/**
 * Formats category/tag badges for display.
 * @param {Object} item
 */
function formatCategoryBadges(item) {
  const badges = [];
  const cats = item.categories || [];
  if (cats.includes('duda')) badges.push({ code: 'duda', label: '❓ Duda / Pregunta' });
  if (cats.includes('referencia')) badges.push({ code: 'referencia', label: '🔗 Referencia' });
  if (cats.includes('idea')) badges.push({ code: 'idea', label: '💡 Idea Clave' });
  for (const tag of item.tags || []) {
    badges.push({ code: 'tag', label: `#${tag}` });
  }
  return badges;
}

/**
 * Builds the structured document model for a single book applying all active filters and hierarchy settings.
 * @param {Object} book
 * @param {Object} userConfig
 */
function buildBookExportModel(book, userConfig = {}) {
  const config = {
    ...DEFAULT_EXPORT_CONFIG,
    ...userConfig,
    metadataFields: {
      ...DEFAULT_EXPORT_CONFIG.metadataFields,
      ...(userConfig.metadataFields || {})
    }
  };

  const rawSections = buildBookHierarchy(book, {
    groupingMode: config.groupingMode,
    autoDetectHeadings: config.autoDetectHeadings
  });

  const sections = [];
  let globalNumber = 0;
  let exportedHighlightsCount = 0;
  let exportedNotesCount = 0;
  const executiveNotes = [];

  for (const sec of rawSections) {
    const filteredItems = [];

    for (const item of sec.items) {
      const hasAttachedNotes = item.notes && item.notes.length > 0;
      const isStandaloneNote = item.kind === 'note';

      if (config.contentFilter === 'highlights_only' && isStandaloneNote) {
        continue;
      }
      if (config.contentFilter === 'notes_only' && !isStandaloneNote && !hasAttachedNotes) {
        continue;
      }
      if (config.contentFilter === 'commented_highlights' && !hasAttachedNotes && !isStandaloneNote) {
        continue;
      }

      globalNumber++;
      const includeQuoteText = config.contentFilter !== 'notes_only' && item.kind === 'highlight';
      const includeAttachedNotes =
        config.contentFilter !== 'highlights_only' && (hasAttachedNotes || isStandaloneNote);

      const notesList = isStandaloneNote
        ? [{ text: item.text, meta: formatItemMetaLine(item, config.metadataFields), categories: item.categories }]
        : includeAttachedNotes
          ? (item.notes || []).map((n) => ({
              text: n.text,
              meta: formatItemMetaLine(n, config.metadataFields),
              categories: n.categories || []
            }))
          : [];

      if (includeQuoteText) exportedHighlightsCount++;
      exportedNotesCount += notesList.length;

      for (const n of notesList) {
        executiveNotes.push({
          noteText: n.text,
          quoteSnippet: includeQuoteText
            ? item.text.length > 120
              ? item.text.slice(0, 117) + '...'
              : item.text
            : null,
          meta: formatItemMetaLine(item, { page: true, location: true, date: false }),
          isQuestion: (n.categories || []).includes('duda') || /[¿?]/.test(n.text)
        });
      }

      filteredItems.push({
        number: globalNumber,
        id: item.id,
        kind: item.kind,
        quoteText: includeQuoteText ? item.text : null,
        notes: notesList,
        metaLine: formatItemMetaLine(item, config.metadataFields),
        badges: config.metadataFields.tags ? formatCategoryBadges(item) : [],
        page: item.page,
        locStart: item.locStart,
        locEnd: item.locEnd
      });
    }

    if (filteredItems.length > 0) {
      sections.push({
        id: sec.id,
        title: sec.title,
        items: filteredItems
      });
    }
  }

  const bookmarks = config.includeBookmarks
    ? (book.bookmarks || []).map((bm, i) => ({
        index: i + 1,
        metaLine: formatItemMetaLine(bm, { page: true, location: true, date: config.metadataFields.date })
      }))
    : [];

  const dateRangeStr = (() => {
    if (!book.firstTimestamp && !book.lastTimestamp) return null;
    const fmt = (ts) =>
      new Date(ts).toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric' });
    if (book.firstTimestamp && book.lastTimestamp) {
      const s1 = fmt(book.firstTimestamp);
      const s2 = fmt(book.lastTimestamp);
      return s1 === s2 ? s1 : `${s1} — ${s2}`;
    }
    return fmt(book.lastTimestamp || book.firstTimestamp);
  })();

  return {
    title: book.cleanTitle || book.title,
    rawTitle: book.rawTitle,
    author: book.author,
    isSideloaded: book.isSideloaded,
    epubMatchedFile: book.epubMatchedFile,
    dateRangeStr,
    stats: {
      highlights: exportedHighlightsCount,
      notes: exportedNotesCount,
      bookmarks: bookmarks.length,
      removedDuplicates: book.removedDuplicatesCount || 0
    },
    config,
    executiveNotes: config.includeExecutiveSummary ? executiveNotes : [],
    sections,
    bookmarks
  };
}


// === MODULE: src/exporters/markdownExporter.js ===
/**
 * @fileoverview Markdown (.md) Exporter for Kindle Study Notes.
 * Compatible with Obsidian, Notion, Logseq, and standard Markdown viewers.
 */

/**
 * Generates a complete Markdown document string for a book.
 * @param {Object} book
 * @param {Object} userConfig
 * @returns {string}
 */
function generateMarkdownDocument(book, userConfig = {}) {
  const model = buildBookExportModel(book, userConfig);
  const { config } = model;
  const lines = [];

  // Title & Author Header
  lines.push(`# 📖 ${model.title}`);
  lines.push(`**Autor:** ${model.author}`);
  if (model.dateRangeStr) {
    lines.push(`**Periodo de lectura:** ${model.dateRangeStr}`);
  }
  if (model.epubMatchedFile) {
    lines.push(`**Estructura de capítulos:** Extraída de \`${model.epubMatchedFile}\``);
  }
  lines.push('');

  // Stats Header
  if (config.includeStatsHeader) {
    const statParts = [
      `**Resaltados:** ${model.stats.highlights}`,
      `**Notas personales:** ${model.stats.notes}`
    ];
    if (model.stats.removedDuplicates > 0) {
      statParts.push(`**Duplicados depurados:** ${model.stats.removedDuplicates}`);
    }
    if (config.includeBookmarks && model.stats.bookmarks > 0) {
      statParts.push(`**Marcadores:** ${model.stats.bookmarks}`);
    }
    lines.push(`> 📊 ${statParts.join('  |  ')}`);
    lines.push('');
  }

  // Executive Summary of Personal Notes & Study Questions
  if (model.executiveNotes.length > 0) {
    lines.push('## 💡 Resumen de Mis Notas y Preguntas de Estudio');
    lines.push('');
    for (const en of model.executiveNotes) {
      const icon = en.isQuestion ? '❓' : '📝';
      const metaSuffix = en.meta ? ` *(${en.meta})*` : '';
      lines.push(`- ${icon} **${en.noteText}**${metaSuffix}`);
      if (en.quoteSnippet) {
        lines.push(`  > *"${en.quoteSnippet}"*`);
      }
    }
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  // Sections & Study Items
  for (const section of model.sections) {
    if (section.title) {
      lines.push(`## 📑 ${section.title}`);
      lines.push('');
    }

    for (let idx = 0; idx < section.items.length; idx++) {
      const item = section.items[idx];
      const badgeStr =
        item.badges && item.badges.length > 0
          ? ' ' + item.badges.map((b) => `\`${b.label}\``).join(' ')
          : '';

      const numPrefix = config.separatorStyle === 'numbered_list' ? `**#${item.number}** ` : '';
      const metaHeader = item.metaLine ? `*${item.metaLine}*` : '';

      if (config.separatorStyle === 'callout_card') {
        if (numPrefix || metaHeader || badgeStr) {
          lines.push(`> ${numPrefix}${metaHeader}${badgeStr}`);
          lines.push('>');
        }
        if (item.quoteText) {
          const quoteLines = item.quoteText.split('\n');
          for (const ql of quoteLines) {
            lines.push(`> ${ql}`);
          }
        }
        if (item.notes && item.notes.length > 0) {
          for (const n of item.notes) {
            lines.push('>');
            lines.push(`> 💡 **Mi Nota:** ${n.text}`);
          }
        }
        lines.push('');
      } else if (config.separatorStyle === 'numbered_list') {
        lines.push(`### Nota #${item.number}${ item.metaLine ? ` — ${item.metaLine}` : '' }${badgeStr}`);
        if (item.quoteText) {
          lines.push(`> ${item.quoteText.replace(/\n/g, '\n> ')}`);
        }
        if (item.notes && item.notes.length > 0) {
          for (const n of item.notes) {
            lines.push('');
            lines.push(`- 💡 **Mi Nota:** ${n.text}`);
          }
        }
        lines.push('');
      } else {
        // divider_line or minimal_space
        if (metaHeader || badgeStr) {
          lines.push(`${metaHeader}${badgeStr}`);
        }
        if (item.quoteText) {
          lines.push(item.quoteText);
        }
        if (item.notes && item.notes.length > 0) {
          for (const n of item.notes) {
            lines.push(`*💡 Mi Nota:* **${n.text}**`);
          }
        }
        lines.push('');
        if (config.separatorStyle === 'divider_line' && idx < section.items.length - 1) {
          lines.push('---');
          lines.push('');
        }
      }
    }
  }

  // Optional Bookmarks Appendix
  if (model.bookmarks.length > 0) {
    lines.push('---');
    lines.push('');
    lines.push('## 📌 Marcadores de Página Guardados');
    lines.push('');
    for (const bm of model.bookmarks) {
      lines.push(`- 📌 Marcador #${bm.index}: ${bm.metaLine}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}


// === MODULE: src/exporters/zipWriter.js ===
/**
 * @fileoverview Zero-dependency in-memory ZIP archive builder (PKZIP / OOXML compatible).
 * Used to construct Microsoft Word (.docx) files natively in the browser without external packages.
 */

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

/**
 * Computes standard CRC-32 checksum for a Uint8Array.
 * @param {Uint8Array} bytes
 */
function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Creates a standard ZIP archive buffer from a list of { name, content } entries.
 * @param {Array<{ name: string, data: string | Uint8Array }>} entries
 * @returns {Uint8Array}
 */
function buildZipArchive(entries) {
  const encoder = new TextEncoder();
  const fileRecords = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const dataBytes =
      typeof entry.data === 'string' ? encoder.encode(entry.data) : entry.data;
    const crc = crc32(dataBytes);
    const size = dataBytes.length;

    // Local File Header (30 bytes + nameBytes.length)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true); // Signature
    lv.setUint16(4, 20, true); // Version needed (2.0)
    lv.setUint16(6, 0x0800, true); // UTF-8 filename flag
    lv.setUint16(8, 0, true); // Store method (0)
    lv.setUint16(10, 0, true); // Mod time
    lv.setUint16(12, 0x21, true); // Mod date
    lv.setUint32(14, crc, true); // CRC-32
    lv.setUint32(18, size, true); // Compressed size
    lv.setUint32(22, size, true); // Uncompressed size
    lv.setUint16(26, nameBytes.length, true); // Filename length
    lv.setUint16(28, 0, true); // Extra length
    localHeader.set(nameBytes, 30);

    fileRecords.push({
      nameBytes,
      dataBytes,
      crc,
      size,
      localHeader,
      localOffset: offset
    });

    offset += localHeader.length + size;
  }

  // Central Directory
  const centralHeaders = [];
  let centralSize = 0;

  for (const rec of fileRecords) {
    const cdHeader = new Uint8Array(46 + rec.nameBytes.length);
    const cv = new DataView(cdHeader.buffer);
    cv.setUint32(0, 0x02014b50, true); // Central file header signature
    cv.setUint16(4, 20, true); // Version made by
    cv.setUint16(6, 20, true); // Version needed
    cv.setUint16(8, 0x0800, true); // UTF-8 flag
    cv.setUint16(10, 0, true); // Store method
    cv.setUint16(12, 0, true); // Mod time
    cv.setUint16(14, 0x21, true); // Mod date
    cv.setUint32(16, rec.crc, true); // CRC-32
    cv.setUint32(20, rec.size, true); // Compressed size
    cv.setUint32(24, rec.size, true); // Uncompressed size
    cv.setUint16(28, rec.nameBytes.length, true); // Filename length
    cv.setUint16(30, 0, true); // Extra field length
    cv.setUint16(32, 0, true); // Comment length
    cv.setUint16(34, 0, true); // Disk number
    cv.setUint16(36, 0, true); // Internal attrs
    cv.setUint32(38, 0, true); // External attrs
    cv.setUint32(42, rec.localOffset, true); // Relative offset of local header
    cdHeader.set(rec.nameBytes, 46);

    centralHeaders.push(cdHeader);
    centralSize += cdHeader.length;
  }

  // End of Central Directory Record (22 bytes)
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); // EOCD signature
  ev.setUint16(4, 0, true); // Disk number
  ev.setUint16(6, 0, true); // Disk with central dir
  ev.setUint16(8, fileRecords.length, true); // Entries on this disk
  ev.setUint16(10, fileRecords.length, true); // Total entries
  ev.setUint32(12, centralSize, true); // Size of central directory
  ev.setUint32(16, offset, true); // Offset of central directory
  ev.setUint16(20, 0, true); // Comment length

  // Combine all buffers
  const totalLength = offset + centralSize + eocd.length;
  const output = new Uint8Array(totalLength);
  let writePtr = 0;

  for (const rec of fileRecords) {
    output.set(rec.localHeader, writePtr);
    writePtr += rec.localHeader.length;
    output.set(rec.dataBytes, writePtr);
    writePtr += rec.dataBytes.length;
  }

  for (const cd of centralHeaders) {
    output.set(cd, writePtr);
    writePtr += cd.length;
  }

  output.set(eocd, writePtr);
  return output;
}


// === MODULE: src/exporters/docxExporter.js ===
/**
 * @fileoverview Native Microsoft Word (.docx / Office Open XML) Exporter.
 * Generates richly styled Word documents with real Heading styles (for Word Navigation Pane),
 * quote borders, personal note callout boxes, and metadata headers. Zero external dependencies.
 */


/**
 * Escapes text for safe inclusion inside OOXML (<w:t>).
 * Strips control characters forbidden by XML 1.0 specification.
 * @param {string} str
 */
function escapeXml(str) {
  return String(str || '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildContentTypesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`;
}

function buildRootRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`;
}

function buildDocumentRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

function buildCorePropsXml(title, author) {
  const isoNow = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escapeXml(title)}</dc:title>
  <dc:creator>${escapeXml(author)}</dc:creator>
  <cp:lastModifiedBy>Kindle Notes Organizer</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${isoNow}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${isoNow}</dcterms:modified>
</cp:coreProperties>`;
}

function buildStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>
        <w:sz w:val="22"/>
        <w:szCs w:val="22"/>
        <w:color w:val="1E293B"/>
        <w:lang w:val="es-ES"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr>
        <w:spacing w:after="120" w:line="276" w:lineRule="auto"/>
      </w:pPr>
    </w:pPrDefault>
  </w:docDefaults>

  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
  </w:style>

  <w:style w:type="paragraph" w:styleId="Title">
    <w:name w:val="Title"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
    <w:pPr>
      <w:spacing w:before="0" w:after="80"/>
    </w:pPr>
    <w:rPr>
      <w:b/>
      <w:color w:val="0F172A"/>
      <w:sz w:val="44"/>
      <w:szCs w:val="44"/>
    </w:rPr>
  </w:style>

  <w:style w:type="paragraph" w:styleId="Subtitle">
    <w:name w:val="Subtitle"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
    <w:pPr>
      <w:spacing w:before="0" w:after="200"/>
    </w:pPr>
    <w:rPr>
      <w:i/>
      <w:color w:val="475569"/>
      <w:sz w:val="24"/>
      <w:szCs w:val="24"/>
    </w:rPr>
  </w:style>

  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:qFormat/>
    <w:pPr>
      <w:keepNext/>
      <w:spacing w:before="320" w:after="140"/>
      <w:pBdr>
        <w:bottom w:val="single" w:sz="8" w:space="4" w:color="CBD5E1"/>
      </w:pBdr>
      <w:outlineLvl w:val="0"/>
    </w:pPr>
    <w:rPr>
      <w:b/>
      <w:color w:val="1E3A8A"/>
      <w:sz w:val="30"/>
      <w:szCs w:val="30"/>
    </w:rPr>
  </w:style>

  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:qFormat/>
    <w:pPr>
      <w:keepNext/>
      <w:spacing w:before="200" w:after="80"/>
      <w:outlineLvl w:val="1"/>
    </w:pPr>
    <w:rPr>
      <w:b/>
      <w:color w:val="334155"/>
      <w:sz w:val="24"/>
      <w:szCs w:val="24"/>
    </w:rPr>
  </w:style>
</w:styles>`;
}

/**
 * Helper to create a Word paragraph with custom properties and runs.
 */
function createParagraph({ styleId = null, pPrXml = '', runs = [] }) {
  const styleTag = styleId ? `<w:pStyle w:val="${styleId}"/>` : '';
  const pPr = styleTag || pPrXml ? `<w:pPr>${styleTag}${pPrXml}</w:pPr>` : '';

  const runsXml = runs
    .map((r) => {
      const rPrParts = [];
      if (r.bold) rPrParts.push('<w:b/>');
      if (r.italic) rPrParts.push('<w:i/>');
      if (r.color) rPrParts.push(`<w:color w:val="${r.color}"/>`);
      if (r.size) rPrParts.push(`<w:sz w:val="${r.size}"/><w:szCs w:val="${r.size}"/>`);
      if (r.font) {
        rPrParts.push(
          `<w:rFonts w:ascii="${r.font}" w:hAnsi="${r.font}" w:cs="${r.font}"/>`
        );
      }
      if (r.highlight) {
        rPrParts.push(`<w:shd w:val="clear" w:color="auto" w:fill="${r.highlight}"/>`);
      }
      const rPr = rPrParts.length > 0 ? `<w:rPr>${rPrParts.join('')}</w:rPr>` : '';

      const lines = String(r.text || '').split('\n');
      const textParts = lines.map(
        (line, i) =>
          `${i > 0 ? '<w:br/>' : ''}<w:t xml:space="preserve">${escapeXml(line)}</w:t>`
      );
      return `<w:r>${rPr}${textParts.join('')}</w:r>`;
    })
    .join('');

  return `<w:p>${pPr}${runsXml}</w:p>`;
}

/**
 * Generates a binary Microsoft Word (.docx) Uint8Array for a book.
 * @param {Object} book
 * @param {Object} userConfig
 * @returns {Uint8Array}
 */
function generateDocxDocument(book, userConfig = {}) {
  const model = buildBookExportModel(book, userConfig);
  const { config } = model;
  const bodyParts = [];

  // 1. Document Title & Author
  bodyParts.push(
    createParagraph({
      styleId: 'Title',
      runs: [{ text: model.title }]
    })
  );

  const subRuns = [{ text: `Autor: ${model.author}`, italic: true, color: '475569', size: 24 }];
  if (model.dateRangeStr) {
    subRuns.push({ text: `   |   Lectura: ${model.dateRangeStr}`, italic: true, color: '64748B', size: 20 });
  }
  bodyParts.push(
    createParagraph({
      styleId: 'Subtitle',
      runs: subRuns
    })
  );

  // 2. Stats Banner Box
  if (config.includeStatsHeader) {
    const statsRuns = [
      { text: 'RESUMEN DE ANOTACIONES:  ', bold: true, color: '1E3A8A', size: 19 },
      { text: `${model.stats.highlights} resaltados`, bold: true, color: '0F172A', size: 19 },
      { text: `   •   ${model.stats.notes} notas personales`, bold: true, color: '0F172A', size: 19 }
    ];
    if (model.stats.removedDuplicates > 0) {
      statsRuns.push({
        text: `   •   ${model.stats.removedDuplicates} duplicados eliminados`,
        color: '047857',
        size: 19
      });
    }
    if (config.includeBookmarks && model.stats.bookmarks > 0) {
      statsRuns.push({
        text: `   •   ${model.stats.bookmarks} marcadores`,
        color: '475569',
        size: 19
      });
    }

    bodyParts.push(
      createParagraph({
        pPrXml: `
          <w:pBdr>
            <w:top w:val="single" w:sz="4" w:space="6" w:color="CBD5E1"/>
            <w:left w:val="single" w:sz="18" w:space="10" w:color="2563EB"/>
            <w:bottom w:val="single" w:sz="4" w:space="6" w:color="CBD5E1"/>
            <w:right w:val="single" w:sz="4" w:space="6" w:color="CBD5E1"/>
          </w:pBdr>
          <w:shd w:val="clear" w:color="auto" w:fill="F8FAFC"/>
          <w:spacing w:before="80" w:after="240"/>
        `,
        runs: statsRuns
      })
    );
  }

  // 3. Executive Summary of Personal Notes & Study Questions
  if (model.executiveNotes.length > 0) {
    bodyParts.push(
      createParagraph({
        styleId: 'Heading1',
        runs: [{ text: '💡 Mis Notas Personales y Preguntas de Estudio' }]
      })
    );

    for (const en of model.executiveNotes) {
      const prefix = en.isQuestion ? '❓ PREGUNTA: ' : '📝 NOTA: ';
      const runs = [
        { text: prefix, bold: true, color: en.isQuestion ? 'B45309' : '1D4ED8', size: 21 },
        { text: en.noteText, bold: true, color: '0F172A', size: 21 }
      ];
      if (en.meta) {
        runs.push({ text: `  (${en.meta})`, italic: true, color: '64748B', size: 18 });
      }
      if (en.quoteSnippet) {
        runs.push({
          text: `\nCita relacionada: "${en.quoteSnippet}"`,
          italic: true,
          color: '475569',
          size: 19
        });
      }

      bodyParts.push(
        createParagraph({
          pPrXml: `
            <w:pBdr>
              <w:left w:val="single" w:sz="16" w:space="8" w:color="${en.isQuestion ? 'F59E0B' : '3B82F6'}"/>
            </w:pBdr>
            <w:shd w:val="clear" w:color="auto" w:fill="${en.isQuestion ? 'FFFBEB' : 'EFF6FF'}"/>
            <w:ind w:left="160" w:right="160"/>
            <w:spacing w:before="80" w:after="120"/>
          `,
          runs
        })
      );
    }
  }

  // 4. Main Chapter / Section Hierarchy
  for (const section of model.sections) {
    if (section.title) {
      bodyParts.push(
        createParagraph({
          styleId: 'Heading1',
          runs: [{ text: section.title }]
        })
      );
    }

    for (let idx = 0; idx < section.items.length; idx++) {
      const item = section.items[idx];

      // Metadata + Number + Badges Header Line
      const metaRuns = [];
      if (config.separatorStyle === 'numbered_list') {
        metaRuns.push({ text: `#${item.number}  `, bold: true, color: '2563EB', size: 19 });
      }
      if (item.metaLine) {
        metaRuns.push({ text: item.metaLine, bold: true, color: '64748B', size: 18 });
      }
      if (item.badges && item.badges.length > 0) {
        for (const b of item.badges) {
          metaRuns.push({
            text: `   [${b.label}]`,
            bold: true,
            color: b.code === 'duda' ? 'B45309' : '4338CA',
            size: 18
          });
        }
      }

      const isCallout = config.separatorStyle === 'callout_card';
      const quoteBorderXml = isCallout
        ? `
          <w:pBdr>
            <w:left w:val="single" w:sz="18" w:space="10" w:color="4F46E5"/>
          </w:pBdr>
          <w:shd w:val="clear" w:color="auto" w:fill="F8FAFC"/>
          <w:ind w:left="200" w:right="120"/>
        `
        : `<w:ind w:left="120"/>`;

      if (metaRuns.length > 0) {
        bodyParts.push(
          createParagraph({
            pPrXml: `
              ${quoteBorderXml}
              <w:keepNext/>
              <w:spacing w:before="140" w:after="40"/>
            `,
            runs: metaRuns
          })
        );
      }

      // Highlighted Quote Paragraph
      if (item.quoteText) {
        bodyParts.push(
          createParagraph({
            pPrXml: `
              ${quoteBorderXml}
              <w:spacing w:before="20" w:after="${item.notes && item.notes.length > 0 ? '60' : '160'}"/>
            `,
            runs: [
              {
                text: item.quoteText,
                font: 'Georgia',
                color: '0F172A',
                size: 22
              }
            ]
          })
        );
      }

      // Attached Personal Notes
      if (item.notes && item.notes.length > 0) {
        for (const n of item.notes) {
          bodyParts.push(
            createParagraph({
              pPrXml: `
                <w:pBdr>
                  <w:left w:val="single" w:sz="18" w:space="10" w:color="F59E0B"/>
                </w:pBdr>
                <w:shd w:val="clear" w:color="auto" w:fill="FFFBEB"/>
                <w:ind w:left="340" w:right="140"/>
                <w:spacing w:before="40" w:after="160"/>
              `,
              runs: [
                { text: '💡 Mi Nota: ', bold: true, color: 'B45309', size: 21 },
                { text: n.text, bold: false, color: '78350F', size: 21 }
              ]
            })
          );
        }
      }

      // Horizontal Divider Line when 'divider_line' style is chosen
      if (config.separatorStyle === 'divider_line' && idx < section.items.length - 1) {
        bodyParts.push(
          createParagraph({
            pPrXml: `
              <w:pBdr>
                <w:bottom w:val="single" w:sz="6" w:space="4" w:color="E2E8F0"/>
              </w:pBdr>
              <w:spacing w:before="40" w:after="120"/>
            `,
            runs: []
          })
        );
      }
    }
  }

  // 5. Optional Bookmarks Appendix
  if (model.bookmarks.length > 0) {
    bodyParts.push(
      createParagraph({
        styleId: 'Heading1',
        runs: [{ text: '📌 Marcadores de Página Guardados' }]
      })
    );
    for (const bm of model.bookmarks) {
      bodyParts.push(
        createParagraph({
          runs: [
            { text: `• Marcador #${bm.index}: `, bold: true, color: '334155', size: 20 },
            { text: bm.metaLine, color: '64748B', size: 20 }
          ]
        })
      );
    }
  }

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${bodyParts.join('\n    ')}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  return buildZipArchive([
    { name: '[Content_Types].xml', data: buildContentTypesXml() },
    { name: '_rels/.rels', data: buildRootRelsXml() },
    { name: 'word/_rels/document.xml.rels', data: buildDocumentRelsXml() },
    { name: 'word/styles.xml', data: buildStylesXml() },
    { name: 'docProps/core.xml', data: buildCorePropsXml(model.title, model.author) },
    { name: 'word/document.xml', data: documentXml }
  ]);
}


// === MODULE: src/exporters/pdfExporter.js ===
/**
 * @fileoverview Native Binary PDF 1.4 Generator + High-Resolution Print Helper.
 * Generates multi-page vector PDF documents with full Spanish WinAnsiEncoding support,
 * colored quote accent bars, shaded personal note callouts, and page numbering.
 * Zero external dependencies.
 */

/**
 * Special Unicode -> Windows-1252 (WinAnsiEncoding) byte mapping for range 0x80 - 0x9F.
 * Characters 0xA0 - 0xFF in Unicode Latin-1 Supplement match Windows-1252 directly.
 */
const WIN_ANSI_SPECIAL_MAP = new Map([
  [0x20ac, 0x80], // €
  [0x201a, 0x82], // ‚
  [0x0192, 0x83], // ƒ
  [0x201e, 0x84], // „
  [0x2026, 0x85], // …
  [0x2020, 0x86], // †
  [0x2021, 0x87], // ‡
  [0x02c6, 0x88], // ˆ
  [0x2030, 0x89], // ‰
  [0x0160, 0x8a], // Š
  [0x2039, 0x8b], // ‹
  [0x0152, 0x8c], // Œ
  [0x017d, 0x8e], // Ž
  [0x2018, 0x91], // ‘
  [0x2019, 0x92], // ’
  [0x201c, 0x93], // “
  [0x201d, 0x94], // ”
  [0x2022, 0x95], // •
  [0x2013, 0x96], // –
  [0x2014, 0x97], // —
  [0x02dc, 0x98], // ˜
  [0x2122, 0x99], // ™
  [0x0161, 0x9a], // š
  [0x203a, 0x9b], // ›
  [0x0153, 0x9c], // œ
  [0x017e, 0x9e], // ž
  [0x0178, 0x9f]  // Ÿ
]);

/**
 * Sanitizes emojis and encodes Unicode text into a PDF literal string (...) using WinAnsiEncoding.
 * @param {string} str
 */
function encodePdfWinAnsiString(str) {
  const clean = String(str || '')
    .replace(/❓/g, '[PREGUNTA] ')
    .replace(/🔗/g, '[REF] ')
    .replace(/💡/g, '[NOTA] ')
    .replace(/📝/g, '[NOTA] ')
    .replace(/📖/g, '')
    .replace(/📑/g, '')
    .replace(/📌/g, '* ')
    .replace(/📊/g, '');

  let out = '(';
  for (let i = 0; i < clean.length; i++) {
    const code = clean.charCodeAt(i);
    if (code === 0x28) {
      out += '\\(';
    } else if (code === 0x29) {
      out += '\\)';
    } else if (code === 0x5c) {
      out += '\\\\';
    } else if (code >= 0x20 && code <= 0x7e) {
      out += clean[i];
    } else if (WIN_ANSI_SPECIAL_MAP.has(code)) {
      const byte = WIN_ANSI_SPECIAL_MAP.get(code);
      out += '\\' + byte.toString(8).padStart(3, '0');
    } else if (code >= 0xa0 && code <= 0xff) {
      out += '\\' + code.toString(8).padStart(3, '0');
    } else if (code > 0xff) {
      // Fallback for rare characters outside WinAnsi
      out += '?';
    }
  }
  out += ')';
  return out;
}

/**
 * Word-wraps a string into lines of maximum `maxChars` characters.
 * @param {string} text
 * @param {number} maxChars
 * @returns {string[]}
 */
function wrapTextLines(text, maxChars = 85) {
  const paragraphs = String(text || '').split('\n');
  const wrapped = [];

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) {
      wrapped.push('');
      continue;
    }
    const words = trimmed.split(/\s+/);
    let currentLine = '';

    for (const word of words) {
      if (!currentLine) {
        currentLine = word;
      } else if (currentLine.length + 1 + word.length <= maxChars) {
        currentLine += ' ' + word;
      } else {
        wrapped.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) wrapped.push(currentLine);
  }

  return wrapped;
}

/**
 * Generates a binary PDF-1.4 document (Uint8Array) for a book.
 * @param {Object} book
 * @param {Object} userConfig
 * @returns {Uint8Array}
 */
function generatePdfDocument(book, userConfig = {}) {
  const model = buildBookExportModel(book, userConfig);
  const { config } = model;

  const PAGE_W = 595.28; // A4 width in pt
  const PAGE_H = 841.89; // A4 height in pt
  const MARGIN_L = 52;
  const MARGIN_R = 52;
  const MARGIN_TOP = 58;
  const MARGIN_BOTTOM = 58;
  const CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R;

  const pagesOps = [];
  let currentOps = [];
  let cursorY = PAGE_H - MARGIN_TOP;

  const startNewPage = () => {
    if (currentOps.length > 0) {
      pagesOps.push(currentOps);
    }
    currentOps = [];
    cursorY = PAGE_H - MARGIN_TOP;
  };

  const ensureSpace = (neededHeight) => {
    if (cursorY - neededHeight < MARGIN_BOTTOM) {
      startNewPage();
    }
  };

  const drawTextLine = (text, x, y, fontRef = '/F1', fontSize = 10.5, rgb = [0.12, 0.16, 0.23]) => {
    currentOps.push(
      `BT ${fontRef} ${fontSize} Tf ${rgb[0].toFixed(2)} ${rgb[1].toFixed(2)} ${rgb[2].toFixed(2)} rg ${x.toFixed(2)} ${y.toFixed(2)} Td ${encodePdfWinAnsiString(text)} Tj ET`
    );
  };

  const drawRectFill = (x, y, w, h, rgb) => {
    currentOps.push(
      `${rgb[0].toFixed(2)} ${rgb[1].toFixed(2)} ${rgb[2].toFixed(2)} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`
    );
  };

  const drawLine = (x1, y1, x2, y2, lineWidth = 0.6, rgb = [0.82, 0.85, 0.90]) => {
    currentOps.push(
      `${lineWidth.toFixed(2)} w ${rgb[0].toFixed(2)} ${rgb[1].toFixed(2)} ${rgb[2].toFixed(2)} RG ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`
    );
  };

  // --- Title Block ---
  const titleLines = wrapTextLines(model.title, 48);
  for (const tl of titleLines) {
    ensureSpace(26);
    drawTextLine(tl, MARGIN_L, cursorY, '/F2', 18, [0.06, 0.09, 0.16]);
    cursorY -= 23;
  }

  ensureSpace(20);
  const subtitleText = `Autor: ${model.author}${model.dateRangeStr ? `   |   Lectura: ${model.dateRangeStr}` : ''}`;
  drawTextLine(subtitleText, MARGIN_L, cursorY, '/F3', 11, [0.28, 0.33, 0.41]);
  cursorY -= 18;

  // --- Stats Banner ---
  if (config.includeStatsHeader) {
    ensureSpace(34);
    const boxH = 24;
    const boxY = cursorY - boxH + 6;
    drawRectFill(MARGIN_L, boxY, CONTENT_W, boxH, [0.95, 0.96, 0.98]);
    drawRectFill(MARGIN_L, boxY, 3.5, boxH, [0.15, 0.39, 0.92]);

    let statsLine = `Resaltados: ${model.stats.highlights}   |   Notas personales: ${model.stats.notes}`;
    if (model.stats.removedDuplicates > 0) {
      statsLine += `   |   Duplicados eliminados: ${model.stats.removedDuplicates}`;
    }
    drawTextLine(statsLine, MARGIN_L + 12, boxY + 8, '/F2', 9.5, [0.12, 0.23, 0.54]);
    cursorY -= 34;
  }

  // --- Executive Summary of Personal Notes ---
  if (model.executiveNotes.length > 0) {
    ensureSpace(36);
    drawTextLine('MIS NOTAS PERSONALES Y PREGUNTAS DE ESTUDIO', MARGIN_L, cursorY, '/F2', 12, [0.12, 0.23, 0.54]);
    drawLine(MARGIN_L, cursorY - 5, PAGE_W - MARGIN_R, cursorY - 5, 0.8, [0.75, 0.81, 0.89]);
    cursorY -= 20;

    for (const en of model.executiveNotes) {
      const headText = `${en.isQuestion ? '[PREGUNTA]' : '[NOTA]'} ${en.noteText}${en.meta ? ` (${en.meta})` : ''}`;
      const noteLines = wrapTextLines(headText, 82);
      const blockH = noteLines.length * 13 + 8;
      ensureSpace(blockH + 8);

      const boxBottom = cursorY - blockH + 8;
      drawRectFill(MARGIN_L, boxBottom, CONTENT_W, blockH, en.isQuestion ? [1.0, 0.98, 0.92] : [0.94, 0.96, 1.0]);
      drawRectFill(MARGIN_L, boxBottom, 3, blockH, en.isQuestion ? [0.96, 0.62, 0.04] : [0.23, 0.51, 0.96]);

      for (const nl of noteLines) {
        drawTextLine(nl, MARGIN_L + 10, cursorY - 2, '/F2', 9.5, [0.15, 0.20, 0.30]);
        cursorY -= 13;
      }
      cursorY -= 8;
    }
    cursorY -= 8;
  }

  // --- Sections & Study Items ---
  for (const section of model.sections) {
    if (section.title) {
      ensureSpace(40);
      cursorY -= 6;
      const secLines = wrapTextLines(section.title.toUpperCase(), 65);
      for (const sl of secLines) {
        drawTextLine(sl, MARGIN_L, cursorY, '/F2', 12.5, [0.12, 0.23, 0.54]);
        cursorY -= 16;
      }
      drawLine(MARGIN_L, cursorY + 8, PAGE_W - MARGIN_R, cursorY + 8, 0.9, [0.75, 0.82, 0.90]);
      cursorY -= 8;
    }

    for (let idx = 0; idx < section.items.length; idx++) {
      const item = section.items[idx];
      const quoteLines = item.quoteText ? wrapTextLines(item.quoteText, 82) : [];
      const metaPrefix =
        (config.separatorStyle === 'numbered_list' ? `#${item.number}  ` : '') +
        (item.metaLine || '') +
        (item.badges && item.badges.length > 0
          ? '  ' + item.badges.map((b) => `[${b.label}]`).join(' ')
          : '');

      const estimatedHeight =
        (metaPrefix ? 14 : 0) +
        quoteLines.length * 14 +
        (item.notes ? item.notes.length * 26 : 0) +
        14;
      ensureSpace(Math.min(180, estimatedHeight));

      const blockTopY = cursorY + 8;
      const indentX = config.separatorStyle === 'callout_card' ? MARGIN_L + 11 : MARGIN_L;

      if (metaPrefix) {
        drawTextLine(metaPrefix, indentX, cursorY, '/F2', 8.5, [0.39, 0.45, 0.55]);
        cursorY -= 13;
      }

      for (const ql of quoteLines) {
        if (cursorY < MARGIN_BOTTOM + 16) {
          startNewPage();
        }
        drawTextLine(ql, indentX, cursorY, '/F1', 10.5, [0.08, 0.11, 0.18]);
        cursorY -= 14;
      }

      const blockBottomY = cursorY + 8;
      if (config.separatorStyle === 'callout_card' && blockTopY > blockBottomY) {
        drawRectFill(MARGIN_L, blockBottomY, 3, blockTopY - blockBottomY, [0.31, 0.27, 0.90]);
      }

      // Attached Personal Notes
      if (item.notes && item.notes.length > 0) {
        for (const n of item.notes) {
          const nLines = wrapTextLines(`Mi Nota: ${n.text}`, 76);
          const nBoxH = nLines.length * 13 + 8;
          ensureSpace(nBoxH + 6);

          const nBoxBottom = cursorY - nBoxH + 9;
          drawRectFill(indentX + 4, nBoxBottom, CONTENT_W - (indentX - MARGIN_L) - 4, nBoxH, [1.0, 0.98, 0.92]);
          drawRectFill(indentX + 4, nBoxBottom, 3, nBoxH, [0.96, 0.62, 0.04]);

          for (const nl of nLines) {
            drawTextLine(nl, indentX + 13, cursorY - 1, '/F2', 9.5, [0.47, 0.21, 0.06]);
            cursorY -= 13;
          }
          cursorY -= 6;
        }
      }

      if (config.separatorStyle === 'divider_line' && idx < section.items.length - 1) {
        drawLine(MARGIN_L, cursorY + 2, PAGE_W - MARGIN_R, cursorY + 2, 0.5, [0.88, 0.91, 0.94]);
        cursorY -= 12;
      } else {
        cursorY -= 8;
      }
    }
  }

  // --- Optional Bookmarks Appendix ---
  if (model.bookmarks.length > 0) {
    ensureSpace(45);
    drawTextLine('MARCADORES DE PÁGINA GUARDADOS', MARGIN_L, cursorY, '/F2', 12, [0.12, 0.23, 0.54]);
    cursorY -= 16;
    for (const bm of model.bookmarks) {
      ensureSpace(16);
      drawTextLine(`* Marcador #${bm.index}: ${bm.metaLine}`, MARGIN_L + 6, cursorY, '/F1', 9.5, [0.30, 0.35, 0.42]);
      cursorY -= 13;
    }
  }

  if (currentOps.length > 0 || pagesOps.length === 0) {
    pagesOps.push(currentOps);
  }

  // Add running header and page footer ("Página X de Y") to every page
  const totalPages = pagesOps.length;
  const shortHeaderTitle =
    model.title.length > 65 ? model.title.slice(0, 62) + '...' : model.title;

  for (let p = 0; p < totalPages; p++) {
    const ops = pagesOps[p];
    if (p > 0) {
      ops.unshift(
        `BT /F3 8.5 Tf 0.45 0.50 0.58 rg ${MARGIN_L} ${(PAGE_H - 34).toFixed(2)} Td ${encodePdfWinAnsiString(shortHeaderTitle)} Tj ET`
      );
    }
    const footerText = `Página ${p + 1} de ${totalPages}  —  Kindle Notes Organizer`;
    ops.push(
      `BT /F1 8.5 Tf 0.45 0.50 0.58 rg ${MARGIN_L} 28.00 Td ${encodePdfWinAnsiString(footerText)} Tj ET`
    );
  }

  // Assemble PDF-1.4 Objects
  // Object 1: Catalog
  // Object 2: Pages
  // Object 3: Font F1 (Helvetica regular, WinAnsiEncoding)
  // Object 4: Font F2 (Helvetica-Bold, WinAnsiEncoding)
  // Object 5: Font F3 (Helvetica-Oblique, WinAnsiEncoding)
  // Objects 6..(5 + 2*N): Page and Content Stream pairs
  const objects = [];
  const pageObjNums = [];

  for (let p = 0; p < totalPages; p++) {
    pageObjNums.push(6 + p * 2);
  }

  objects.push(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj`);
  objects.push(
    `2 0 obj\n<< /Type /Pages /Kids [${pageObjNums.map((n) => `${n} 0 R`).join(' ')}] /Count ${totalPages} >>\nendobj`
  );
  objects.push(
    `3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj`
  );
  objects.push(
    `4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj`
  );
  objects.push(
    `5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>\nendobj`
  );

  for (let p = 0; p < totalPages; p++) {
    const pageObjId = 6 + p * 2;
    const streamObjId = pageObjId + 1;
    const streamContent = pagesOps[p].join('\n');

    objects.push(
      `${pageObjId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W.toFixed(2)} ${PAGE_H.toFixed(2)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${streamObjId} 0 R >>\nendobj`
    );
    objects.push(
      `${streamObjId} 0 obj\n<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream\nendobj`
    );
  }

  // Serialize to ASCII/Latin1 byte buffer with exact xref offsets
  let pdfStr = '%PDF-1.4\n';
  const offsets = [0];

  for (const objStr of objects) {
    offsets.push(pdfStr.length);
    pdfStr += objStr + '\n';
  }

  const xrefStart = pdfStr.length;
  pdfStr += `xref\n0 ${objects.length + 1}\n`;
  pdfStr += `0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    pdfStr += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }

  pdfStr += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  const bytes = new Uint8Array(pdfStr.length);
  for (let i = 0; i < pdfStr.length; i++) {
    bytes[i] = pdfStr.charCodeAt(i) & 0xff;
  }
  return bytes;
}


// === MODULE: src/ui/app.js ===
/**
 * @fileoverview Main Application Controller for Kindle Notes Organizer.
 * 100% Client-Side, Zero External Dependencies, Sandboxed & Safe.
 */









const STORAGE_CONFIG_KEY = 'kno_user_export_config_v1';
const STORAGE_CUSTOM_TITLES_KEY = 'kno_custom_book_titles_v1';

const state = {
  sourceLabel: 'My Clippings.txt (Proyecto local)',
  rawClippingsText: '',
  parsedEntries: [],
  parsedEpubs: [],
  books: [],
  totalRemovedDuplicates: 0,
  selectedBookKeys: new Set(),
  activeBookKey: null,
  searchQuery: '',
  previewSearchQuery: '',
  catalogFilter: 'all', // 'all' | 'new' | 'updated' | 'up_to_date' | 'epub'
  showSystemClippingsBook: false,
  previewTab: 'document', // 'document' | 'markdown' | 'duplicates'
  destState: null,
  syncSummary: { hasDestination: false, newCount: 0, updatedCount: 0, upToDateCount: 0 },
  customTitles: loadStoredCustomTitles(),
  config: loadStoredConfig(),
  editingBookKey: null
};

function loadStoredConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_CONFIG_KEY);
    if (!raw) return structuredClone(DEFAULT_EXPORT_CONFIG);
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_EXPORT_CONFIG,
      ...parsed,
      formats: { ...DEFAULT_EXPORT_CONFIG.formats, ...(parsed.formats || {}) },
      metadataFields: {
        ...DEFAULT_EXPORT_CONFIG.metadataFields,
        ...(parsed.metadataFields || {})
      }
    };
  } catch {
    return structuredClone(DEFAULT_EXPORT_CONFIG);
  }
}

function saveStoredConfig() {
  try {
    localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(state.config));
  } catch {
    // Ignore storage quota errors
  }
}

function loadStoredCustomTitles() {
  try {
    const raw = localStorage.getItem(STORAGE_CUSTOM_TITLES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveStoredCustomTitles() {
  try {
    localStorage.setItem(STORAGE_CUSTOM_TITLES_KEY, JSON.stringify(state.customTitles));
  } catch {
    // Ignore storage errors
  }
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'toast';
  if (type === 'warning') el.style.borderLeftColor = '#f59e0b';
  if (type === 'error') el.style.borderLeftColor = '#ef4444';
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => {
    el.remove();
  }, 4200);
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Rebuilds the books catalog from state.rawClippingsText and re-applies EPUB chapters + sync status.
 */
function processCurrentClippings(preserveSelection = false) {
  const { parsedEntries } = parseMyClippings(state.rawClippingsText);
  state.parsedEntries = parsedEntries;

  const { books, totalRemovedDuplicates } = buildBooksCatalog(parsedEntries, {
    dedupStrategy: state.config.dedupStrategy,
    customTitles: state.customTitles
  });

  state.books = books;
  state.totalRemovedDuplicates = totalRemovedDuplicates;

  if (state.parsedEpubs.length > 0) {
    attachEpubsToBooks(state.books, state.parsedEpubs);
  }

  state.syncSummary = evaluateBooksSyncStatus(state.books, state.destState);

  const visibleBooks = getVisibleBooks();
  if (!preserveSelection) {
    state.selectedBookKeys.clear();
    for (const b of state.books) {
      if (!b.isSystemClippingsBook) {
        state.selectedBookKeys.add(b.bookKey);
      }
    }
  }

  if (!state.activeBookKey || !state.books.some((b) => b.bookKey === state.activeBookKey)) {
    const firstBook = visibleBooks[0] || state.books[0];
    state.activeBookKey = firstBook ? firstBook.bookKey : null;
  }

  renderAll();
}

function getVisibleBooks() {
  const q = state.searchQuery.trim().toLowerCase();
  return state.books.filter((book) => {
    if (book.isSystemClippingsBook && !state.showSystemClippingsBook) {
      return false;
    }
    if (q) {
      const hay = `${book.cleanTitle} ${book.rawTitle} ${book.author}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    const status = book.syncInfo ? book.syncInfo.status : 'new';
    if (state.catalogFilter === 'new' && status !== 'new') return false;
    if (state.catalogFilter === 'updated' && status !== 'updated') return false;
    if (state.catalogFilter === 'up_to_date' && status !== 'up_to_date') return false;
    if (state.catalogFilter === 'epub' && !book.isSideloaded && !book.epubMatchedFile) return false;
    return true;
  });
}

function renderHeaderStats() {
  const realBooks = state.books.filter((b) => !b.isSystemClippingsBook);
  const totalHl = realBooks.reduce((acc, b) => acc + b.highlightsCount, 0);
  const totalNotes = realBooks.reduce((acc, b) => acc + b.notesCount, 0);

  const headerStats = document.getElementById('header-global-stats');
  if (headerStats) {
    headerStats.textContent = `${realBooks.length} libros  •  ${totalHl} resaltados  •  ${totalNotes} notas  •  ${state.totalRemovedDuplicates} dup. filtrados`;
  }

  const sourceStatusEl = document.getElementById('source-status-desc');
  if (sourceStatusEl) {
    const epubCount = state.parsedEpubs.length;
    sourceStatusEl.textContent = `${state.sourceLabel}${
      epubCount > 0 ? ` (${epubCount} EPUB vinculados)` : ''
    }`;
  }

  const destStatusEl = document.getElementById('dest-status-desc');
  if (destStatusEl) {
    if (!state.destState) {
      destStatusEl.textContent =
        'Descarga directa en navegador o elige carpeta para sincronizar.';
    } else {
      const { newCount, updatedCount, upToDateCount } = state.syncSummary;
      destStatusEl.textContent = `${state.destState.folderName}: ${newCount} nuevos · ${updatedCount} actualizados · ${upToDateCount} al día`;
    }
  }
}

function renderCatalogList() {
  const visibleBooks = getVisibleBooks();
  const realBooks = state.books.filter((b) => !b.isSystemClippingsBook);

  // Filter pill counts
  const countNew = realBooks.filter((b) => b.syncInfo?.status === 'new').length;
  const countUpdated = realBooks.filter((b) => b.syncInfo?.status === 'updated').length;
  const countUpToDate = realBooks.filter((b) => b.syncInfo?.status === 'up_to_date').length;
  const countEpub = realBooks.filter((b) => b.isSideloaded || b.epubMatchedFile).length;

  const pillsContainer = document.getElementById('catalog-filter-pills');
  if (pillsContainer) {
    const pills = [
      { id: 'all', label: `Todos (${realBooks.length})` },
      { id: 'new', label: `Nuevos (${countNew})` },
      { id: 'updated', label: `Actualizados (${countUpdated})` },
      { id: 'up_to_date', label: `Al día (${countUpToDate})` },
      { id: 'epub', label: `EPUB (${countEpub})` }
    ];
    pillsContainer.innerHTML = pills
      .map(
        (p) =>
          `<button type="button" class="filter-pill ${
            state.catalogFilter === p.id ? 'active' : ''
          }" data-filter="${p.id}">${escapeHtml(p.label)}</button>`
      )
      .join('');
  }

  const selectedCountEl = document.getElementById('selected-books-count');
  if (selectedCountEl) {
    selectedCountEl.textContent = `${state.selectedBookKeys.size} de ${realBooks.length} seleccionados`;
  }

  const exportBtnCountEl = document.getElementById('btn-export-selected-label');
  if (exportBtnCountEl) {
    exportBtnCountEl.textContent = `Exportar seleccionados (${state.selectedBookKeys.size})`;
  }

  const listEl = document.getElementById('books-catalog-list');
  if (!listEl) return;

  if (state.books.length === 0) {
    listEl.innerHTML = `
      <div style="padding: 44px 20px; text-align: center; color: #64748b; font-size: 13px;">
        <div style="font-size: 32px; margin-bottom: 8px;">📚</div>
        <div style="font-weight: 600; color: #1e293b; margin-bottom: 6px;">Sin notas cargadas</div>
        <div style="line-height: 1.4;">Carga tu <strong>My Clippings.txt</strong> o selecciona tu unidad Kindle en el Paso 1 para comenzar.</div>
      </div>
    `;
    return;
  }

  if (visibleBooks.length === 0) {
    listEl.innerHTML = `
      <div style="padding: 36px 16px; text-align: center; color: #64748b; font-size: 13px;">
        No hay libros que coincidan con el filtro actual.
      </div>
    `;
    return;
  }

  listEl.innerHTML = visibleBooks
    .map((book) => {
      const isSelected = state.selectedBookKeys.has(book.bookKey);
      const isActive = state.activeBookKey === book.bookKey;
      const sync = book.syncInfo || { status: 'new', deltaHighlights: 0, deltaNotes: 0 };

      let syncBadgeHtml = '';
      if (state.destState) {
        if (sync.status === 'new') {
          syncBadgeHtml = `<span class="badge badge-sync-new">Nuevo</span>`;
        } else if (sync.status === 'updated') {
          const delta = sync.deltaHighlights + sync.deltaNotes;
          const deltaTxt = delta > 0 ? `+${delta} nuevas` : 'En destino';
          syncBadgeHtml = `<span class="badge badge-sync-updated">${escapeHtml(deltaTxt)}</span>`;
        } else {
          syncBadgeHtml = `<span class="badge badge-sync-uptodate">Al día</span>`;
        }
      }

      const epubBadgeHtml = book.epubMatchedFile
        ? `<span class="badge badge-epub" title="Capítulos extraídos de ${escapeHtml(book.epubMatchedFile)}">Capítulos EPUB</span>`
        : book.isSideloaded
          ? `<span class="badge badge-epub">EPUB</span>`
          : '';

      const dupBadgeHtml =
        book.removedDuplicatesCount > 0
          ? `<span class="badge badge-dup" data-action="view-dups" data-book="${escapeHtml(
              book.bookKey
            )}" title="Ver duplicados eliminados">${book.removedDuplicatesCount} dup.</span>`
          : '';

      return `
        <div class="book-item ${isActive ? 'active-book' : ''}" data-book-key="${escapeHtml(book.bookKey)}">
          <input
            type="checkbox"
            class="book-checkbox"
            data-check-book="${escapeHtml(book.bookKey)}"
            ${isSelected ? 'checked' : ''}
            aria-label="Seleccionar ${escapeHtml(book.cleanTitle)}"
          />
          <div class="book-info">
            <div class="book-title-row">
              <div class="book-title">${escapeHtml(book.cleanTitle)}</div>
              <button
                type="button"
                class="btn btn-ghost btn-xs book-edit-btn"
                data-edit-book="${escapeHtml(book.bookKey)}"
                title="Editar título o autor del libro"
                aria-label="Editar título o autor de ${escapeHtml(book.cleanTitle)}"
              >
                <svg class="icon-svg icon-xs" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                </svg>
              </button>
            </div>
            <div class="book-author">${escapeHtml(book.author)}</div>
            <div class="book-badges-row">
              <span class="badge badge-hl">${book.highlightsCount} resaltados</span>
              ${
                book.notesCount > 0
                  ? `<span class="badge badge-note">${book.notesCount} notas</span>`
                  : ''
              }
              ${epubBadgeHtml}
              ${dupBadgeHtml}
              ${syncBadgeHtml}
            </div>
          </div>
        </div>
      `;
    })
    .join('');
}

function renderConfigControls() {
  const { config } = state;

  const setCheck = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.checked = Boolean(val);
  };
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  };

  setCheck('fmt-docx', config.formats.docx);
  setCheck('fmt-md', config.formats.md);
  setCheck('fmt-pdf', config.formats.pdf);

  setVal('cfg-content-filter', config.contentFilter);
  setVal('cfg-grouping-mode', config.groupingMode);
  setVal('cfg-separator-style', config.separatorStyle);
  setVal('cfg-dedup-strategy', config.dedupStrategy);
  setVal('cfg-conflict-policy', config.conflictPolicy);

  setCheck('cfg-meta-page', config.metadataFields.page);
  setCheck('cfg-meta-location', config.metadataFields.location);
  setCheck('cfg-meta-date', config.metadataFields.date);
  setCheck('cfg-meta-tags', config.metadataFields.tags);

  setCheck('cfg-exec-summary', config.includeExecutiveSummary);
  setCheck('cfg-include-bookmarks', config.includeBookmarks);
  setCheck('cfg-author-filename', config.includeAuthorInFilename);
  setCheck('cfg-show-system-book', state.showSystemClippingsBook);

  // Update progressive disclosure summary text in Step 3
  const summaryEl = document.getElementById('config-summary-text');
  if (summaryEl) {
    const activeFormats = [];
    if (config.formats.docx) activeFormats.push('Word');
    if (config.formats.md) activeFormats.push('Markdown');
    if (config.formats.pdf) activeFormats.push('PDF');
    const fmtText = activeFormats.length > 0 ? activeFormats.join(' + ') : 'Sin formato seleccionado';

    const groupMap = {
      chapters: 'Por capítulos',
      by_tag: 'Por tipo de nota',
      continuous: 'Orden continuo'
    };
    const groupText = groupMap[config.groupingMode] || 'Por capítulos';
    summaryEl.textContent = `${fmtText} • ${groupText}`;
  }
}

function renderActiveBookPreview() {
  const activeBook = state.books.find((b) => b.bookKey === state.activeBookKey);
  const container = document.getElementById('live-preview-container');
  const titleHeader = document.getElementById('preview-book-header-title');
  const dupTabBtn = document.getElementById('tab-btn-duplicates');

  if (!container) return;
  if (!activeBook) {
    if (titleHeader) titleHeader.textContent = 'Vista Previa';
    container.innerHTML = `<div style="padding: 44px 20px; text-align: center; color: #64748b; font-size: 13px;">
      ${state.books.length === 0 ? 'Conecta tu Kindle o carga tu archivo de notas para previsualizar tus libros y capítulos aquí.' : 'Selecciona un libro de la izquierda para previsualizar sus notas.'}
    </div>`;
    return;
  }

  if (titleHeader) {
    titleHeader.textContent = activeBook.cleanTitle;
  }
  if (dupTabBtn) {
    const spanEl = dupTabBtn.querySelector('span');
    const labelTxt = `Duplicados (${activeBook.removedDuplicatesCount})`;
    if (spanEl) spanEl.textContent = labelTxt;
    else dupTabBtn.textContent = labelTxt;
  }

  // Update active tab styling
  document.querySelectorAll('.preview-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-preview-tab') === state.previewTab);
  });

  if (state.previewTab === 'markdown') {
    const mdText = generateMarkdownDocument(activeBook, state.config);
    container.innerHTML = `<pre class="markdown-code-preview">${escapeHtml(mdText)}</pre>`;
    return;
  }

  if (state.previewTab === 'duplicates') {
    const dups = activeBook.removedDuplicates || [];
    if (dups.length === 0) {
      container.innerHTML = `
        <div style="padding: 36px; text-align: center; color: #0d9488; font-weight: 600;">
          Este libro no tenía notas ni resaltados duplicados.
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div style="margin-bottom: 18px;">
        <h3 style="font-size: 16px; color: #0f172a; font-weight: 700;">Auditoría de duplicados depurados (${dups.length})</h3>
        <p style="font-size: 12.5px; color: #64748b; margin-top: 4px;">
          Kindle guarda un nuevo registro cada vez que ajustas un resaltado o editas una nota. Estas versiones intermedias se descartaron automáticamente:
        </p>
      </div>
      ${dups
        .map(
          (d, idx) => `
          <div class="dup-card">
            <div style="display: flex; justify-content: space-between; font-size: 11.5px; font-weight: 700; color: #475569;">
              <span>#${idx + 1} • ${escapeHtml(d.reason)}</span>
              <span>${d.page ? `Pág. ${escapeHtml(d.page)} • ` : ''}${
            d.locStart ? `Pos. ${escapeHtml(d.locStart)}` : ''
          }</span>
            </div>
            <div class="dup-diff-grid">
              <div class="dup-discarded">
                <div style="font-weight: 700; font-size: 11px; margin-bottom: 4px;">DESCARTADO (${escapeHtml(
                  d.discardedDate || 'Versión previa'
                )})</div>
                <div>${escapeHtml(d.discardedText)}</div>
              </div>
              <div class="dup-kept">
                <div style="font-weight: 700; font-size: 11px; margin-bottom: 4px;">CONSERVADO (${escapeHtml(
                  d.keptDate || 'Versión final'
                )})</div>
                <div>${escapeHtml(d.keptText)}</div>
              </div>
            </div>
          </div>
        `
        )
        .join('')}
    `;
    return;
  }

  // Default: 'document' WYSIWYG Preview
  const model = buildBookExportModel(activeBook, state.config);
  const qFilter = state.previewSearchQuery.trim().toLowerCase();

  const statsBannerHtml = model.config.includeStatsHeader
    ? `
      <div class="doc-stats-banner">
        <span><strong>Resaltados:</strong> ${model.stats.highlights}</span>
        <span><strong>Notas personales:</strong> ${model.stats.notes}</span>
        ${
          model.stats.removedDuplicates > 0
            ? `<span style="color: #0f766e;"><strong>Duplicados filtrados:</strong> ${model.stats.removedDuplicates}</span>`
            : ''
        }
        ${
          model.config.includeBookmarks && model.stats.bookmarks > 0
            ? `<span><strong>Marcadores:</strong> ${model.stats.bookmarks}</span>`
            : ''
        }
      </div>
    `
    : '';

  const execBoxHtml =
    model.executiveNotes.length > 0 && !qFilter
      ? `
      <div class="doc-exec-box">
        <div class="doc-exec-title">Resumen de Mis Notas Personales y Preguntas de Estudio (${model.executiveNotes.length})</div>
        ${model.executiveNotes
          .map(
            (en) => `
            <div class="doc-exec-item">
              <strong>${en.isQuestion ? '[Duda] ' : ''}${escapeHtml(en.noteText)}</strong>
              ${en.meta ? `<span style="color: #64748b; font-size: 11.5px;"> (${escapeHtml(en.meta)})</span>` : ''}
              ${
                en.quoteSnippet
                  ? `<div style="color: #475569; font-style: italic; font-size: 12px; margin-top: 2px;">«${escapeHtml(
                      en.quoteSnippet
                    )}»</div>`
                  : ''
              }
            </div>
          `
          )
          .join('')}
      </div>
    `
      : '';

  const sectionsHtml = model.sections
    .map((sec) => {
      const visibleItems = qFilter
        ? sec.items.filter((it) => {
            const notesStr = (it.notes || []).map((n) => n.text).join(' ');
            return `${it.quoteText || ''} ${notesStr} ${it.metaLine || ''}`
              .toLowerCase()
              .includes(qFilter);
          })
        : sec.items;

      if (visibleItems.length === 0) return '';

      return `
        ${sec.title ? `<h2 class="doc-section-heading">${escapeHtml(sec.title)}</h2>` : ''}
        ${visibleItems
          .map((item) => {
            const badgesHtml = (item.badges || [])
              .map((b) => `<span class="badge badge-hl">${escapeHtml(b.label)}</span>`)
              .join('');

            const notesHtml = (item.notes || [])
              .map(
                (n) => `
                <div class="doc-personal-note">
                  <strong>Nota:</strong> ${escapeHtml(n.text)}
                </div>
              `
              )
              .join('');

            return `
              <div class="doc-item style-${escapeHtml(model.config.separatorStyle)}">
                ${
                  item.metaLine || badgesHtml || model.config.separatorStyle === 'numbered_list'
                    ? `
                    <div class="doc-item-meta">
                      ${
                        model.config.separatorStyle === 'numbered_list'
                          ? `<strong style="color: #0d9488;">#${item.number}</strong>`
                          : ''
                      }
                      ${item.metaLine ? `<span>${escapeHtml(item.metaLine)}</span>` : ''}
                      ${badgesHtml}
                    </div>
                  `
                    : ''
                }
                ${item.quoteText ? `<div class="doc-quote-text">${escapeHtml(item.quoteText)}</div>` : ''}
                ${notesHtml}
              </div>
            `;
          })
          .join('')}
      `;
    })
    .join('');

  const bookmarksHtml =
    model.bookmarks.length > 0 && !qFilter
      ? `
      <h2 class="doc-section-heading">Marcadores de Página Guardados (${model.bookmarks.length})</h2>
      <ul style="padding-left: 20px; color: #475569; font-size: 13px;">
        ${model.bookmarks
          .map((bm) => `<li><strong>Marcador #${bm.index}:</strong> ${escapeHtml(bm.metaLine)}</li>`)
          .join('')}
      </ul>
    `
      : '';

  container.innerHTML = `
    <div class="doc-title">${escapeHtml(model.title)}</div>
    <div class="doc-subtitle">
      Autor: ${escapeHtml(model.author)}
      ${model.dateRangeStr ? ` &nbsp;·&nbsp; Lectura: ${escapeHtml(model.dateRangeStr)}` : ''}
      ${model.epubMatchedFile ? ` &nbsp;·&nbsp; Capítulos: ${escapeHtml(model.epubMatchedFile)}` : ''}
    </div>
    ${statsBannerHtml}
    ${execBoxHtml}
    ${sectionsHtml || '<div style="padding: 24px; color: #64748b;">No hay anotaciones que coincidan con el filtro actual.</div>'}
    ${bookmarksHtml}
  `;
}

function renderAll() {
  renderHeaderStats();
  renderCatalogList();
  renderConfigControls();
  renderActiveBookPreview();
}

/**
 * Exports a list of books into the selected formats (.docx, .md, .pdf).
 * @param {Array<Object>} booksToExport
 */
async function executeExportBooks(booksToExport) {
  const { formats, conflictPolicy, includeAuthorInFilename } = state.config;
  if (!formats.docx && !formats.md && !formats.pdf) {
    showToast('Selecciona al menos un formato de exportación (.docx, .md o .pdf).', 'warning');
    return;
  }

  if (booksToExport.length === 0) {
    showToast('Selecciona al menos un libro para exportar.', 'warning');
    return;
  }

  const exportedRecords = [];
  let filesWritten = 0;
  let skippedBooks = 0;

  for (const book of booksToExport) {
    const hasExisting =
      book.syncInfo && book.syncInfo.matchedFiles && book.syncInfo.matchedFiles.length > 0;

    if (conflictPolicy === 'skip_existing' && hasExisting && state.destState) {
      skippedBooks++;
      continue;
    }

    const bookFiles = [];
    const fnOptions = {
      includeAuthorInFilename,
      conflictPolicy,
      hasExistingFile: hasExisting
    };

    if (formats.docx) {
      const fileName = buildSafeBookFilename(book, 'docx', fnOptions);
      const docxBytes = generateDocxDocument(book, state.config);
      await writeExportFile(
        state.destState,
        fileName,
        docxBytes,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
      bookFiles.push(fileName);
      filesWritten++;
    }

    if (formats.md) {
      const fileName = buildSafeBookFilename(book, 'md', fnOptions);
      const mdText = generateMarkdownDocument(book, state.config);
      await writeExportFile(state.destState, fileName, mdText, 'text/markdown;charset=utf-8');
      bookFiles.push(fileName);
      filesWritten++;
    }

    if (formats.pdf) {
      const fileName = buildSafeBookFilename(book, 'pdf', fnOptions);
      const pdfBytes = generatePdfDocument(book, state.config);
      await writeExportFile(state.destState, fileName, pdfBytes, 'application/pdf');
      bookFiles.push(fileName);
      filesWritten++;
    }

    exportedRecords.push({ book, exportedFiles: bookFiles });
  }

  if (state.destState && exportedRecords.length > 0) {
    await updateSyncManifest(state.destState, exportedRecords);
    state.syncSummary = evaluateBooksSyncStatus(state.books, state.destState);
    renderAll();
  }

  const destMsg =
    state.destState && state.destState.mode === 'readwrite'
      ? `en la carpeta "${state.destState.folderName}"`
      : 'en tus descargas';
  showToast(
    `Exportación completada: ${filesWritten} archivo(s) generados (${exportedRecords.length} libros) ${destMsg}${
      skippedBooks > 0 ? ` (${skippedBooks} omitidos por existir previamente)` : ''
    }.`
  );
}

/**
 * Handles loading a Kindle folder (containing My Clippings.txt and optional .epub files).
 * @param {File[]} files
 * @param {string} sourceName
 */
async function handleKindleSourceFiles(files, sourceName) {
  let clippingsFile = null;
  const epubFiles = [];

  for (const f of files) {
    const lower = f.name.toLowerCase();
    if (lower === 'my clippings.txt' || lower === 'mis recortes.txt' || lower.endsWith('clippings.txt')) {
      clippingsFile = f;
    } else if (lower.endsWith('.epub')) {
      epubFiles.push(f);
    }
  }

  if (!clippingsFile && files.length === 1 && files[0].name.toLowerCase().endsWith('.txt')) {
    clippingsFile = files[0];
  }

  if (clippingsFile) {
    state.rawClippingsText = await clippingsFile.text();
    state.sourceLabel = sourceName || clippingsFile.name;
  }

  if (epubFiles.length > 0) {
    let parsedCount = 0;
    for (const ef of epubFiles) {
      try {
        const parsedEpub = await parseEpubFile(ef);
        const existingIdx = state.parsedEpubs.findIndex((e) => e.fileName === parsedEpub.fileName);
        if (existingIdx !== -1) state.parsedEpubs[existingIdx] = parsedEpub;
        else state.parsedEpubs.push(parsedEpub);
        parsedCount++;
      } catch {
        // Ignore DRM or non-standard EPUBs gracefully
      }
    }
    if (parsedCount > 0) {
      showToast(`Se extrajeron los capítulos de ${parsedCount} archivo(s) EPUB.`);
    }
  }

  if (clippingsFile || epubFiles.length > 0) {
    processCurrentClippings(Boolean(!clippingsFile));
    if (clippingsFile) {
      showToast(`Cargado "${state.sourceLabel}": ${state.books.filter((b) => !b.isSystemClippingsBook).length} libros detectados.`);
    }
  } else {
    showToast('No se encontró "My Clippings.txt" ni archivos ".epub" en la selección.', 'warning');
  }
}

function setupEventListeners() {
  // 1. Source Kindle Folder / File Buttons
  const btnPickKindleFolder = document.getElementById('btn-pick-kindle-folder');
  const inputKindleFolder = document.getElementById('input-kindle-folder');
  const btnPickClippingsFile = document.getElementById('btn-pick-clippings-file');
  const inputClippingsFile = document.getElementById('input-clippings-file');
  const btnPickEpubs = document.getElementById('btn-pick-epubs');
  const inputEpubs = document.getElementById('input-epubs');

  if (btnPickKindleFolder) {
    btnPickKindleFolder.addEventListener('click', async () => {
      if (typeof window.showDirectoryPicker === 'function') {
        try {
          const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
          const collected = [];
          const scanDir = async (handle, depth = 0) => {
            if (depth > 2) return;
            for await (const [, entry] of handle.entries()) {
              if (entry.kind === 'file') {
                const lower = entry.name.toLowerCase();
                if (lower.endsWith('.txt') || lower.endsWith('.epub')) {
                  collected.push(await entry.getFile());
                }
              } else if (entry.kind === 'directory' && depth < 2) {
                const subName = entry.name.toLowerCase();
                if (subName === 'documents' || depth === 0) {
                  await scanDir(entry, depth + 1);
                }
              }
            }
          };
          await scanDir(dirHandle, 0);
          await handleKindleSourceFiles(collected, `Kindle (${dirHandle.name})`);
          return;
        } catch (err) {
          if (err && err.name === 'AbortError') return;
        }
      }
      if (inputKindleFolder) inputKindleFolder.click();
    });
  }

  if (inputKindleFolder) {
    inputKindleFolder.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0) {
        const folderName = (files[0].webkitRelativePath || '').split('/')[0] || 'Carpeta Kindle';
        await handleKindleSourceFiles(files, folderName);
      }
      e.target.value = '';
    });
  }

  if (btnPickClippingsFile && inputClippingsFile) {
    btnPickClippingsFile.addEventListener('click', () => inputClippingsFile.click());
    inputClippingsFile.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0) {
        await handleKindleSourceFiles(files, files[0].name);
      }
      e.target.value = '';
    });
  }

  if (btnPickEpubs && inputEpubs) {
    btnPickEpubs.addEventListener('click', () => inputEpubs.click());
    inputEpubs.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0) {
        await handleKindleSourceFiles(files, state.sourceLabel);
      }
      e.target.value = '';
    });
  }

  // 2. Destination Directory Picker (with Previous Export Detection)
  const btnPickDestFolder = document.getElementById('btn-pick-dest-folder');
  const inputDestFolderFallback = document.getElementById('input-dest-folder-fallback');

  if (btnPickDestFolder) {
    btnPickDestFolder.addEventListener('click', async () => {
      if (typeof window.showDirectoryPicker === 'function') {
        try {
          const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
          state.destState = await scanDestinationDirectoryHandle(dirHandle);
          state.syncSummary = evaluateBooksSyncStatus(state.books, state.destState);
          renderAll();
          showToast(
            `Carpeta destino "${state.destState.folderName}" analizada: ${state.syncSummary.newCount} libros nuevos, ${state.syncSummary.updatedCount} previos/actualizados, ${state.syncSummary.upToDateCount} al día.`
          );
          return;
        } catch (err) {
          if (err && err.name === 'AbortError') return;
        }
      }
      if (inputDestFolderFallback) inputDestFolderFallback.click();
    });
  }

  if (inputDestFolderFallback) {
    inputDestFolderFallback.addEventListener('change', async (e) => {
      if (e.target.files && e.target.files.length > 0) {
        state.destState = await scanDestinationFileList(e.target.files);
        state.syncSummary = evaluateBooksSyncStatus(state.books, state.destState);
        renderAll();
        showToast(
          `Carpeta "${state.destState.folderName}" escaneada: se detectaron ${state.destState.existingFiles.length} exportaciones previas.`
        );
      }
      e.target.value = '';
    });
  }

  // 3. Quick Selection Buttons
  document.getElementById('btn-select-all')?.addEventListener('click', () => {
    for (const b of getVisibleBooks()) {
      if (!b.isSystemClippingsBook) state.selectedBookKeys.add(b.bookKey);
    }
    renderCatalogList();
  });

  document.getElementById('btn-select-new-updated')?.addEventListener('click', () => {
    state.selectedBookKeys.clear();
    for (const b of state.books) {
      if (b.isSystemClippingsBook) continue;
      const st = b.syncInfo?.status || 'new';
      if (st === 'new' || st === 'updated') {
        state.selectedBookKeys.add(b.bookKey);
      }
    }
    renderCatalogList();
    showToast(`Seleccionados ${state.selectedBookKeys.size} libros nuevos o con actualizaciones.`);
  });

  document.getElementById('btn-select-none')?.addEventListener('click', () => {
    state.selectedBookKeys.clear();
    renderCatalogList();
  });

  // 4. Search & Filter Pills
  document.getElementById('catalog-search-input')?.addEventListener('input', (e) => {
    state.searchQuery = e.target.value || '';
    renderCatalogList();
  });

  document.getElementById('preview-search-input')?.addEventListener('input', (e) => {
    state.previewSearchQuery = e.target.value || '';
    renderActiveBookPreview();
  });

  document.getElementById('catalog-filter-pills')?.addEventListener('click', (e) => {
    const pill = e.target.closest('[data-filter]');
    if (!pill) return;
    state.catalogFilter = pill.getAttribute('data-filter');
    renderCatalogList();
  });

  // 5. Book List Click Delegation
  document.getElementById('books-catalog-list')?.addEventListener('click', (e) => {
    const editBtn = e.target.closest('[data-edit-book]');
    if (editBtn) {
      e.stopPropagation();
      openEditBookModal(editBtn.getAttribute('data-edit-book'));
      return;
    }

    const dupBadge = e.target.closest('[data-action="view-dups"]');
    if (dupBadge) {
      e.stopPropagation();
      state.activeBookKey = dupBadge.getAttribute('data-book');
      state.previewTab = 'duplicates';
      renderAll();
      return;
    }

    const checkEl = e.target.closest('[data-check-book]');
    if (checkEl) {
      e.stopPropagation();
      const key = checkEl.getAttribute('data-check-book');
      if (checkEl.checked) state.selectedBookKeys.add(key);
      else state.selectedBookKeys.delete(key);
      renderCatalogList();
      return;
    }

    const row = e.target.closest('[data-book-key]');
    if (row) {
      state.activeBookKey = row.getAttribute('data-book-key');
      renderAll();
    }
  });

  // 6. Configuration Controls & Slide-Over Drawer (Progressive Disclosure)
  const configDrawer = document.getElementById('config-drawer-backdrop');
  const openConfigDrawer = () => {
    if (configDrawer) {
      configDrawer.style.display = 'flex';
      document.getElementById('btn-close-config')?.focus();
    }
  };
  const closeConfigDrawer = () => {
    if (configDrawer) {
      configDrawer.style.display = 'none';
    }
  };

  document.getElementById('btn-open-config')?.addEventListener('click', openConfigDrawer);
  document.getElementById('btn-open-config-toolbar')?.addEventListener('click', openConfigDrawer);
  document.getElementById('btn-close-config')?.addEventListener('click', closeConfigDrawer);
  document.getElementById('btn-done-config')?.addEventListener('click', closeConfigDrawer);
  configDrawer?.addEventListener('click', (e) => {
    if (e.target === configDrawer) closeConfigDrawer();
  });

  document.getElementById('btn-reset-config')?.addEventListener('click', () => {
    state.config = structuredClone(DEFAULT_EXPORT_CONFIG);
    saveStoredConfig();
    processCurrentClippings(true);
    showToast('Configuración de formato restaurada a los valores predeterminados.');
  });

  const bindCheck = (id, handler) => {
    document.getElementById(id)?.addEventListener('change', (e) => {
      handler(e.target.checked);
      saveStoredConfig();
      renderAll();
    });
  };
  const bindSelect = (id, handler) => {
    document.getElementById(id)?.addEventListener('change', (e) => {
      handler(e.target.value);
      saveStoredConfig();
      renderAll();
    });
  };

  bindCheck('fmt-docx', (v) => (state.config.formats.docx = v));
  bindCheck('fmt-md', (v) => (state.config.formats.md = v));
  bindCheck('fmt-pdf', (v) => (state.config.formats.pdf = v));

  bindSelect('cfg-content-filter', (v) => (state.config.contentFilter = v));
  bindSelect('cfg-grouping-mode', (v) => (state.config.groupingMode = v));
  bindSelect('cfg-separator-style', (v) => (state.config.separatorStyle = v));
  bindSelect('cfg-conflict-policy', (v) => (state.config.conflictPolicy = v));
  bindSelect('cfg-dedup-strategy', (v) => {
    state.config.dedupStrategy = v;
    processCurrentClippings(true);
  });

  bindCheck('cfg-meta-page', (v) => (state.config.metadataFields.page = v));
  bindCheck('cfg-meta-location', (v) => (state.config.metadataFields.location = v));
  bindCheck('cfg-meta-date', (v) => (state.config.metadataFields.date = v));
  bindCheck('cfg-meta-tags', (v) => (state.config.metadataFields.tags = v));

  bindCheck('cfg-exec-summary', (v) => (state.config.includeExecutiveSummary = v));
  bindCheck('cfg-include-bookmarks', (v) => (state.config.includeBookmarks = v));
  bindCheck('cfg-author-filename', (v) => (state.config.includeAuthorInFilename = v));
  bindCheck('cfg-show-system-book', (v) => {
    state.showSystemClippingsBook = v;
  });

  // 7. Preview Tabs & Single-Book Export Actions
  document.querySelectorAll('.preview-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.previewTab = btn.getAttribute('data-preview-tab');
      renderActiveBookPreview();
    });
  });

  document.getElementById('btn-export-selected')?.addEventListener('click', async () => {
    const selectedBooks = state.books.filter((b) => state.selectedBookKeys.has(b.bookKey));
    await executeExportBooks(selectedBooks);
  });

  document.getElementById('btn-export-active-book')?.addEventListener('click', async () => {
    const activeBook = state.books.find((b) => b.bookKey === state.activeBookKey);
    if (activeBook) {
      await executeExportBooks([activeBook]);
    }
  });

  document.getElementById('btn-print-active-book')?.addEventListener('click', () => {
    state.previewTab = 'document';
    renderActiveBookPreview();
    window.print();
  });

  // 8. Edit Book Title / Author Modal
  const editModal = document.getElementById('modal-edit-book');
  document.getElementById('btn-cancel-edit-book')?.addEventListener('click', closeEditBookModal);
  editModal?.addEventListener('click', (e) => {
    if (e.target === editModal) closeEditBookModal();
  });

  document.getElementById('form-edit-book')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!state.editingBookKey) return;
    const titleVal = document.getElementById('edit-book-title-input')?.value.trim();
    const authorVal = document.getElementById('edit-book-author-input')?.value.trim();
    if (titleVal) {
      state.customTitles[state.editingBookKey] = {
        title: titleVal,
        author: authorVal || 'Autor desconocido'
      };
      saveStoredCustomTitles();
      processCurrentClippings(true);
      showToast('Título y autor actualizados.');
    }
    closeEditBookModal();
  });

  // Global Escape key handler for Drawer & Modal accessibility
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (editModal && editModal.style.display !== 'none') {
        closeEditBookModal();
      } else if (configDrawer && configDrawer.style.display !== 'none') {
        closeConfigDrawer();
      }
    }
  });
}

function openEditBookModal(bookKey) {
  const book = state.books.find((b) => b.bookKey === bookKey);
  if (!book) return;
  state.editingBookKey = bookKey;
  const modal = document.getElementById('modal-edit-book');
  const titleInput = document.getElementById('edit-book-title-input');
  const authorInput = document.getElementById('edit-book-author-input');
  if (titleInput) titleInput.value = book.cleanTitle;
  if (authorInput) authorInput.value = book.author;
  if (modal) modal.style.display = 'flex';
}

function closeEditBookModal() {
  state.editingBookKey = null;
  const modal = document.getElementById('modal-edit-book');
  if (modal) modal.style.display = 'none';
}

async function initApp() {
  setupEventListeners();

  // Load default My Clippings.txt embedded from the workspace if provided
  state.rawClippingsText = DEFAULT_MY_CLIPPINGS_RAW || '';
  if (state.rawClippingsText.trim()) {
    state.sourceLabel = 'My Clippings.txt (Cargado del proyecto)';
  } else {
    state.sourceLabel = 'Ningún archivo cargado aún';
  }
  processCurrentClippings(false);
}

document.addEventListener('DOMContentLoaded', initApp);


})();
