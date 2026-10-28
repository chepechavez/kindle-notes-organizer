/**
 * @fileoverview Markdown (.md) Exporter for Kindle Study Notes.
 * Compatible with Obsidian, Notion, Logseq, and standard Markdown viewers.
 */

import { buildBookExportModel } from './exportViewModel.js';

/**
 * Generates a complete Markdown document string for a book.
 * @param {Object} book
 * @param {Object} userConfig
 * @returns {string}
 */
export function generateMarkdownDocument(book, userConfig = {}) {
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
