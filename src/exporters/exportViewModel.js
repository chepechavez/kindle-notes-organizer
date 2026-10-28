/**
 * @fileoverview Shared Export Document Model Builder.
 * Ensures 100% consistency between Live Preview, Markdown (.md), Word (.docx), and PDF (.pdf).
 */

import { buildBookHierarchy } from '../core/deduplicator.js';

export const DEFAULT_EXPORT_CONFIG = {
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
export function formatItemMetaLine(item, metadataFields = {}) {
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
export function formatCategoryBadges(item) {
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
export function buildBookExportModel(book, userConfig = {}) {
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
