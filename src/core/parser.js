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
export function parseKindleDate(datePart) {
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
export function parseBookHeader(rawLine) {
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
export function extractStudyMarkers(text, kind) {
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
export function isLikelySectionHeading(text) {
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
export function normalizeBookKey(title) {
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
export function parseMyClippings(rawContent) {
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
