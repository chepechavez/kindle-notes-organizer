/**
 * @fileoverview Main Application Controller for Kindle Notes Organizer.
 * 100% Client-Side, Zero External Dependencies, Sandboxed & Safe.
 */

import { parseMyClippings } from '../core/parser.js';
import { buildBooksCatalog } from '../core/deduplicator.js';
import { parseEpubFile, attachEpubsToBooks } from '../core/epubReader.js';
import {
  buildSafeBookFilename,
  scanDestinationDirectoryHandle,
  scanDestinationFileList,
  evaluateBooksSyncStatus,
  writeExportFile,
  updateSyncManifest
} from '../core/syncManager.js';
import { DEFAULT_EXPORT_CONFIG, buildBookExportModel } from '../exporters/exportViewModel.js';
import { generateMarkdownDocument } from '../exporters/markdownExporter.js';
import { generateDocxDocument } from '../exporters/docxExporter.js';
import { generatePdfDocument } from '../exporters/pdfExporter.js';
import { DEFAULT_MY_CLIPPINGS_RAW } from '../data/defaultClippings.js';

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

export async function initApp() {
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
