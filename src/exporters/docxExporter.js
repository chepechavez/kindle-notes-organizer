/**
 * @fileoverview Native Microsoft Word (.docx / Office Open XML) Exporter.
 * Generates richly styled Word documents with real Heading styles (for Word Navigation Pane),
 * quote borders, personal note callout boxes, and metadata headers. Zero external dependencies.
 */

import { buildBookExportModel } from './exportViewModel.js';
import { buildZipArchive } from './zipWriter.js';

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
export function generateDocxDocument(book, userConfig = {}) {
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
