// Data access for PsychtrixWeb Research Notes.
// Public reads are always constrained to status='published'; editor reads are
// unconstrained and gated by requireEditor in the router.
import { query } from './db.js';

export const SERIES = {
  name: 'PsychtrixWeb Research Note',
  publisher: 'Psychtrix Initiative Limited',
  issn: process.env.RN_ISSN || null,            // set only once a real ISSN is registered
};

export const NOTE_TYPES = [
  'Research Note', 'Methodological Note', 'Psychometric Note', 'Statistical Note',
  'Conceptual Note', 'Technology Note', 'Measurement Note', 'Replication Note',
  'Research Commentary', 'Data/Analysis Note', 'Tutorial Research Note', 'AI and Psychology Note',
];

export const LICENSES = {
  'all-rights-reserved': { label: 'All rights reserved', url: null },
  'cc-by':       { label: 'CC BY 4.0',       url: 'https://creativecommons.org/licenses/by/4.0/' },
  'cc-by-nc':    { label: 'CC BY-NC 4.0',    url: 'https://creativecommons.org/licenses/by-nc/4.0/' },
  'cc-by-nc-sa': { label: 'CC BY-NC-SA 4.0', url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/' },
};

export const STATUSES = ['draft', 'in_review', 'ready', 'published', 'archived'];

export function slugify(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-')
    .replace(/^-|-$/g, '').slice(0, 80) || 'note';
}

export function pad3(n) { return String(n ?? 0).padStart(3, '0'); }

// The canonical public path for a published note: /research-notes/001-the-slug
export function canonicalPath(note) {
  if (note.note_number == null) return `/research-notes/${note.slug}`;
  return `/research-notes/${pad3(note.note_number)}-${note.slug}`;
}

async function uniqueSlug(base, excludeId = null) {
  let slug = slugify(base);
  for (let i = 1; i < 200; i++) {
    const candidate = i === 1 ? slug : `${slug}-${i}`;
    const { rows } = await query(
      'SELECT id FROM research_notes WHERE slug = $1 AND ($2::uuid IS NULL OR id <> $2) LIMIT 1',
      [candidate, excludeId]);
    if (!rows.length) return candidate;
  }
  return `${slug}-${Date.now()}`;
}

async function uniqueAuthorSlug(base) {
  let slug = slugify(base);
  for (let i = 1; i < 200; i++) {
    const candidate = i === 1 ? slug : `${slug}-${i}`;
    const { rows } = await query('SELECT id FROM rn_authors WHERE slug = $1 LIMIT 1', [candidate]);
    if (!rows.length) return candidate;
  }
  return `${slug}-${Date.now()}`;
}

// ---- authors ---------------------------------------------------------------
export async function getAuthorsForNote(noteId) {
  const { rows } = await query(
    `SELECT a.*, na.position, na.affiliation_override, na.is_corresponding
       FROM research_note_authors na
       JOIN rn_authors a ON a.id = na.author_id
      WHERE na.note_id = $1
      ORDER BY na.position ASC, a.full_name ASC`, [noteId]);
  return rows;
}

// Upsert an author by (existing id) or by slug derived from the name, then link.
async function upsertAuthor(entry) {
  if (entry.id) {
    const { rows } = await query(
      `UPDATE rn_authors SET full_name=$2, academic_title=$3, affiliation=$4, country=$5,
              bio=$6, orcid=$7, google_scholar_url=$8, website_url=$9, research_interests=$10,
              profile_image_url=$11, updated_at=now()
        WHERE id=$1 RETURNING *`,
      [entry.id, entry.full_name || 'Unknown', entry.academic_title || null, entry.affiliation || null,
       entry.country || null, entry.bio || null, entry.orcid || null, entry.google_scholar_url || null,
       entry.website_url || null, entry.research_interests || [], entry.profile_image_url || null]);
    if (rows[0]) return rows[0];
  }
  const slug = await uniqueAuthorSlug(entry.full_name || 'author');
  const { rows } = await query(
    `INSERT INTO rn_authors (slug, full_name, academic_title, affiliation, country, bio, orcid,
        google_scholar_url, website_url, research_interests, profile_image_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [slug, entry.full_name || 'Unknown', entry.academic_title || null, entry.affiliation || null,
     entry.country || null, entry.bio || null, entry.orcid || null, entry.google_scholar_url || null,
     entry.website_url || null, entry.research_interests || [], entry.profile_image_url || null]);
  return rows[0];
}

export async function setAuthors(noteId, authors = []) {
  await query('DELETE FROM research_note_authors WHERE note_id = $1', [noteId]);
  let pos = 0;
  for (const entry of authors) {
    const a = await upsertAuthor(entry);
    await query(
      `INSERT INTO research_note_authors (note_id, author_id, position, affiliation_override, is_corresponding)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (note_id, author_id) DO UPDATE SET position=EXCLUDED.position,
         affiliation_override=EXCLUDED.affiliation_override, is_corresponding=EXCLUDED.is_corresponding`,
      [noteId, a.id, pos++, entry.affiliation_override || null, !!entry.is_corresponding]);
  }
}

export async function getAuthorBySlug(slug) {
  const { rows } = await query('SELECT * FROM rn_authors WHERE slug = $1 LIMIT 1', [slug]);
  return rows[0] || null;
}

export async function getPublishedNotesByAuthor(authorId) {
  const { rows } = await query(
    `SELECT n.* FROM research_notes n
       JOIN research_note_authors na ON na.note_id = n.id
      WHERE na.author_id = $1 AND n.status = 'published'
      ORDER BY n.published_at DESC`, [authorId]);
  return rows;
}

// ---- references ------------------------------------------------------------
export async function getReferences(noteId) {
  const { rows } = await query(
    'SELECT * FROM rn_references WHERE note_id = $1 ORDER BY position ASC, created_at ASC', [noteId]);
  return rows;
}

export async function setReferences(noteId, refs = []) {
  await query('DELETE FROM rn_references WHERE note_id = $1', [noteId]);
  let pos = 0;
  for (const r of refs) {
    await query(
      `INSERT INTO rn_references (note_id, position, ref_type, raw_text, csl, doi, url)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [noteId, pos++, r.ref_type || 'journal', r.raw_text || '', r.csl ? JSON.stringify(r.csl) : null,
       r.doi || null, r.url || null]);
  }
}

// ---- internal citation graph ----------------------------------------------
export async function getInternalCitations(citingNoteId) {
  const { rows } = await query(
    `SELECT n.id, n.note_number, n.slug, n.title, n.status, n.published_at
       FROM rn_internal_citations c JOIN research_notes n ON n.id = c.cited_note_id
      WHERE c.citing_note_id = $1 ORDER BY n.note_number ASC NULLS LAST`, [citingNoteId]);
  return rows;
}

export async function getCitedBy(citedNoteId) {
  const { rows } = await query(
    `SELECT n.id, n.note_number, n.slug, n.title
       FROM rn_internal_citations c JOIN research_notes n ON n.id = c.citing_note_id
      WHERE c.cited_note_id = $1 AND n.status = 'published'
      ORDER BY n.note_number ASC NULLS LAST`, [citedNoteId]);
  return rows;
}

export async function setInternalCitations(citingNoteId, citedIds = []) {
  await query('DELETE FROM rn_internal_citations WHERE citing_note_id = $1', [citingNoteId]);
  for (const cid of citedIds) {
    if (!cid || cid === citingNoteId) continue;
    await query(
      `INSERT INTO rn_internal_citations (citing_note_id, cited_note_id) VALUES ($1,$2)
       ON CONFLICT DO NOTHING`, [citingNoteId, cid]);
  }
}

// ---- notes -----------------------------------------------------------------
const LIST_COLS = `id, note_number, slug, note_type, status, title, subtitle, abstract,
  keywords, categories, license, doi, version, featured, view_count, download_count,
  published_at, created_at, updated_at`;

export async function getPublishedList({ limit = 20, offset = 0, category, keyword, q, year, sort = 'recent' } = {}) {
  const clauses = [`status = 'published'`];
  const vals = [];
  let i = 1;
  if (category) { clauses.push(`$${i} = ANY(categories)`); vals.push(category); i++; }
  if (keyword) { clauses.push(`$${i} = ANY(keywords)`); vals.push(keyword); i++; }
  if (year) { clauses.push(`EXTRACT(YEAR FROM published_at) = $${i}`); vals.push(Number(year)); i++; }
  if (q) { clauses.push(`(title ILIKE $${i} OR abstract ILIKE $${i})`); vals.push(`%${q}%`); i++; }
  const order = sort === 'views' ? 'view_count DESC, published_at DESC'
    : sort === 'number' ? 'note_number ASC'
    : 'published_at DESC';
  const where = clauses.join(' AND ');
  const { rows } = await query(
    `SELECT ${LIST_COLS} FROM research_notes WHERE ${where} ORDER BY ${order} LIMIT $${i} OFFSET $${i + 1}`,
    [...vals, Math.min(100, Math.max(1, limit)), Math.max(0, offset)]);
  const { rows: cnt } = await query(`SELECT count(*)::int AS n FROM research_notes WHERE ${where}`, vals);
  const withAuthors = await attachAuthors(rows);
  return { notes: withAuthors, total: cnt[0].n };
}

export async function getFeatured(limit = 3) {
  const { rows } = await query(
    `SELECT ${LIST_COLS} FROM research_notes WHERE status='published' AND featured=true
      ORDER BY published_at DESC LIMIT $1`, [limit]);
  return attachAuthors(rows);
}

export async function getMostViewed(limit = 5) {
  const { rows } = await query(
    `SELECT ${LIST_COLS} FROM research_notes WHERE status='published'
      ORDER BY view_count DESC, published_at DESC LIMIT $1`, [limit]);
  return attachAuthors(rows);
}

export async function getMostCited(limit = 5) {
  const { rows } = await query(
    `SELECT ${LIST_COLS.split(',').map(c => 'n.' + c.trim()).join(', ')},
            count(c.citing_note_id)::int AS cite_count
       FROM research_notes n
       LEFT JOIN rn_internal_citations c ON c.cited_note_id = n.id
      WHERE n.status='published'
      GROUP BY n.id
      HAVING count(c.citing_note_id) > 0
      ORDER BY cite_count DESC, n.published_at DESC LIMIT $1`, [limit]);
  return attachAuthors(rows);
}

async function attachAuthors(notes) {
  for (const n of notes) n.authors = await getAuthorsForNote(n.id);
  return notes;
}

// Full published note by URL segment (number-prefixed slug, bare number, or slug).
export async function getPublishedBySegment(seg) {
  const m = String(seg).match(/^(\d+)/);
  let note = null;
  if (m) {
    const { rows } = await query(
      `SELECT * FROM research_notes WHERE note_number = $1 AND status='published' LIMIT 1`, [Number(m[1])]);
    note = rows[0] || null;
  }
  if (!note) {
    const { rows } = await query(
      `SELECT * FROM research_notes WHERE slug = $1 AND status='published' LIMIT 1`, [seg]);
    note = rows[0] || null;
  }
  if (!note) return null;
  return hydrate(note);
}

export async function getByIdAnyStatus(id) {
  const { rows } = await query('SELECT * FROM research_notes WHERE id = $1 LIMIT 1', [id]);
  if (!rows[0]) return null;
  return hydrate(rows[0]);
}

async function hydrate(note) {
  note.authors = await getAuthorsForNote(note.id);
  note.references = await getReferences(note.id);
  note.internal_citations = await getInternalCitations(note.id);
  note.cited_by = await getCitedBy(note.id);
  return note;
}

export async function listForEditor() {
  const { rows } = await query(
    `SELECT ${LIST_COLS} FROM research_notes ORDER BY
       CASE status WHEN 'published' THEN 2 WHEN 'archived' THEN 3 ELSE 1 END,
       COALESCE(published_at, updated_at) DESC`);
  return attachAuthors(rows);
}

export async function createNote(data, userId) {
  const slug = await uniqueSlug(data.title || data.slug || 'untitled-research-note');
  const { rows } = await query(
    `INSERT INTO research_notes (slug, note_type, title, subtitle, abstract, keywords, categories,
        body_html, body_json, license, version, seo_title, seo_description, meta, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
    [slug, data.note_type || 'Research Note', data.title || 'Untitled Research Note', data.subtitle || null,
     data.abstract || null, data.keywords || [], data.categories || [], data.body_html || '',
     data.body_json ? JSON.stringify(data.body_json) : null, data.license || 'cc-by', data.version || '1.0',
     data.seo_title || null, data.seo_description || null, JSON.stringify(data.meta || {}), userId]);
  return rows[0];
}

const EDITABLE = ['note_type', 'title', 'subtitle', 'abstract', 'keywords', 'categories',
  'body_html', 'body_json', 'license', 'version', 'seo_title', 'seo_description', 'featured',
  'first_page', 'last_page', 'meta', 'doi'];

export async function updateNote(id, patch) {
  const cols = [];
  const vals = [];
  let i = 1;
  for (const key of EDITABLE) {
    if (!(key in patch)) continue;
    let v = patch[key];
    if (key === 'body_json' || key === 'meta') v = v == null ? null : JSON.stringify(v);
    cols.push(`${key} = $${i++}`);
    vals.push(v);
  }
  cols.push(`updated_at = now()`);
  vals.push(id);
  const { rows } = await query(
    `UPDATE research_notes SET ${cols.join(', ')} WHERE id = $${i} RETURNING *`, vals);
  return rows[0] || null;
}

// Publish: assign the next note number + finalize the slug + stamp published_at.
export async function publishNote(id) {
  const cur = await query('SELECT * FROM research_notes WHERE id=$1', [id]);
  const note = cur.rows[0];
  if (!note) return null;
  let number = note.note_number;
  if (number == null) {
    const { rows } = await query('SELECT COALESCE(MAX(note_number),0)+1 AS n FROM research_notes');
    number = rows[0].n;
  }
  const slug = await uniqueSlug(note.slug || note.title, id);
  const { rows } = await query(
    `UPDATE research_notes SET status='published', note_number=$2, slug=$3,
        published_at = COALESCE(published_at, now()), updated_at=now()
      WHERE id=$1 RETURNING *`, [id, number, slug]);
  return rows[0];
}

export async function setStatus(id, status) {
  if (status === 'published') return publishNote(id);
  const { rows } = await query(
    `UPDATE research_notes SET status=$2, updated_at=now() WHERE id=$1 RETURNING *`, [id, status]);
  return rows[0] || null;
}

export async function setNoteNumber(id, number) {
  const { rows } = await query(
    `UPDATE research_notes SET note_number=$2, updated_at=now() WHERE id=$1 RETURNING *`, [id, number]);
  return rows[0] || null;
}

export async function deleteNote(id) {
  await query('DELETE FROM research_notes WHERE id = $1', [id]);
}

export async function saveDoi(id, { doi, zenodo_deposition_id, zenodo_record_url, zenodo_concept_doi, doi_env }) {
  const { rows } = await query(
    `UPDATE research_notes SET doi=$2, zenodo_deposition_id=$3, zenodo_record_url=$4,
        zenodo_concept_doi=$5, doi_env=$6, updated_at=now() WHERE id=$1 RETURNING *`,
    [id, doi, zenodo_deposition_id, zenodo_record_url, zenodo_concept_doi || null, doi_env]);
  return rows[0] || null;
}

export async function bumpDownload(id) {
  await query('UPDATE research_notes SET download_count = download_count + 1 WHERE id = $1', [id]);
}

export async function bumpView(id, { country = null, referrer = null } = {}) {
  await query('UPDATE research_notes SET view_count = view_count + 1 WHERE id = $1', [id]);
  await query('INSERT INTO rn_page_views (note_id, event, country, referrer) VALUES ($1,$2,$3,$4)',
    [id, 'view', country, referrer]);
}

export async function allPublishedForSitemap() {
  const { rows } = await query(
    `SELECT note_number, slug, updated_at, published_at FROM research_notes
      WHERE status='published' ORDER BY note_number ASC`);
  return rows;
}

export async function authorsForSitemap() {
  const { rows } = await query(
    `SELECT DISTINCT a.slug FROM rn_authors a
       JOIN research_note_authors na ON na.author_id = a.id
       JOIN research_notes n ON n.id = na.note_id AND n.status='published'
      ORDER BY a.slug`);
  return rows;
}

export async function distinctCategories() {
  const { rows } = await query(
    `SELECT DISTINCT unnest(categories) AS c FROM research_notes WHERE status='published' ORDER BY 1`);
  return rows.map(r => r.c).filter(Boolean);
}
