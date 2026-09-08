// Server-side PDF for a Research Note (pdfkit — pure JS, no native deps). The
// PDF and the HTML render the same publication. Figures are fetched and embedded
// at a size that fits the page; body text is justified.
import PDFDocument from 'pdfkit';
import { SERIES, LICENSES, canonicalPath, pad3 } from './rn-data.js';
import { apaCitation } from './rn-citations.js';
import { getMediaForServe } from './rn-storage.js';

const BRAND = '#0e63d6';
const INK = '#1a2130';
const MUTED = '#5b6472';

function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&rsquo;/g, '’')
    .replace(/&hellip;/g, '…').replace(/&[a-z]+;/gi, ' ');
}

// Ordered typed blocks, including IMG blocks (src + caption).
function htmlToBlocks(html) {
  let s = String(html || '');
  s = s.replace(/<br\s*\/?>/gi, ' ');
  // Figures / images -> IMG marker with src + caption.
  s = s.replace(/<figure\b[^>]*>([\s\S]*?)<\/figure>/gi, (_m, inner) => {
    const src = (inner.match(/<img[^>]+src="([^"]+)"/i) || [])[1] || '';
    const cap = (inner.match(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i) || [])[1] || '';
    return src ? `\nIMG\x1f${src}\x1f${decodeEntities(cap.replace(/<[^>]+>/g, '')).trim()}\n` : '';
  });
  s = s.replace(/<img[^>]+src="([^"]+)"[^>]*>/gi, (_m, src) => `\nIMG\x1f${src}\x1f\n`);
  s = s.replace(/<h2\b[^>]*>/gi, '\nH2\x1f').replace(/<h3\b[^>]*>/gi, '\nH3\x1f')
    .replace(/<h4\b[^>]*>/gi, '\nH4\x1f').replace(/<blockquote\b[^>]*>/gi, '\nQUOTE\x1f')
    .replace(/<figcaption\b[^>]*>/gi, '\nCAP\x1f').replace(/<li\b[^>]*>/gi, '\nLI\x1f')
    .replace(/<p\b[^>]*>/gi, '\nP\x1f');
  s = s.replace(/<[^>]+>/g, '');
  const out = [];
  for (const line of s.split('\n')) {
    if (line.startsWith('IMG\x1f')) {
      const [, src, caption] = line.split('\x1f');
      if (src) out.push({ type: 'IMG', src, caption: (caption || '').trim() });
      continue;
    }
    const m = line.match(/^(H2|H3|H4|QUOTE|CAP|LI|P)\x1f([\s\S]*)$/);
    const type = m ? m[1] : 'P';
    const text = decodeEntities(m ? m[2] : line).replace(/\s+/g, ' ').trim();
    if (text) out.push({ type, text });
  }
  return out;
}

const isPngOrJpeg = (b) => b && b.length > 3 && ((b[0] === 0x89 && b[1] === 0x50) || (b[0] === 0xff && b[1] === 0xd8));

// Fetch a figure's bytes: same-origin DB media directly, otherwise over HTTP.
async function fetchImage(src, baseUrl) {
  try {
    const m = String(src).match(/\/research-notes\/media\/([0-9a-f-]{36})/i);
    if (m) {
      const row = await getMediaForServe(m[1]);
      if (row && row.data) return Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data);
      if (row && row.url && /^https?:/i.test(row.url)) src = row.url;
    }
    let url = src;
    if (String(src).startsWith('/')) url = baseUrl + src;
    if (!/^https?:/i.test(url)) return null;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch { return null; }
}

export async function buildPdf(note, baseUrl) {
  const canonicalUrl = baseUrl + canonicalPath(note);
  const blocks = htmlToBlocks(note.body_html);

  // Pre-fetch figure images (pdfkit renders synchronously, so gather first).
  const imgCache = new Map();
  for (const b of blocks) {
    if (b.type === 'IMG' && !imgCache.has(b.src)) {
      const buf = await fetchImage(b.src, baseUrl);
      imgCache.set(b.src, isPngOrJpeg(buf) ? buf : null); // pdfkit embeds PNG/JPEG only
    }
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4', margins: { top: 70, bottom: 70, left: 64, right: 64 }, bufferPages: true,
      info: { Title: note.title, Author: (note.authors || []).map((a) => a.full_name).join(', '), Subject: (note.keywords || []).join(', ') },
    });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const pageBottom = doc.page.height - doc.page.margins.bottom;
    const fmtDate = (d) => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });

    doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(10)
      .text(`${SERIES.name.toUpperCase()}${note.note_number != null ? ' ' + pad3(note.note_number) : ''}`, { characterSpacing: 1 });
    doc.moveDown(0.2).fillColor(MUTED).font('Helvetica').fontSize(9)
      .text(`${note.note_type}${note.published_at ? ' · ' + fmtDate(note.published_at) : ''}`);
    doc.moveDown(0.6);
    doc.strokeColor('#e6e9ef').lineWidth(1).moveTo(doc.x, doc.y).lineTo(doc.x + W, doc.y).stroke();
    doc.moveDown(0.8);

    doc.fillColor(INK).font('Helvetica-Bold').fontSize(21).text(note.title, { lineGap: 2 });
    if (note.subtitle) doc.moveDown(0.3).fillColor(MUTED).font('Helvetica').fontSize(13).text(note.subtitle);

    if (note.authors && note.authors.length) {
      doc.moveDown(0.7).fillColor(INK).font('Helvetica-Bold').fontSize(11)
        .text(note.authors.map((a) => a.full_name + (a.is_corresponding ? ' *' : '')).join(', '));
      const affs = [...new Set(note.authors.map((a) => a.affiliation_override || a.affiliation).filter(Boolean))];
      if (affs.length) doc.moveDown(0.15).fillColor(MUTED).font('Helvetica').fontSize(9.5).text(affs.join(' · '));
    }

    doc.moveDown(0.6).fillColor(MUTED).font('Helvetica').fontSize(9);
    const pub = [`${SERIES.name}${note.note_number != null ? ' ' + pad3(note.note_number) : ''}`,
      `Version ${note.version}`, note.doi ? `DOI: ${note.doi}` : null,
      (LICENSES[note.license] || {}).label].filter(Boolean).join('   ·   ');
    doc.text(pub);
    doc.fillColor(BRAND).text(canonicalUrl, { link: canonicalUrl });

    if (note.abstract) {
      doc.moveDown(0.9).fillColor(MUTED).font('Helvetica-Bold').fontSize(10).text('ABSTRACT', { characterSpacing: 1 });
      doc.moveDown(0.3).fillColor(INK).font('Helvetica').fontSize(10.5).text(note.abstract, { align: 'justify', lineGap: 1.5 });
    }
    if (note.keywords && note.keywords.length) {
      doc.moveDown(0.5).fillColor(MUTED).font('Helvetica-Oblique').fontSize(9.5).text('Keywords: ' + note.keywords.join(', '));
    }

    doc.moveDown(0.9);
    for (const b of blocks) {
      if (b.type === 'IMG') {
        const buf = imgCache.get(b.src);
        if (!buf) continue;
        let img;
        try { img = doc.openImage(buf); } catch { continue; }
        const maxH = 360;
        const scale = Math.min(W / img.width, maxH / img.height, 1);
        const iw = Math.round(img.width * scale), ih = Math.round(img.height * scale);
        doc.moveDown(0.5);
        // New page if the figure won't fit — prevents overlap with the footer/next text.
        if (doc.y + ih + 26 > pageBottom) doc.addPage();
        const x = doc.page.margins.left + (W - iw) / 2; // centered
        try { doc.image(buf, x, doc.y, { width: iw, height: ih }); } catch { continue; }
        doc.y += ih + 6; // advance the cursor past the image (pdfkit does not do this for us)
        if (b.caption) doc.fillColor(MUTED).font('Helvetica-Oblique').fontSize(9)
          .text(b.caption, doc.page.margins.left, doc.y, { width: W, align: 'center' });
        doc.moveDown(0.6);
      } else if (b.type === 'H2') doc.moveDown(0.6).fillColor(INK).font('Helvetica-Bold').fontSize(14).text(b.text, { lineGap: 1 });
      else if (b.type === 'H3') doc.moveDown(0.4).fillColor(INK).font('Helvetica-Bold').fontSize(12).text(b.text);
      else if (b.type === 'H4') doc.moveDown(0.3).fillColor(INK).font('Helvetica-Bold').fontSize(10.5).text(b.text);
      else if (b.type === 'LI') doc.fillColor(INK).font('Helvetica').fontSize(10.5).text('•  ' + b.text, { indent: 12, lineGap: 1.5 });
      else if (b.type === 'QUOTE') doc.moveDown(0.2).fillColor(MUTED).font('Helvetica-Oblique').fontSize(10.5).text(b.text, { indent: 16, lineGap: 1.5 });
      else if (b.type === 'CAP') doc.moveDown(0.1).fillColor(MUTED).font('Helvetica-Oblique').fontSize(9).text(b.text, { align: 'center' });
      else doc.moveDown(0.15).fillColor(INK).font('Helvetica').fontSize(10.5).text(b.text, { align: 'justify', lineGap: 1.5 });
    }

    if (note.references && note.references.length) {
      doc.moveDown(0.9).fillColor(INK).font('Helvetica-Bold').fontSize(13).text('References');
      doc.moveDown(0.3);
      note.references.forEach((r, i) => {
        doc.fillColor(INK).font('Helvetica').fontSize(9.5)
          .text(`${i + 1}. ${r.raw_text}${r.doi ? ' https://doi.org/' + r.doi : (r.url ? ' ' + r.url : '')}`, { lineGap: 1.5, paragraphGap: 3 });
      });
    }

    doc.moveDown(0.9).fillColor(MUTED).font('Helvetica-Bold').fontSize(10).text('SUGGESTED CITATION', { characterSpacing: 1 });
    doc.moveDown(0.3).fillColor(INK).font('Helvetica').fontSize(9.5).text(apaCitation(note, canonicalUrl), { lineGap: 1.5 });

    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      const y = doc.page.height - 48;
      doc.fillColor(MUTED).font('Helvetica').fontSize(8)
        .text(`${SERIES.name}${note.note_number != null ? ' ' + pad3(note.note_number) : ''} · ${SERIES.publisher}`,
          doc.page.margins.left, y, { width: W, align: 'left', lineBreak: false });
      doc.text(`Page ${i + 1} of ${range.count}`, doc.page.margins.left, y, { width: W, align: 'right', lineBreak: false });
    }

    doc.end();
  });
}
