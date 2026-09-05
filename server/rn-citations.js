// Citation formatting for Research Notes: APA / BibTeX / RIS + the HighWire and
// Dublin Core <meta> tags that Google Scholar reads from raw server HTML.
import { SERIES, pad3 } from './rn-data.js';

// "Enoch Olusegun Oladunmoye" -> { last: 'Oladunmoye', initials: 'E. O.', apa: 'Oladunmoye, E. O.' }
export function parseName(full) {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { last: 'Unknown', initials: '', apa: 'Unknown', given: '' };
  const last = parts[parts.length - 1];
  const givens = parts.slice(0, -1);
  const initials = givens.map((g) => g[0].toUpperCase() + '.').join(' ');
  const apa = initials ? `${last}, ${initials}` : last;
  return { last, initials, apa, given: givens.join(' ') };
}

function pubYear(note) {
  const d = note.published_at ? new Date(note.published_at) : null;
  return d ? d.getUTCFullYear() : new Date().getUTCFullYear();
}

function authorsAPA(note) {
  const names = (note.authors || []).map((a) => parseName(a.full_name).apa);
  if (!names.length) return SERIES.publisher;
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]}, & ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, & ${names[names.length - 1]}`;
}

// Oladunmoye, E. O. (2026). Title. PsychtrixWeb Research Note, 018. Psychtrix Initiative Limited. URL
export function apaCitation(note, canonicalUrl) {
  const number = note.note_number != null ? `, ${pad3(note.note_number)}` : '';
  const doi = note.doi ? ` https://doi.org/${note.doi}` : '';
  const url = doi ? '' : ` ${canonicalUrl}`;
  return `${authorsAPA(note)} (${pubYear(note)}). ${stripDot(note.title)}. ${SERIES.name}${number}. ${SERIES.publisher}.${url}${doi}`.trim();
}

function stripDot(s) { return String(s || '').replace(/[.\s]+$/, ''); }

export function citationKey(note) {
  const first = (note.authors || [])[0];
  const last = first ? parseName(first.full_name).last.toLowerCase().replace(/[^a-z]/g, '') : 'psychtrix';
  const num = note.note_number != null ? `rn${pad3(note.note_number)}` : 'rn';
  return `${last}${pubYear(note)}${num}`;
}

export function bibtex(note, canonicalUrl) {
  const authors = (note.authors || []).map((a) => {
    const n = parseName(a.full_name);
    return n.given ? `${n.last}, ${n.given}` : n.last;
  }).join(' and ') || SERIES.publisher;
  const lines = [
    `@article{${citationKey(note)},`,
    `  title = {${braces(note.title)}},`,
    `  author = {${authors}},`,
    `  journal = {${SERIES.name}},`,
    `  year = {${pubYear(note)}},`,
    note.note_number != null ? `  number = {${note.note_number}},` : null,
    `  publisher = {${SERIES.publisher}},`,
    note.doi ? `  doi = {${note.doi}},` : null,
    `  url = {${canonicalUrl}},`,
    note.note_number != null ? `  note = {${SERIES.name} ${pad3(note.note_number)}}` : `  note = {${SERIES.name}}`,
    `}`,
  ].filter(Boolean);
  return lines.join('\n');
}

function braces(s) { return String(s || '').replace(/[{}]/g, ''); }

export function ris(note, canonicalUrl) {
  const lines = ['TY  - JOUR', `TI  - ${note.title || ''}`];
  for (const a of (note.authors || [])) {
    const n = parseName(a.full_name);
    lines.push(`AU  - ${n.given ? `${n.last}, ${n.given}` : n.last}`);
  }
  lines.push(`PY  - ${pubYear(note)}`);
  lines.push(`JO  - ${SERIES.name}`);
  lines.push(`JF  - ${SERIES.name}`);
  if (note.note_number != null) lines.push(`IS  - ${note.note_number}`);
  if (note.abstract) lines.push(`AB  - ${String(note.abstract).replace(/\s+/g, ' ').trim()}`);
  for (const k of (note.keywords || [])) lines.push(`KW  - ${k}`);
  lines.push(`PB  - ${SERIES.publisher}`);
  if (note.doi) lines.push(`DO  - ${note.doi}`);
  lines.push(`UR  - ${canonicalUrl}`);
  lines.push('ER  - ');
  return lines.join('\n');
}

// HighWire (citation_*) + Dublin Core (DC.*) meta tags. Google Scholar keys off
// these; only truthful fields are emitted (no fake DOI/ISSN/volume).
export function citationMetaTags(note, canonicalUrl, pdfUrl = null) {
  const tags = [];
  const add = (name, content) => { if (content != null && content !== '') tags.push({ name, content }); };
  add('citation_title', note.title);
  for (const a of (note.authors || [])) {
    add('citation_author', a.full_name);
    if (a.affiliation) add('citation_author_institution', a.affiliation);
    if (a.orcid) add('citation_author_orcid', a.orcid);
  }
  if (note.published_at) {
    const d = new Date(note.published_at);
    const ymd = `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
    add('citation_publication_date', ymd);
    add('citation_online_date', ymd);
    add('citation_date', ymd);
  }
  add('citation_journal_title', SERIES.name);
  add('citation_publisher', SERIES.publisher);
  if (note.note_number != null) {
    add('citation_technical_report_number', String(note.note_number));
    add('citation_issue', String(note.note_number));
  }
  if (note.first_page != null) add('citation_firstpage', String(note.first_page));
  if (note.last_page != null) add('citation_lastpage', String(note.last_page));
  if (SERIES.issn) add('citation_issn', SERIES.issn);
  if (note.doi) add('citation_doi', note.doi);
  add('citation_abstract_html_url', canonicalUrl);
  add('citation_fulltext_html_url', canonicalUrl);
  if (pdfUrl) add('citation_pdf_url', pdfUrl);
  if (note.language) add('citation_language', note.language); else add('citation_language', 'en');
  for (const k of (note.keywords || [])) add('citation_keywords', k);
  if (note.abstract) add('citation_abstract', note.abstract);

  // Dublin Core
  add('DC.title', note.title);
  for (const a of (note.authors || [])) add('DC.creator', a.full_name);
  add('DC.publisher', SERIES.publisher);
  add('DC.type', 'Text');
  add('DC.format', 'text/html');
  add('DC.language', 'en');
  if (note.published_at) add('DC.date', new Date(note.published_at).toISOString().slice(0, 10));
  if (note.doi) add('DC.identifier', `https://doi.org/${note.doi}`);
  else add('DC.identifier', canonicalUrl);
  add('DC.source', SERIES.name);
  for (const k of (note.keywords || [])) add('DC.subject', k);
  if (note.abstract) add('DC.description', note.abstract);
  return tags;
}

export function suggestedCitation(note, canonicalUrl) {
  return {
    apa: apaCitation(note, canonicalUrl),
    bibtex: bibtex(note, canonicalUrl),
    ris: ris(note, canonicalUrl),
  };
}
