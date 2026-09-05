// Server-side HTML rendering for public Research Note pages. These pages are
// standalone (they do NOT load the React app bundle) so they are lightweight and
// fully crawlable — the title, authors, abstract, body and references are all
// present in the raw HTML that Google / Google Scholar receive.
import sanitizeHtml from 'sanitize-html';
import { SERIES, LICENSES, canonicalPath, pad3, slugify } from './rn-data.js';
import { citationMetaTags, suggestedCitation, apaCitation, parseName } from './rn-citations.js';

export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Body HTML allowlist. Permits scholarly structure (figures, tables, callouts,
// code, equations) and YouTube-nocookie iframes only. Everything else is stripped.
export function sanitizeBody(html) {
  return sanitizeHtml(String(html || ''), {
    allowedTags: [
      'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'blockquote', 'ul', 'ol', 'li', 'strong', 'em', 'u',
      's', 'sub', 'sup', 'br', 'hr', 'a', 'img', 'figure', 'figcaption', 'table', 'thead',
      'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'code', 'pre', 'span', 'div', 'section',
      'aside', 'mark', 'small', 'iframe', 'dl', 'dt', 'dd', 'abbr', 'cite',
    ],
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel', 'id'],
      img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
      iframe: ['src', 'width', 'height', 'title', 'allow', 'allowfullscreen', 'frameborder', 'loading'],
      '*': ['class', 'id', 'data-figure', 'data-note', 'colspan', 'rowspan', 'style'],
    },
    allowedStyles: {
      '*': {
        'text-align': [/^left$|^right$|^center$|^justify$/],
        'width': [/^\d+(?:px|%)$/], 'float': [/^left$|^right$|^none$/],
      },
    },
    allowedClasses: false === true ? {} : undefined, // classes allowed via allowedAttributes['*']
    allowedIframeHostnames: ['www.youtube-nocookie.com', 'www.youtube.com', 'player.vimeo.com'],
    allowedSchemes: ['http', 'https', 'mailto', 'data'],
    transformTags: {
      a: (tagName, attribs) => {
        const href = attribs.href || '';
        const external = /^https?:\/\//i.test(href) && !href.includes('psychtrixweb');
        return {
          tagName: 'a',
          attribs: { ...attribs, ...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {}) },
        };
      },
    },
  });
}

function metaTagsHtml(tags) {
  return tags.map((t) => {
    const attr = t.name.startsWith('og:') || t.name.startsWith('article:') ? 'property' : 'name';
    return `<meta ${attr}="${esc(t.name)}" content="${esc(t.content)}" />`;
  }).join('\n    ');
}

const BASE_CSS = `
:root{--ink:#1a2130;--muted:#5b6472;--line:#e6e9ef;--bg:#ffffff;--soft:#f6f8fb;--brand:#0e63d6;--brand-soft:#e8f0fd;--accent:#0e9f6e}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.72 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-feature-settings:"kern","liga"}
.wrap{max-width:1120px;margin:0 auto;padding:0 24px}
a{color:var(--brand);text-decoration:none}a:hover{text-decoration:underline}
header.site{border-bottom:1px solid var(--line);background:#fff;position:sticky;top:0;z-index:10}
header.site .wrap{display:flex;align-items:center;justify-content:space-between;height:60px}
.brand{display:flex;align-items:center;gap:10px;font-weight:700;color:var(--ink)}
.brand img{width:28px;height:28px}
.brand small{display:block;font-weight:500;color:var(--muted);font-size:12px;letter-spacing:.02em}
nav.top a{color:var(--muted);font-size:14px;margin-left:18px}
.crumbs{font-size:13px;color:var(--muted);padding:18px 0 0}
.crumbs a{color:var(--muted)}
main{padding:0 0 64px}
.layout{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:48px;align-items:start}
@media(max-width:900px){.layout{grid-template-columns:minmax(0,1fr)}.aside{position:static !important}}
article{min-width:0}
.rn-type{display:inline-block;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--brand);background:var(--brand-soft);padding:5px 11px;border-radius:999px}
h1.title{font-size:34px;line-height:1.2;margin:16px 0 6px;letter-spacing:-.01em}
.subtitle{font-size:20px;color:var(--muted);margin:0 0 18px;font-weight:400}
.authors{margin:14px 0 4px;font-size:16px}
.authors .a{font-weight:600}
.aff{color:var(--muted);font-size:14px;margin:2px 0 0}
.pubmeta{color:var(--muted);font-size:14px;border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:12px 0;margin:20px 0;display:flex;flex-wrap:wrap;gap:6px 22px}
.pubmeta b{color:var(--ink);font-weight:600}
.abstract{background:var(--soft);border:1px solid var(--line);border-radius:12px;padding:20px 22px;margin:24px 0}
.abstract h2{margin:0 0 8px;font-size:13px;letter-spacing:.09em;text-transform:uppercase;color:var(--muted)}
.abstract p{margin:0}
.keywords{margin:14px 0 0;font-size:14px}
.keywords span{display:inline-block;background:#fff;border:1px solid var(--line);border-radius:999px;padding:3px 10px;margin:4px 6px 0 0;color:var(--muted)}
.body{font-size:17.5px}
.body h2{font-size:24px;margin:36px 0 10px;letter-spacing:-.01em}
.body h3{font-size:19px;margin:28px 0 8px}
.body p{margin:0 0 18px}
.body figure{margin:26px 0;text-align:center}
.body figure img{max-width:100%;height:auto;border-radius:8px;border:1px solid var(--line)}
.body figcaption{font-size:14px;color:var(--muted);margin-top:8px}
.body table{border-collapse:collapse;width:100%;margin:22px 0;font-size:15px;display:block;overflow-x:auto}
.body th,.body td{border:1px solid var(--line);padding:8px 12px;text-align:left}
.body thead th{background:var(--soft)}
.body blockquote{border-left:3px solid var(--brand);margin:22px 0;padding:4px 18px;color:var(--muted)}
.body pre{background:#0d1117;color:#e6edf3;border-radius:10px;padding:16px;overflow-x:auto;font-size:14px}
.body code{background:var(--soft);padding:.12em .35em;border-radius:5px;font-size:.92em}
.body pre code{background:none;padding:0}
.body .callout{background:var(--brand-soft);border:1px solid #cfe0fb;border-radius:10px;padding:14px 18px;margin:22px 0}
.body .video{position:relative;padding-bottom:56.25%;height:0;margin:24px 0}
.body .video iframe{position:absolute;inset:0;width:100%;height:100%;border:0;border-radius:10px}
.body iframe{max-width:100%}
.section-h{font-size:14px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:44px 0 12px;border-bottom:1px solid var(--line);padding-bottom:8px}
ol.refs{padding-left:22px;font-size:15px;color:#333}
ol.refs li{margin:0 0 12px;line-height:1.6}
ol.refs a{word-break:break-word}
.suggested{background:var(--soft);border:1px solid var(--line);border-radius:12px;padding:18px 20px;margin:16px 0;font-size:15px}
.suggested code{display:block;white-space:pre-wrap;word-break:break-word;background:#fff;border:1px solid var(--line);border-radius:8px;padding:12px;margin:8px 0 0}
.related a.note{display:block;padding:12px 0;border-bottom:1px solid var(--line);color:var(--ink)}
.related a.note:hover{color:var(--brand);text-decoration:none}
.related .n{font-size:12px;color:var(--muted);font-weight:600}
.aside{position:sticky;top:80px}
.card{border:1px solid var(--line);border-radius:12px;padding:16px;margin:0 0 18px;background:#fff}
.card h3{margin:0 0 12px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.btn{display:flex;align-items:center;gap:8px;width:100%;justify-content:center;border:1px solid var(--line);background:#fff;color:var(--ink);border-radius:9px;padding:10px 12px;font-size:14px;font-weight:600;cursor:pointer;margin:0 0 8px;text-decoration:none}
.btn:hover{background:var(--soft);text-decoration:none}
.btn.primary{background:var(--brand);color:#fff;border-color:var(--brand)}
.btn.primary:hover{background:#0b53b4}
.share{display:flex;flex-wrap:wrap;gap:8px}
.share a{flex:1;min-width:64px;text-align:center;border:1px solid var(--line);border-radius:8px;padding:8px 6px;font-size:12.5px;color:var(--muted)}
.share a:hover{background:var(--soft);text-decoration:none}
.license{font-size:13px;color:var(--muted);margin-top:6px}
.doi-pending{font-size:12.5px;color:var(--muted)}
footer.site{border-top:1px solid var(--line);color:var(--muted);font-size:13px;padding:28px 0;margin-top:40px}
footer.site .wrap{display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px}
.hub-hero{padding:34px 0 8px}
.hub-hero h1{font-size:32px;margin:6px 0 8px}
.hub-hero p{color:var(--muted);max-width:760px;margin:0}
.hub-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:20px;margin:22px 0}
.rncard{border:1px solid var(--line);border-radius:12px;padding:18px;background:#fff}
.rncard:hover{border-color:#cfd8e6}
.rncard .n{font-size:12px;color:var(--muted);font-weight:700;letter-spacing:.04em}
.rncard h3{margin:6px 0 8px;font-size:18px;line-height:1.3}
.rncard h3 a{color:var(--ink)}
.rncard .ab{color:var(--muted);font-size:14px;margin:0 0 10px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.rncard .au{font-size:13px;color:var(--muted)}
.filters{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:8px 0 0}
.filters form{display:flex;gap:8px}
.filters input,.filters select{border:1px solid var(--line);border-radius:8px;padding:8px 10px;font-size:14px}
.pill{display:inline-block;font-size:12px;color:var(--muted);border:1px solid var(--line);border-radius:999px;padding:3px 10px;margin:0 6px 6px 0}
.empty{color:var(--muted);padding:40px 0}
@media print{
  header.site,footer.site,.aside,.crumbs,.share,.no-print{display:none !important}
  .layout{grid-template-columns:1fr;gap:0}
  body{font-size:12pt;color:#000}
  a{color:#000;text-decoration:none}
  h1.title{font-size:22pt}
  .abstract{background:none;border:1px solid #999}
}
`;

function layout({ title, description, metaHtml, jsonLd, canonicalUrl, bodyClass = '', content, baseUrl }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description || '')}" />
    <link rel="canonical" href="${esc(canonicalUrl)}" />
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
    ${metaHtml || ''}
    ${jsonLd ? `<script type="application/ld+json">${jsonLd}</script>` : ''}
    <style>${BASE_CSS}</style>
  </head>
  <body class="${bodyClass}">
    <header class="site"><div class="wrap">
      <a class="brand" href="/research-notes">
        <img src="/icon-192.png" alt="" /><span>PsychtrixWeb <small>Research Notes</small></span>
      </a>
      <nav class="top">
        <a href="/research-notes">All Notes</a>
        <a href="/">PsychtrixWeb App</a>
      </nav>
    </div></div></header>
    <main><div class="wrap">${content}</div></main>
    <footer class="site"><div class="wrap">
      <span>© ${new Date().getUTCFullYear()} ${esc(SERIES.publisher)} · ${esc(SERIES.name)} series</span>
      <span><a href="/research-notes">Research Notes</a> · <a href="/sitemap-research-notes.xml">Sitemap</a></span>
    </div></footer>
    <script src="/research-notes/assets/rn.js" defer></script>
  </body>
</html>`;
}

function authorsBlock(note) {
  if (!note.authors?.length) return '';
  const names = note.authors.map((a) =>
    `<a class="a" href="/research-notes/authors/${esc(a.slug)}">${esc(a.full_name)}</a>${a.is_corresponding ? ' <sup title="Corresponding author">✉</sup>' : ''}`
  ).join(', ');
  const affs = [...new Set(note.authors.map((a) => a.affiliation_override || a.affiliation).filter(Boolean))];
  return `<div class="authors">${names}</div>${affs.length ? `<div class="aff">${affs.map(esc).join(' · ')}</div>` : ''}`;
}

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

function referencesHtml(note) {
  if (!note.references?.length) return '';
  const items = note.references.map((r) => {
    const link = r.doi ? `https://doi.org/${esc(r.doi)}` : (r.url || '');
    const linkHtml = link ? ` <a href="${esc(link)}" target="_blank" rel="noopener noreferrer">${esc(link)}</a>` : '';
    return `<li>${esc(r.raw_text)}${linkHtml}</li>`;
  }).join('\n');
  return `<h2 class="section-h" id="references">References</h2><ol class="refs">${items}</ol>`;
}

function relatedHtml(note) {
  const cites = note.internal_citations?.filter((c) => c.status === 'published') || [];
  const citedBy = note.cited_by || [];
  if (!cites.length && !citedBy.length) return '';
  const row = (n, label) =>
    `<a class="note" href="${esc(canonicalPath(n))}"><span class="n">${esc(label)} ${n.note_number != null ? pad3(n.note_number) : ''}</span>${esc(n.title)}</a>`;
  let html = '<div class="card related"><h3>Related Research Notes</h3>';
  for (const n of cites) html += row(n, 'RN');
  for (const n of citedBy) html += row(n, 'Cited by · RN');
  html += '</div>';
  return html;
}

function citeCard(note, canonicalUrl) {
  const cites = suggestedCitation(note, canonicalUrl);
  return `<div class="card"><h3>Cite this Research Note</h3>
    <div class="suggested" style="margin:0 0 10px;padding:0;border:0;background:none">
      <code id="apa-cite">${esc(cites.apa)}</code>
    </div>
    <button class="btn" data-copy="#apa-cite">Copy APA citation</button>
    <a class="btn" href="${esc(canonicalPath(note))}.bib">Download BibTeX</a>
    <a class="btn" href="${esc(canonicalPath(note))}.ris">Download RIS</a>
  </div>`;
}

function shareCard(note, canonicalUrl) {
  const u = encodeURIComponent(canonicalUrl);
  const t = encodeURIComponent(note.title || SERIES.name);
  return `<div class="card"><h3>Share</h3>
    <button class="btn primary" data-print>Download PDF</button>
    <button class="btn" data-copy-text="${esc(canonicalUrl)}">Copy link</button>
    <div class="share">
      <a href="mailto:?subject=${t}&body=${u}">Email</a>
      <a href="https://wa.me/?text=${t}%20${u}" target="_blank" rel="noopener">WhatsApp</a>
      <a href="https://www.linkedin.com/sharing/share-offsite/?url=${u}" target="_blank" rel="noopener">LinkedIn</a>
      <a href="https://twitter.com/intent/tweet?url=${u}&text=${t}" target="_blank" rel="noopener">X</a>
      <a href="https://www.facebook.com/sharer/sharer.php?u=${u}" target="_blank" rel="noopener">Facebook</a>
    </div>
  </div>`;
}

function infoCard(note) {
  const lic = LICENSES[note.license] || LICENSES['cc-by'];
  const licHtml = lic.url ? `<a href="${esc(lic.url)}" target="_blank" rel="noopener">${esc(lic.label)}</a>` : esc(lic.label);
  const doi = note.doi
    ? `<div><b>DOI</b> <a href="https://doi.org/${esc(note.doi)}" target="_blank" rel="noopener">${esc(note.doi)}</a></div>`
    : `<div class="doi-pending"><b>DOI</b> Not yet registered</div>`;
  return `<div class="card"><h3>Publication</h3>
    <div><b>Series</b> ${esc(SERIES.name)}</div>
    ${note.note_number != null ? `<div><b>Number</b> ${pad3(note.note_number)}</div>` : ''}
    <div><b>Type</b> ${esc(note.note_type)}</div>
    <div><b>Version</b> ${esc(note.version)}</div>
    ${note.published_at ? `<div><b>Published</b> ${esc(fmtDate(note.published_at))}</div>` : ''}
    ${doi}
    <div class="license"><b>License</b> ${licHtml}</div>
  </div>`;
}

function jsonLdArticle(note, canonicalUrl) {
  const authors = (note.authors || []).map((a) => ({
    '@type': 'Person', name: a.full_name,
    ...(a.affiliation ? { affiliation: { '@type': 'Organization', name: a.affiliation } } : {}),
    ...(a.orcid ? { identifier: a.orcid, sameAs: `https://orcid.org/${a.orcid}` } : {}),
    ...(a.google_scholar_url ? { sameAs: a.google_scholar_url } : {}),
  }));
  const obj = {
    '@context': 'https://schema.org', '@type': 'ScholarlyArticle',
    headline: note.title, name: note.title,
    ...(note.abstract ? { abstract: note.abstract, description: note.abstract } : {}),
    author: authors.length ? authors : { '@type': 'Organization', name: SERIES.publisher },
    ...(note.published_at ? { datePublished: new Date(note.published_at).toISOString() } : {}),
    dateModified: new Date(note.updated_at || note.published_at || Date.now()).toISOString(),
    inLanguage: 'en',
    ...(note.keywords?.length ? { keywords: note.keywords.join(', ') } : {}),
    isPartOf: { '@type': 'Periodical', name: SERIES.name, publisher: { '@type': 'Organization', name: SERIES.publisher } },
    publisher: { '@type': 'Organization', name: SERIES.publisher },
    mainEntityOfPage: canonicalUrl, url: canonicalUrl,
    ...(note.doi ? { identifier: { '@type': 'PropertyValue', propertyID: 'DOI', value: note.doi } } : {}),
    ...(note.note_number != null ? { issueNumber: note.note_number } : {}),
    license: (LICENSES[note.license] || {}).url || undefined,
  };
  return JSON.stringify(obj);
}

// ---- public exports --------------------------------------------------------
export function renderArticle(note, { baseUrl }) {
  const canonicalUrl = baseUrl + canonicalPath(note);
  const metaTags = citationMetaTags(note, canonicalUrl);
  const og = [
    { name: 'og:type', content: 'article' },
    { name: 'og:title', content: note.title },
    { name: 'og:description', content: note.abstract || note.subtitle || SERIES.name },
    { name: 'og:url', content: canonicalUrl },
    { name: 'og:site_name', content: SERIES.name },
    ...(note.published_at ? [{ name: 'article:published_time', content: new Date(note.published_at).toISOString() }] : []),
    ...(note.authors || []).map((a) => ({ name: 'article:author', content: a.full_name })),
    { name: 'twitter:card', content: 'summary' },
    { name: 'twitter:title', content: note.title },
    { name: 'twitter:description', content: note.abstract || SERIES.name },
  ];
  const metaHtml = metaTagsHtml([...metaTags, ...og]);
  const body = sanitizeBody(note.body_html);

  const content = `
  <div class="crumbs"><a href="/">Home</a> › <a href="/research-notes">Research Notes</a> › ${note.note_number != null ? 'RN ' + pad3(note.note_number) : esc(note.note_type)}</div>
  <div class="layout">
    <article>
      <span class="rn-type">${esc(note.note_type)}${note.note_number != null ? ' · ' + pad3(note.note_number) : ''}</span>
      <h1 class="title">${esc(note.title)}</h1>
      ${note.subtitle ? `<p class="subtitle">${esc(note.subtitle)}</p>` : ''}
      ${authorsBlock(note)}
      <div class="pubmeta">
        <span><b>${esc(SERIES.name)}</b>${note.note_number != null ? ' ' + pad3(note.note_number) : ''}</span>
        ${note.published_at ? `<span>Published ${esc(fmtDate(note.published_at))}</span>` : ''}
        <span>Version ${esc(note.version)}</span>
      </div>
      ${note.abstract ? `<div class="abstract"><h2>Abstract</h2><p>${esc(note.abstract)}</p>${note.keywords?.length ? `<div class="keywords"><b>Keywords:</b> ${note.keywords.map((k) => `<span>${esc(k)}</span>`).join('')}</div>` : ''}</div>` : ''}
      <div class="body">${body}</div>
      ${referencesHtml(note)}
      <h2 class="section-h">Suggested citation</h2>
      <div class="suggested"><code>${esc(apaCitation(note, canonicalUrl))}</code></div>
    </article>
    <aside class="aside">
      ${citeCard(note, canonicalUrl)}
      ${shareCard(note, canonicalUrl)}
      ${infoCard(note)}
      ${relatedHtml(note)}
    </aside>
  </div>`;

  return layout({
    title: `${note.title} · ${SERIES.name}${note.note_number != null ? ' ' + pad3(note.note_number) : ''}`,
    description: note.seo_description || note.abstract || note.subtitle || '',
    metaHtml, jsonLd: jsonLdArticle(note, canonicalUrl), canonicalUrl, content, baseUrl,
  });
}

export function renderHub({ notes, total, featured, mostViewed, mostCited, categories, page = 1, pageSize = 20, q = '', category = '' }, { baseUrl }) {
  const canonicalUrl = baseUrl + '/research-notes';
  const card = (n) => `<div class="rncard">
    <div class="n">${SERIES.name.toUpperCase()}${n.note_number != null ? ' ' + pad3(n.note_number) : ''} · ${esc(n.note_type)}</div>
    <h3><a href="${esc(canonicalPath(n))}">${esc(n.title)}</a></h3>
    ${n.abstract ? `<p class="ab">${esc(n.abstract)}</p>` : ''}
    <div class="au">${(n.authors || []).map((a) => esc(a.full_name)).join(', ') || esc(SERIES.publisher)}${n.published_at ? ' · ' + esc(fmtDate(n.published_at)) : ''}</div>
  </div>`;

  const sidebarList = (title, arr) => arr?.length ? `<div class="card"><h3>${esc(title)}</h3>${arr.map((n) =>
    `<a class="note" href="${esc(canonicalPath(n))}" style="display:block;padding:8px 0;border-bottom:1px solid var(--line);color:var(--ink)"><span class="n" style="color:var(--muted);font-size:12px">RN ${n.note_number != null ? pad3(n.note_number) : ''}</span><br>${esc(n.title)}</a>`).join('')}</div>` : '';

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pager = totalPages > 1 ? `<div style="margin:18px 0;display:flex;gap:8px">
    ${page > 1 ? `<a class="btn" style="width:auto;display:inline-flex" href="?page=${page - 1}${q ? '&q=' + encodeURIComponent(q) : ''}">← Newer</a>` : ''}
    <span class="pill">Page ${page} of ${totalPages}</span>
    ${page < totalPages ? `<a class="btn" style="width:auto;display:inline-flex" href="?page=${page + 1}${q ? '&q=' + encodeURIComponent(q) : ''}">Older →</a>` : ''}
  </div>` : '';

  const content = `
  <div class="hub-hero">
    <span class="rn-type">Scholarly series</span>
    <h1>PsychtrixWeb Research Notes</h1>
    <p>A scholarly knowledge series covering psychometrics, psychological assessment, research methodology,
    statistical analysis, digital mental health, artificial intelligence, measurement science and emerging
    research technologies. Open access — read, cite and share freely.</p>
    <div class="filters"><form method="get" action="/research-notes">
      <input type="search" name="q" placeholder="Search Research Notes…" value="${esc(q)}" />
      ${categories?.length ? `<select name="category" onchange="this.form.submit()"><option value="">All topics</option>${categories.map((c) => `<option value="${esc(c)}"${c === category ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select>` : ''}
      <button class="btn" style="width:auto;display:inline-flex" type="submit">Search</button>
    </form></div>
  </div>
  <div class="layout">
    <div>
      ${featured?.length ? `<h2 class="section-h">Featured</h2><div class="hub-grid">${featured.map(card).join('')}</div>` : ''}
      <h2 class="section-h">${q || category ? 'Results' : 'Latest Research Notes'}</h2>
      ${notes.length ? `<div class="hub-grid">${notes.map(card).join('')}</div>${pager}` : `<p class="empty">No Research Notes published yet. Check back soon.</p>`}
    </div>
    <aside class="aside">
      ${sidebarList('Most viewed', mostViewed)}
      ${sidebarList('Most cited', mostCited)}
      <div class="card"><h3>About the series</h3><p style="font-size:14px;color:var(--muted);margin:0">${esc(SERIES.name)} is published by ${esc(SERIES.publisher)}. Each note is openly accessible and citable.</p></div>
    </aside>
  </div>`;

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'Periodical', name: SERIES.name,
    publisher: { '@type': 'Organization', name: SERIES.publisher }, url: canonicalUrl,
    description: 'A scholarly knowledge series in psychometrics, assessment, methodology and measurement science.',
  });
  return layout({
    title: `PsychtrixWeb Research Notes — Scholarly series in psychometrics & measurement science`,
    description: 'Open-access scholarly Research Notes on psychometrics, psychological assessment, research methodology, statistics, and measurement science. Read, cite and share freely.',
    metaHtml: metaTagsHtml([
      { name: 'og:type', content: 'website' }, { name: 'og:title', content: 'PsychtrixWeb Research Notes' },
      { name: 'og:url', content: canonicalUrl },
    ]), jsonLd, canonicalUrl, content, baseUrl,
  });
}

export function renderAuthor(author, notes, { baseUrl }) {
  const canonicalUrl = baseUrl + `/research-notes/authors/${author.slug}`;
  const card = (n) => `<div class="rncard"><div class="n">${SERIES.name.toUpperCase()}${n.note_number != null ? ' ' + pad3(n.note_number) : ''}</div>
    <h3><a href="${esc(canonicalPath(n))}">${esc(n.title)}</a></h3>${n.abstract ? `<p class="ab">${esc(n.abstract)}</p>` : ''}</div>`;
  const content = `
  <div class="crumbs"><a href="/research-notes">Research Notes</a> › Authors › ${esc(author.full_name)}</div>
  <div class="layout">
    <div>
      <h1 class="title" style="margin-top:18px">${esc(author.full_name)}</h1>
      ${author.academic_title ? `<p class="subtitle">${esc(author.academic_title)}</p>` : ''}
      ${author.affiliation ? `<div class="aff">${esc(author.affiliation)}${author.country ? ' · ' + esc(author.country) : ''}</div>` : ''}
      ${author.bio ? `<div class="body" style="margin-top:18px"><p>${esc(author.bio)}</p></div>` : ''}
      <h2 class="section-h">Research Notes (${notes.length})</h2>
      ${notes.length ? `<div class="hub-grid">${notes.map(card).join('')}</div>` : '<p class="empty">No published Research Notes yet.</p>'}
    </div>
    <aside class="aside"><div class="card"><h3>Profile</h3>
      ${author.orcid ? `<div><b>ORCID</b> <a href="https://orcid.org/${esc(author.orcid)}" target="_blank" rel="noopener">${esc(author.orcid)}</a></div>` : ''}
      ${author.google_scholar_url ? `<div><a href="${esc(author.google_scholar_url)}" target="_blank" rel="noopener">Google Scholar profile</a></div>` : ''}
      ${author.website_url ? `<div><a href="${esc(author.website_url)}" target="_blank" rel="noopener">Website</a></div>` : ''}
      ${author.research_interests?.length ? `<div style="margin-top:8px">${author.research_interests.map((r) => `<span class="pill">${esc(r)}</span>`).join('')}</div>` : ''}
    </div></aside>
  </div>`;
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'Person', name: author.full_name,
    ...(author.affiliation ? { affiliation: { '@type': 'Organization', name: author.affiliation } } : {}),
    ...(author.orcid ? { sameAs: `https://orcid.org/${author.orcid}` } : {}), url: canonicalUrl,
  });
  return layout({
    title: `${author.full_name} · ${SERIES.name}`, description: author.bio || `Research Notes by ${author.full_name}`,
    metaHtml: '', jsonLd, canonicalUrl, content, baseUrl,
  });
}

export function notFoundPage(baseUrl) {
  return layout({
    title: 'Research Note not found', description: '', metaHtml: '<meta name="robots" content="noindex" />',
    jsonLd: '', canonicalUrl: baseUrl + '/research-notes', baseUrl,
    content: `<div class="empty" style="text-align:center;padding:80px 0"><h1>Research Note not found</h1>
      <p>This Research Note may have been moved or is not yet published.</p>
      <a class="btn primary" style="width:auto;display:inline-flex" href="/research-notes">Browse all Research Notes</a></div>`,
  });
}

// Small client script for copy / print / view-beacon (served same-origin so it
// passes the strict script-src 'self' CSP).
export const RN_CLIENT_JS = `
document.addEventListener('click',function(e){
  var c=e.target.closest('[data-copy]');
  if(c){var el=document.querySelector(c.getAttribute('data-copy'));if(el){navigator.clipboard.writeText(el.innerText).then(function(){var t=c.textContent;c.textContent='Copied ✓';setTimeout(function(){c.textContent=t},1500)})}return}
  var ct=e.target.closest('[data-copy-text]');
  if(ct){navigator.clipboard.writeText(ct.getAttribute('data-copy-text')).then(function(){var t=ct.textContent;ct.textContent='Copied ✓';setTimeout(function(){ct.textContent=t},1500)});return}
  var p=e.target.closest('[data-print]');
  if(p){window.print();return}
});
`;
