/**
 * Automated Verification Suite for Kindle Notes Organizer Core & Exporters.
 * Tests against the real 2,079-entry My Clippings.txt dataset.
 */

import fs from 'node:fs';
import { parseMyClippings } from '../src/core/parser.js';
import { buildBooksCatalog } from '../src/core/deduplicator.js';
import { generateMarkdownDocument } from '../src/exporters/markdownExporter.js';
import { generateDocxDocument } from '../src/exporters/docxExporter.js';
import { generatePdfDocument } from '../src/exporters/pdfExporter.js';
import { unzipBuffer } from '../src/core/epubReader.js';

async function runTests() {
  const raw = fs.readFileSync('./My Clippings.txt', 'utf-8');
  const { rawEntriesCount, parsedEntries } = parseMyClippings(raw);

  console.log(`[1/4] Parsed My Clippings.txt: ${parsedEntries.length} / ${rawEntriesCount} valid entries`);
  if (parsedEntries.length !== 2079) {
    throw new Error(`Expected 2079 parsed entries, got ${parsedEntries.length}`);
  }

  const { books, totalRemovedDuplicates } = buildBooksCatalog(parsedEntries);
  const realBooks = books.filter((b) => !b.isSystemClippingsBook);
  console.log(
    `[2/4] Built catalog: ${realBooks.length} real books (+1 system clippings book), ${totalRemovedDuplicates} duplicates removed`
  );

  if (realBooks.length !== 22) {
    throw new Error(`Expected 22 real books, got ${realBooks.length}`);
  }

  let totalDocsGenerated = 0;

  for (const book of realBooks) {
    // 1. Test Markdown export
    const md = generateMarkdownDocument(book);
    if (!md.includes(book.cleanTitle) || md.length < 50) {
      throw new Error(`Markdown generation failed for ${book.cleanTitle}`);
    }

    // 2. Test DOCX export & verify internal OOXML ZIP structure
    const docxBytes = generateDocxDocument(book);
    const unzipped = await unzipBuffer(docxBytes.buffer);
    if (!unzipped.has('word/document.xml') || !unzipped.has('word/styles.xml')) {
      throw new Error(`Invalid DOCX ZIP structure for ${book.cleanTitle}`);
    }
    const docXml = new TextDecoder().decode(unzipped.get('word/document.xml'));
    if (!docXml.includes('<w:document') || !docXml.includes('</w:document>')) {
      throw new Error(`Invalid word/document.xml in DOCX for ${book.cleanTitle}`);
    }

    // 3. Test PDF export & verify PDF-1.4 header and trailer
    const pdfBytes = generatePdfDocument(book);
    const pdfHeader = new TextDecoder('latin1').decode(pdfBytes.subarray(0, 8));
    const pdfTail = new TextDecoder('latin1').decode(pdfBytes.subarray(pdfBytes.length - 30));
    if (!pdfHeader.startsWith('%PDF-1.4') || !pdfTail.includes('%%EOF')) {
      throw new Error(`Invalid PDF binary output for ${book.cleanTitle}`);
    }

    totalDocsGenerated += 3;
  }

  console.log(
    `[3/4] Successfully generated and validated ${totalDocsGenerated} documents (22 .md, 22 .docx, 22 .pdf)!`
  );
  console.log(`[4/4] ALL TESTS PASSED!`);
}

runTests().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
