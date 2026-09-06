// Express wiring for Research Notes: public server-rendered pages (crawlable,
// no React bundle) + citation exports + sitemap, and an editor JSON API.
import express from 'express';
import { requireEditor } from './auth.js';
import * as data from './rn-data.js';
import { canonicalPath, pad3, SERIES } from './rn-data.js';
import {
  renderArticle, renderHub, renderAuthor, notFoundPage, RN_CLIENT_JS, sanitizeBody,
} from './rn-render.js';
import { bibtex, ris, suggestedCitation } from './rn-citations.js';
import { importDocx } from './rn-docx.js';
import { putImage, getMediaForServe, listMedia, externalizeDataUriImages, isAllowedImage, storageMode } from './rn-storage.js';
import * as comments from './rn-comments.js';
import { notifyNewComment, notifyCommentApproved, mailEnabled } from './rn-mail.js';
import { buildPdf } from './rn-pdf.js';
import { mintDoi, zenodoEnabled, zenodoEnv } from './rn-zenodo.js';

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Relaxed, page-scoped CSP for public RN pages: same-origin script (rn.js),
// external images (figures on object storage), and YouTube/Vimeo embeds only.
const RN_CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:", "font-src 'self' data:",
  "frame-src https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com",
  "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'",
].join('; ');

// Small in-memory limiter for public comment submissions (per IP).
function makeLimiter({ windowMs, max }) {
  const hits = new Map();
  return (req, res, next) => {
    const ip = req.ip || 'unknown';
    const now = Date.now();
    let e = hits.get(ip);
    if (!e || e.resetAt <= now) { e = { count: 0, resetAt: now + windowMs }; hits.set(ip, e); }
    if (++e.count > max) return res.status(429).send('Too many submissions. Please try again later.');
    next();
  };
}
const commentLimiter = makeLimiter({ windowMs: 10 * 60 * 1000, max: 6 });

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
    const [notes, authors] = await Promise.all([data.allPublishedForSitemap(), data.authorsForSitemap()]);
    const noteUrls = notes.map((n) => `  <url><loc>${base}${canonicalPath(n)}</loc>` +
      `<lastmod>${new Date(n.updated_at || n.published_at).toISOString()}</lastmod>` +
      `<changefreq>monthly</changefreq></url>`).join('\n');
    const authorUrls = authors.map((a) => `  <url><loc>${base}/research-notes/authors/${a.slug}</loc><changefreq>monthly</changefreq></url>`).join('\n');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      `  <url><loc>${base}/research-notes</loc><changefreq>daily</changefreq></url>\n${noteUrls}\n${authorUrls}\n</urlset>`;
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

  // ---- media (figures stored in Neon when object storage isn't configured) -
  app.get('/research-notes/media/:id', wrap(async (req, res) => {
    const m = await getMediaForServe(req.params.id);
    if (!m) return res.status(404).send('Not found');
    if (!m.data) return res.redirect(302, m.url); // object storage: bytes live off-origin
    res.setHeader('Content-Type', m.mime || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(m.data);
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

  // ---- PDF (same publication as the HTML; Scholar's citation_pdf_url) -----
  app.get('/research-notes/:seg.pdf', wrap(async (req, res) => {
    const note = await data.getPublishedBySegment(req.params.seg);
    if (!note) return res.status(404).send('Not found');
    const buf = await buildPdf(note, baseUrl(req));
    data.bumpDownload(note.id).catch(() => {});
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${pad3(note.note_number)}-${note.slug}.pdf"`);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(buf);
  }));

  // ---- article ------------------------------------------------------------
  app.get('/research-notes/:seg', wrap(async (req, res) => {
    const note = await data.getPublishedBySegment(req.params.seg);
    if (!note) { res.status(404); return sendHtml(res, notFoundPage(baseUrl(req))); }
    // Canonicalize the URL (SEO: one address per note) — 301 to the number-slug form.
    const canonical = canonicalPath(note);
    if (req.path !== canonical) return res.redirect(301, canonical);
    note.comments = await comments.getApprovedComments(note.id);
    data.bumpView(note.id, { referrer: req.headers.referer || null }).catch(() => {});
    const flash = req.query.discussion === 'pending' ? 'comment-pending'
      : req.query.discussion === 'error' ? 'comment-error' : null;
    sendHtml(res, renderArticle(note, { baseUrl: baseUrl(req), flash }));
  }));

  // ---- public comment submission (no account; moderated) ------------------
  app.post('/research-notes/:seg/comments', commentLimiter,
    express.urlencoded({ extended: false, limit: '64kb' }),
    wrap(async (req, res) => {
      const note = await data.getPublishedBySegment(req.params.seg);
      if (!note) return res.status(404).send('Not found');
      const back = (flag) => res.redirect(303, `${canonicalPath(note)}?discussion=${flag}#discussion`);
      const b = req.body || {};
      if (b.website) return back('pending');            // honeypot tripped — silently drop
      const name = String(b.author_name || '').trim();
      const email = String(b.author_email || '').trim();
      const body = String(b.body || '').trim();
      if (name.length < 2 || !/^\S+@\S+\.\S+$/.test(email) || body.length < 2) return back('error');
      const comment = {
        author_name: name.slice(0, 120), author_email: email.slice(0, 200),
        author_affiliation: String(b.author_affiliation || '').trim().slice(0, 200) || null,
        author_orcid: String(b.author_orcid || '').trim().slice(0, 40) || null,
        body: body.slice(0, 5000),
      };
      await comments.submitComment(note.id, { ...comment, ip: req.ip, created_by: req.user?.id || null });
      notifyNewComment({ note, comment, baseUrl: baseUrl(req) }); // fire-and-forget
      back('pending');
    }));

  // ======================================================================
  //  Editor JSON API  (/api/research-notes/*)  — requireEditor
  // ======================================================================
  const api = express.Router();
  api.use(requireEditor);

  api.get('/meta', (_req, res) => res.json({
    note_types: data.NOTE_TYPES, licenses: data.LICENSES, statuses: data.STATUSES,
    storage: storageMode(), mail: mailEnabled(),
    zenodo: { enabled: zenodoEnabled(), env: zenodoEnv() },
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

  // Word (.docx) ingestion -> a new draft note + QC report. The client POSTs the
  // raw file bytes as application/octet-stream.
  api.post('/import-docx',
    express.raw({ type: () => true, limit: '30mb' }),
    wrap(async (req, res) => {
      const buf = req.body;
      if (!Buffer.isBuffer(buf) || !buf.length) return res.status(400).json({ error: 'No document received' });
      let result;
      try { result = await importDocx(buf); }
      catch (e) { return res.status(422).json({ error: 'Could not read this .docx file. ' + (e?.message || '') }); }
      const filenameTitle = decodeURIComponent(req.query.filename || '').replace(/\.docx$/i, '').trim();
      const note = await data.createNote({
        title: result.title || filenameTitle || 'Imported Research Note',
        body_html: sanitizeBody(result.html),
        meta: { imported_from: 'docx', imported_at: new Date().toISOString() },
      }, req.user.id);
      // Move any images the document embedded (mammoth inlines them as data URIs)
      // into durable storage so the body stays small and the figures persist.
      const externalized = await externalizeDataUriImages(note.body_html, { noteId: note.id, userId: req.user.id });
      if (externalized !== note.body_html) await data.updateNote(note.id, { body_html: externalized });
      res.json({ data: await data.getByIdAnyStatus(note.id), report: result.report, warnings: result.warnings });
    }));

  // Image upload for the editor. Client POSTs raw image bytes; the mime comes
  // from the Content-Type header. Returns the stored URL + dimensions.
  api.post('/media',
    express.raw({ type: () => true, limit: '25mb' }),
    wrap(async (req, res) => {
      const buf = req.body;
      if (!Buffer.isBuffer(buf) || !buf.length) return res.status(400).json({ error: 'No image received' });
      const mime = (req.headers['content-type'] || '').split(';')[0].trim();
      if (!isAllowedImage(mime)) return res.status(415).json({ error: 'Unsupported image type. Use PNG, JPEG, WebP or GIF.' });
      const noteId = req.query.note_id || null;
      const stored = await putImage({
        buffer: buf, mime, noteId, userId: req.user.id,
        alt: req.query.alt || null, caption: req.query.caption || null,
        originalName: req.query.filename ? decodeURIComponent(req.query.filename) : null,
      });
      res.json({ data: stored });
    }));

  api.get('/:id/media', wrap(async (req, res) => res.json({ data: await listMedia(req.params.id) })));

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

  // Mint a real DOI on Zenodo (explicit, permanent). Published notes only, and
  // only when no DOI exists yet.
  api.post('/:id/mint-doi', wrap(async (req, res) => {
    if (!zenodoEnabled()) return res.status(400).json({ error: 'Zenodo is not configured. Set ZENODO_TOKEN on the server.' });
    const note = await data.getByIdAnyStatus(req.params.id);
    if (!note) return res.status(404).json({ error: 'Not found' });
    if (note.status !== 'published') return res.status(400).json({ error: 'Publish the Research Note before minting a DOI.' });
    if (note.doi) return res.status(409).json({ error: `This note already has a DOI (${note.doi}).` });
    const pdf = await buildPdf(note, baseUrl(req));
    const result = await mintDoi(note, { filename: `${pad3(note.note_number)}-${note.slug}.pdf`, buffer: pdf }, baseUrl(req));
    await data.saveDoi(note.id, {
      doi: result.doi, zenodo_deposition_id: result.deposition_id, zenodo_record_url: result.record_url,
      zenodo_concept_doi: result.concept_doi, doi_env: result.env,
    });
    res.json({ data: await data.getByIdAnyStatus(note.id), zenodo: result });
  }));

  // Server-rendered preview for any status (shown in an iframe in the editor).
  api.get('/:id/rendered', wrap(async (req, res) => {
    const note = await data.getByIdAnyStatus(req.params.id);
    if (!note) return res.status(404).json({ error: 'Not found' });
    res.json({ html: renderArticle(note, { baseUrl: baseUrl(req) }), citation: suggestedCitation(note, baseUrl(req) + canonicalPath(note)) });
  }));

  app.use('/api/research-notes', api);

  // ---- comment moderation API (separate mount to avoid /:id collisions) ---
  const cmt = express.Router();
  cmt.use(requireEditor);
  cmt.get('/', wrap(async (req, res) => res.json({
    data: await comments.listForModeration(req.query.status || 'pending'),
    counts: await comments.moderationCounts(),
  })));
  cmt.post('/:id/status', wrap(async (req, res) => {
    const row = await comments.setStatus(req.params.id, req.body?.status, req.user.id);
    if (row && row.status === 'approved' && row.author_email && !row.is_editor_reply) {
      const note = await data.getByIdAnyStatus(row.note_id);
      if (note) notifyCommentApproved({ note, comment: row, baseUrl: baseUrl(req) }); // fire-and-forget
    }
    res.json({ data: row });
  }));
  cmt.post('/reply', wrap(async (req, res) => {
    const { note_id, parent_id, body } = req.body || {};
    if (!note_id || !body?.trim()) return res.status(400).json({ error: 'note_id and body are required' });
    res.json({ data: await comments.editorReply(note_id, parent_id || null, body.trim(), req.user) });
  }));
  cmt.delete('/:id', wrap(async (req, res) => { await comments.deleteComment(req.params.id); res.json({ data: { id: req.params.id } }); }));
  app.use('/api/rn-comments', cmt);
}
