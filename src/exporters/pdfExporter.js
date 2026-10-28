/**
 * @fileoverview Native Binary PDF 1.4 Generator + High-Resolution Print Helper.
 * Generates multi-page vector PDF documents with full Spanish WinAnsiEncoding support,
 * colored quote accent bars, shaded personal note callouts, and page numbering.
 * Zero external dependencies.
 */

import { buildBookExportModel } from './exportViewModel.js';

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
export function generatePdfDocument(book, userConfig = {}) {
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
