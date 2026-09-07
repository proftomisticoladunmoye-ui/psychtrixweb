// Word (.docx) ingestion for Research Notes. Converts an uploaded document into
// a structured Research Note: it detects the title, authors, affiliations,
// abstract, keywords and references and drops each into its own field, leaving
// a clean, production-quality body (headings, paragraphs, tables, images,
// YouTube embeds). Everything is best-effort — the QC report flags what it
// found so the editor can review before publishing.
import mammoth from 'mammoth';

const STYLE_MAP = [
  "p[style-name='Title'] => h1:fresh",
  "p[style-name='Subtitle'] => p.subtitle:fresh",
  "p[style-name='Heading 1'] => h2:fresh",
  "p[style-name='Heading 2'] => h3:fresh",
  "p[style-name='Heading 3'] => h4:fresh",
  "p[style-name='Heading 4'] => h5:fresh",
  "p[style-name='Quote'] => blockquote:fresh",
  "p[style-name='Intense Quote'] => blockquote.intense:fresh",
  "r[style-name='Strong'] => strong",
  "r[style-name='Emphasis'] => em",
];

const stripTags = (h) => String(h || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const decode = (s) => String(s).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
const clean = (h) => decode(stripTags(h));
const AFFIL_RE = /univers|institut|department|college|faculty|\bschool\b|hospital|centre|center|laborator|academy|polytechnic|ministry|organi[sz]ation/i;

// A paragraph that is just a YouTube link becomes a responsive embed.
function embedYoutube(html) {
  return html.replace(
    /<p>\s*<a href="https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})[^"]*"[^>]*>[^<]*<\/a>\s*<\/p>/gi,
    (_m, id) => `<div class="video"><iframe src="https://www.youtube-nocookie.com/embed/${id}" title="Embedded video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`,
  );
}

// Split the converted HTML into ordered top-level blocks.
function toBlocks(html) {
  const re = /<(h[1-6]|p|ul|ol|table|figure|blockquote|div)\b[^>]*>[\s\S]*?<\/\1>/gi;
  const blocks = [];
  let m;
  while ((m = re.exec(html))) {
    const tag = m[1].toLowerCase();
    blocks.push({ tag, html: m[0], text: clean(m[0]) });
  }
  return blocks;
}

// Pull author names + affiliations out of the front matter (between title and
// abstract). Author lines are comma/"and"-separated names; affiliation lines
// contain institution keywords.
function parseFrontMatter(blocks) {
  const authors = [];
  const affiliations = [];
  for (const b of blocks) {
    if (AFFIL_RE.test(b.text)) { affiliations.push(b.text); continue; }
    // author line: short, name-like, comma/and separated, no sentence punctuation
    const parts = b.text.split(/,|;|\band\b|&/i).map((p) => p.replace(/[\d*†‡§¶^]/g, '').trim()).filter(Boolean);
    const looksLikeNames = parts.length > 0 && parts.length <= 12 && parts.every((p) => {
      const words = p.split(/\s+/);
      return words.length >= 1 && words.length <= 5 && /^[A-Z]/.test(p)
        && !/\b(the|of|study|this|these|we|our|results?|analysis|paper|research|abstract|introduction)\b/i.test(p)
        && !/\w{20,}/.test(p);
    });
    if (looksLikeNames) parts.forEach((name) => authors.push(name));
  }
  const affiliation = affiliations[0] || null;
  return { authors: authors.map((full_name) => ({ full_name, affiliation })), affiliation };
}

export async function importDocx(buffer) {
  const { value: rawHtml, messages } = await mammoth.convertToHtml({ buffer }, { styleMap: STYLE_MAP, includeDefaultStyleMap: true });
  let html = embedYoutube(rawHtml);
  const warnings = (messages || []).filter((m) => m.type === 'warning' || m.type === 'error').map((m) => m.message).slice(0, 40);

  const blocks = toBlocks(html);
  const consumed = new Set();       // block html strings removed from the body
  const isHeading = (b) => /^h[1-6]$/.test(b.tag);
  const headingText = (b) => b.text.toLowerCase().replace(/[^a-z ]/g, '').trim();

  // ---- Title (first h1) ----
  let title = null; let titleIdx = -1;
  const h1 = blocks.find((b, i) => (b.tag === 'h1') && ((titleIdx = i), true));
  if (h1) { title = h1.text; consumed.add(h1.html); }
  else { const h2 = blocks.findIndex((b) => b.tag === 'h2'); if (h2 >= 0) { title = blocks[h2].text; titleIdx = h2; consumed.add(blocks[h2].html); } }

  // ---- Abstract ----
  let abstract = null;
  const absHeadingIdx = blocks.findIndex((b) => isHeading(b) && /^abstract$/.test(headingText(b)));
  if (absHeadingIdx >= 0) {
    consumed.add(blocks[absHeadingIdx].html);
    for (let i = absHeadingIdx + 1; i < blocks.length; i++) {
      if (isHeading(blocks[i])) break;
      abstract = (abstract ? abstract + ' ' : '') + blocks[i].text;
      consumed.add(blocks[i].html);
    }
  } else {
    const absPara = blocks.find((b) => b.tag === 'p' && /^abstract[:.\s—-]/i.test(b.text));
    if (absPara) { abstract = absPara.text.replace(/^abstract[:.\s—-]+/i, '').trim(); consumed.add(absPara.html); }
  }

  // ---- Keywords ----
  let keywords = [];
  const kwPara = blocks.find((b) => b.tag === 'p' && /^key\s?words?\s*[:.\-—]/i.test(b.text));
  if (kwPara) {
    keywords = kwPara.text.replace(/^key\s?words?\s*[:.\-—]+/i, '').split(/[,;]/).map((k) => k.trim()).filter(Boolean).slice(0, 12);
    consumed.add(kwPara.html);
  }

  // ---- References ----
  let references = [];
  const refHeadingIdx = blocks.findIndex((b) => isHeading(b) && /^(references|bibliography|works cited|reference list)$/.test(headingText(b)));
  if (refHeadingIdx >= 0) {
    consumed.add(blocks[refHeadingIdx].html);
    for (let i = refHeadingIdx + 1; i < blocks.length; i++) {
      const b = blocks[i];
      if (isHeading(b)) break;
      consumed.add(b.html);
      if (b.tag === 'ul' || b.tag === 'ol') {
        const items = b.html.match(/<li\b[^>]*>[\s\S]*?<\/li>/gi) || [];
        items.forEach((li) => { const t = clean(li); if (t) references.push({ ref_type: 'journal', raw_text: t }); });
      } else if (b.text) {
        references.push({ ref_type: 'journal', raw_text: b.text });
      }
    }
  }

  // ---- Authors / affiliation (front matter between title and abstract) ----
  const frontEnd = absHeadingIdx >= 0 ? absHeadingIdx
    : (kwPara ? blocks.indexOf(kwPara) : blocks.findIndex((b, i) => i > titleIdx && isHeading(b)));
  const front = blocks.slice(titleIdx + 1, frontEnd > titleIdx ? frontEnd : titleIdx + 3)
    .filter((b) => b.tag === 'p' && !consumed.has(b.html) && b.text);
  let authors = []; let affiliation = null;
  if (front.length) {
    const fm = parseFrontMatter(front.slice(0, 3));
    authors = fm.authors; affiliation = fm.affiliation;
    front.slice(0, 3).forEach((b) => { if (authors.length || affiliation) consumed.add(b.html); });
  }

  // ---- Body = everything not consumed ----
  let body = html;
  for (const c of consumed) body = body.replace(c, '');
  // Also strip the leading <h1> title if it survived (defensive).
  body = body.replace(/<h1\b[^>]*>[\s\S]*?<\/h1>/i, '').trim();

  const report = {
    title_detected: !!title,
    authors: authors.length,
    affiliation_detected: !!affiliation,
    abstract_detected: !!abstract,
    keywords: keywords.length,
    references: references.length,
    headings: (body.match(/<h[2-6][ >]/gi) || []).length,
    paragraphs: (body.match(/<p[ >]/gi) || []).length,
    tables: (body.match(/<table[ >]/gi) || []).length,
    images: (body.match(/<img[ >]/gi) || []).length,
    youtube: (body.match(/youtube(?:-nocookie)?\.com|youtu\.be/gi) || []).length,
    links: (body.match(/<a\s+href=/gi) || []).length,
  };

  return { title, authors, affiliation, abstract, keywords, references, html: body, report, warnings };
}
