// Zenodo DOI minting. Registers a real, permanent DOI for a Research Note by
// creating a Zenodo deposition, attaching metadata + the note's PDF, and
// publishing it. Driven entirely by env:
//   ZENODO_TOKEN  — personal access token (scopes: deposit:write, deposit:actions)
//   ZENODO_ENV    — 'sandbox' (default, test DOIs) | 'production' (real DOIs)
// Minting is an explicit, user-triggered admin action — never automatic.
import { SERIES, LICENSES, canonicalPath, pad3 } from './rn-data.js';
import { parseName } from './rn-citations.js';

const ENV = (process.env.ZENODO_ENV || 'sandbox').toLowerCase() === 'production' ? 'production' : 'sandbox';
const BASE = ENV === 'production' ? 'https://zenodo.org' : 'https://sandbox.zenodo.org';
const TOKEN = process.env.ZENODO_TOKEN || '';

export function zenodoEnabled() { return !!TOKEN; }
export function zenodoEnv() { return ENV; }

const LICENSE_ID = {
  'cc-by': 'cc-by-4.0', 'cc-by-nc': 'cc-by-nc-4.0', 'cc-by-nc-sa': 'cc-by-nc-sa-4.0',
  'all-rights-reserved': 'other-closed',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, { method = 'GET', body, raw, _retried = false } = {}) {
  const url = `${BASE}${path}${path.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(TOKEN)}`;
  const opts = { method, headers: {} };
  if (raw) { opts.body = raw.buffer; opts.headers['Content-Type'] = 'application/octet-stream'; }
  else if (body) { opts.body = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json'; }
  const res = await fetch(url, opts);
  const text = await res.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* non-json (e.g. an HTML error page) */ }
  if (!res.ok) {
    // Zenodo/Cloudflare rate limiting — a temporary IP block, not an account issue.
    if (res.status === 403 || res.status === 429) {
      // One automatic retry after a short pause (honours Retry-After, capped).
      if (!_retried) {
        const ra = parseInt(res.headers.get('retry-after') || '', 10);
        const waitMs = Math.min(Math.max((Number.isFinite(ra) ? ra : 8) * 1000, 4000), 20000);
        await sleep(waitMs);
        return api(path, { method, body, raw, _retried: true });
      }
      throw Object.assign(new Error(
        'Zenodo is temporarily rate-limiting requests from the server ("unusual traffic"). This is temporary and not a problem with your account or token — please wait a few minutes and try minting again (and avoid repeated clicks).'
      ), { status: 429 });
    }
    // Otherwise surface a concise message, never a full HTML page.
    const msg = json?.message || json?.errors?.[0]?.message || (text && text.length < 200 ? text.trim() : `HTTP ${res.status}`);
    throw Object.assign(new Error(`Zenodo error (${res.status}): ${msg}`), { status: 502, zenodo: json });
  }
  return json;
}

function zenodoMetadata(note, canonicalUrl) {
  const creators = (note.authors || []).map((a) => {
    const n = parseName(a.full_name);
    const c = { name: n.given ? `${n.last}, ${n.given}` : n.last };
    if (a.affiliation) c.affiliation = a.affiliation;
    if (a.orcid) c.orcid = a.orcid;
    return c;
  });
  const description = (note.abstract || note.title) +
    `\n\nPublished in the ${SERIES.name} series by ${SERIES.publisher}. Read online: ${canonicalUrl}`;
  return {
    upload_type: 'publication',
    publication_type: 'article',
    title: note.title,
    creators: creators.length ? creators : [{ name: SERIES.publisher }],
    description,
    keywords: note.keywords || [],
    access_right: 'open',
    license: LICENSE_ID[note.license] || 'cc-by-4.0',
    publication_date: note.published_at ? new Date(note.published_at).toISOString().slice(0, 10) : undefined,
    journal_title: SERIES.name,
    journal_issue: note.note_number != null ? String(note.note_number) : undefined,
    related_identifiers: [{ relation: 'isIdenticalTo', identifier: canonicalUrl, resource_type: 'publication-article' }],
    notes: `${SERIES.name} ${note.note_number != null ? pad3(note.note_number) : ''}`.trim(),
  };
}

// Mint a DOI for a published note. `pdf` = { filename, buffer }. Returns
// { doi, record_url, concept_doi, deposition_id, env }.
export async function mintDoi(note, pdf, baseUrl) {
  if (!zenodoEnabled()) throw Object.assign(new Error('Zenodo is not configured (set ZENODO_TOKEN).'), { status: 400 });
  const canonicalUrl = baseUrl + canonicalPath(note);

  // 1) create deposition
  const dep = await api('/api/deposit/depositions', { method: 'POST', body: {} });
  const depId = dep.id;
  const bucket = dep.links?.bucket;

  // If anything after this fails, delete the unpublished draft so no orphan
  // deposition is left behind on the account (best-effort).
  try {
    // 2) upload the PDF via the bucket API
    const filename = pdf.filename || `${pad3(note.note_number)}-${note.slug}.pdf`;
    if (!bucket) throw new Error('Zenodo did not return an upload bucket.');
    await api(`${bucket.replace(BASE, '')}/${encodeURIComponent(filename)}`, { method: 'PUT', raw: { buffer: pdf.buffer } });

    // 3) metadata
    await api(`/api/deposit/depositions/${depId}`, { method: 'PUT', body: { metadata: zenodoMetadata(note, canonicalUrl) } });

    // 4) publish
    const pub = await api(`/api/deposit/depositions/${depId}/actions/publish`, { method: 'POST' });

    const doi = pub.doi || pub.metadata?.doi || dep.metadata?.prereserve_doi?.doi;
    return {
      doi,
      concept_doi: pub.conceptdoi || null,
      record_url: pub.links?.record_html || pub.links?.html || (doi ? `https://doi.org/${doi}` : null),
      deposition_id: String(depId),
      env: ENV,
    };
  } catch (e) {
    try { await api(`/api/deposit/depositions/${depId}`, { method: 'DELETE' }); } catch { /* leave it if cleanup also fails */ }
    throw e;
  }
}
