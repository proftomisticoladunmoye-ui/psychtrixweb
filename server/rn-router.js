// Express wiring for Research Notes: public server-rendered pages (crawlable,
// no React bundle) + citation exports + sitemap, and an editor JSON API.
import express from 'express';
import { requireEditor } from './auth.js';
import * as data from './rn-data.js';
import { canonicalPath, pad3, SERIES } from './rn-data.js';
import {
  renderArticle, renderHub, renderAuthor, notFoundPage, RN_CLIENT_JS,
} from './rn-render.js';
import { bibtex, ris, suggestedCitation } from './rn-citations.js';

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Relaxed, page-scoped CSP for public RN pages: same-origin script (rn.js),
// external images (figures on object storage), and YouTube/Vimeo embeds only.
const RN_CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:", "font-src 'self' data:",
  "frame-src https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com",
  "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'",
].join('; ');

function baseUrl(req) {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  return `${proto}://${req.headers.host}`;
}

function sendHtml(res, html) {
  res.setHeader('Content-Security-Policy', RN_CSP);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
}

export function mountResearchNotes(app) {
  // ---- client asset (same-origin, passes strict script-src) ---------------
  app.get('/research-notes/assets/rn.js', (_req, res) => {
    res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(RN_CLIENT_JS);
  });

  // ---- sitemap ------------------------------------------------------------
  app.get('/sitemap-research-notes.xml', wrap(async (req, res) => {
    const base = baseUrl(req);
    const notes = await data.allPublishedForSitemap();
    const urls = [`${base}/research-notes`, ...notes.map((n) => base + canonicalPath(n))];
    const body = notes.map((n) => `  <url><loc>${base}${canonicalPath(n)}</loc>` +
      `<lastmod>${new Date(n.updated_at || n.published_at).toISOString()}</lastmod>` +
      `<changefreq>monthly</changefreq></url>`).join('\n');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      `  <url><loc>${base}/research-notes</loc><changefreq>daily</changefreq></url>\n${body}\n</urlset>`;
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.send(xml);
  }));

  // ---- hub ----------------------------------------------------------------
  app.get('/research-notes', wrap(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = 20;
    const { notes, total } = await data.getPublishedList({
      limit: pageSize, offset: (page - 1) * pageSize,
      q: req.query.q || '', category: req.query.category || '',
      year: req.query.year, sort: req.query.sort,
    });
    const [featured, mostViewed, mostCited, categories] = await Promise.all([
      page === 1 && !req.query.q && !req.query.category ? data.getFeatured(3) : Promise.resolve([]),
      data.getMostViewed(5), data.getMostCited(5), data.distinctCategories(),
    ]);
    sendHtml(res, renderHub({
      notes, total, featured, mostViewed, mostCited, categories, page, pageSize,
      q: req.query.q || '', category: req.query.category || '',
    }, { baseUrl: baseUrl(req) }));
  }));

  // ---- author profile (before :seg so 'authors' isn't treated as a note) --
  app.get('/research-notes/authors/:slug', wrap(async (req, res) => {
    const author = await data.getAuthorBySlug(req.params.slug);
    if (!author) { res.status(404); return sendHtml(res, notFoundPage(baseUrl(req))); }
    const notes = await data.getPublishedNotesByAuthor(author.id);
    for (const n of notes) n.authors = await data.getAuthorsForNote(n.id);
    sendHtml(res, renderAuthor(author, notes, { baseUrl: baseUrl(req) }));
  }));

  // ---- citation exports ---------------------------------------------------
  const exportHandler = (kind) => wrap(async (req, res) => {
    const note = await data.getPublishedBySegment(req.params.seg);
    if (!note) return res.status(404).send('Not found');
    const url = baseUrl(req) + canonicalPath(note);
    const fname = `${pad3(note.note_number)}-${note.slug}`;
    if (kind === 'bib') {
      res.setHeader('Content-Type', 'application/x-bibtex; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${fname}.bib"`);
      return res.send(bibtex(note, url));
    }
    res.setHeader('Content-Type', 'application/x-research-info-systems; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}.ris"`);
    res.send(ris(note, url));
  });
  app.get('/research-notes/:seg.bib', exportHandler('bib'));
  app.get('/research-notes/:seg.ris', exportHandler('ris'));

  // ---- article ------------------------------------------------------------
  app.get('/research-notes/:seg', wrap(async (req, res) => {
    const note = await data.getPublishedBySegment(req.params.seg);
    if (!note) { res.status(404); return sendHtml(res, notFoundPage(baseUrl(req))); }
    // Canonicalize the URL (SEO: one address per note) — 301 to the number-slug form.
    const canonical = canonicalPath(note);
    if (req.path !== canonical) return res.redirect(301, canonical);
    data.bumpView(note.id, { referrer: req.headers.referer || null }).catch(() => {});
    sendHtml(res, renderArticle(note, { baseUrl: baseUrl(req) }));
  }));

  // ======================================================================
  //  Editor JSON API  (/api/research-notes/*)  — requireEditor
  // ======================================================================
  const api = express.Router();
  api.use(requireEditor);

  api.get('/meta', (_req, res) => res.json({
    note_types: data.NOTE_TYPES, licenses: data.LICENSES, statuses: data.STATUSES,
  }));

  api.get('/', wrap(async (_req, res) => res.json({ data: await data.listForEditor() })));

  // Search published notes for inserting internal citations while writing.
  api.get('/search', wrap(async (req, res) => {
    const { notes } = await data.getPublishedList({ q: req.query.q || '', limit: 15 });
    res.json({ data: notes.map((n) => ({ id: n.id, note_number: n.note_number, slug: n.slug, title: n.title, authors: n.authors })) });
  }));

  api.post('/', wrap(async (req, res) => {
    const note = await data.createNote(req.body || {}, req.user.id);
    if (req.body?.authors) await data.setAuthors(note.id, req.body.authors);
    res.json({ data: await data.getByIdAnyStatus(note.id) });
  }));

  api.get('/:id', wrap(async (req, res) => {
    const note = await data.getByIdAnyStatus(req.params.id);
    if (!note) return res.status(404).json({ error: 'Not found' });
    res.json({ data: note });
  }));

  // Full-featured save: note fields + optional authors/references/internal citations.
  api.patch('/:id', wrap(async (req, res) => {
    const body = req.body || {};
    if (Object.keys(body).some((k) => k !== 'authors' && k !== 'references' && k !== 'internal_citation_ids')) {
      await data.updateNote(req.params.id, body);
    }
    if (Array.isArray(body.authors)) await data.setAuthors(req.params.id, body.authors);
    if (Array.isArray(body.references)) await data.setReferences(req.params.id, body.references);
    if (Array.isArray(body.internal_citation_ids)) await data.setInternalCitations(req.params.id, body.internal_citation_ids);
    res.json({ data: await data.getByIdAnyStatus(req.params.id) });
  }));

  api.post('/:id/status', wrap(async (req, res) => {
    const note = await data.setStatus(req.params.id, req.body?.status);
    res.json({ data: await data.getByIdAnyStatus(note.id) });
  }));

  api.post('/:id/number', wrap(async (req, res) => {
    if (!req.user.is_admin) return res.status(403).json({ error: 'Admin required' });
    await data.setNoteNumber(req.params.id, parseInt(req.body?.number, 10));
    res.json({ data: await data.getByIdAnyStatus(req.params.id) });
  }));

  api.delete('/:id', wrap(async (req, res) => {
    await data.deleteNote(req.params.id);
    res.json({ data: { id: req.params.id } });
  }));

  // Server-rendered preview for any status (shown in an iframe in the editor).
  api.get('/:id/rendered', wrap(async (req, res) => {
    const note = await data.getByIdAnyStatus(req.params.id);
    if (!note) return res.status(404).json({ error: 'Not found' });
    res.json({ html: renderArticle(note, { baseUrl: baseUrl(req) }), citation: suggestedCitation(note, baseUrl(req) + canonicalPath(note)) });
  }));

  app.use('/api/research-notes', api);
}
