// Seeds Research Note 001 — a genuine editorial introducing the series (not
// fabricated research). Safe to re-run: it upserts by slug.
//   node scripts/seed-research-note.mjs
import fs from 'node:fs';
for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
  if (line.includes('=') && !line.startsWith('#')) {
    const k = line.slice(0, line.indexOf('=')); const v = line.slice(line.indexOf('=') + 1);
    if (!process.env[k]) process.env[k] = v;
  }
}
const data = await import('../server/rn-data.js');
const { query } = await import('../server/db.js');

const existing = await query("SELECT id FROM research_notes WHERE slug LIKE 'introducing-the-psychtrixweb-research-note%' LIMIT 1");
let noteId;
if (existing.rows[0]) {
  noteId = existing.rows[0].id;
  console.log('Editorial already exists, refreshing content:', noteId);
} else {
  const created = await data.createNote({
    note_type: 'Research Commentary',
    title: 'Introducing the PsychtrixWeb Research Note Series',
    subtitle: 'An open-access channel for concise, citable scholarship in psychometrics and measurement science',
    abstract: 'The PsychtrixWeb Research Note series is a continuing, open-access scholarly channel for concise research communications in psychometrics, psychological assessment, research methodology, statistical analysis, and measurement science. This inaugural editorial outlines the aims and scope of the series, the range of Research Note types it accommodates, and the open, citation-friendly principles that guide it. We describe how each Note is published as a permanent, independently citable document with structured scholarly metadata, and how the series is designed to grow into an interconnected knowledge base that is genuinely useful to researchers worldwide.',
    keywords: ['psychometrics', 'measurement science', 'open access', 'scholarly communication', 'research methodology', 'psychological assessment'],
    categories: ['Editorial', 'Measurement science'],
    license: 'cc-by',
    body_html: `
<h2>Aims and scope</h2>
<p>The <strong>PsychtrixWeb Research Note</strong> series publishes short, rigorous research communications in psychometrics, psychological and educational assessment, research methodology, statistical analysis, digital mental health, artificial intelligence in psychology, and measurement science more broadly. A Research Note is shorter and more flexible than a full journal article, yet it retains the essential scholarly apparatus: a clear abstract, keywords, structured argument, evidence, references, and a suggested citation.</p>
<p>Notes are intended to move useful ideas into the scholarly record quickly — a methodological clarification, a psychometric result, a replication, a conceptual argument, a tutorial, or a commentary on emerging technology — without the overhead of a conventional article where that overhead adds little.</p>

<h2>Types of Research Note</h2>
<p>To keep the format honest to its content, authors choose an appropriate Note type rather than forcing every contribution into one template. Current types include the Research Note, Methodological Note, Psychometric Note, Statistical Note, Conceptual Note, Technology Note, Measurement Note, Replication Note, Research Commentary, Data/Analysis Note, Tutorial Research Note, and AI and Psychology Note.</p>

<h2>Open, permanent, and citable</h2>
<p>Every published Research Note is openly accessible without an account, lives at a permanent scholarly URL, and carries structured metadata so it can be discovered, referenced, and reused. Each Note provides a suggested citation and machine-readable export (BibTeX and RIS), and — where a Digital Object Identifier is eventually registered — a DOI. Notes are versioned, so corrections and updates are transparent.</p>

<div class="callout"><strong>Open access.</strong> Research Notes are published under a Creative Commons licence by default, so readers may share and build upon them with attribution.</div>

<h2>An interconnected knowledge base</h2>
<p>The series is designed to accumulate into more than a list of documents. Notes can cite one another, and those relationships are surfaced as related reading and "cited by" links. Over time this creates a navigable knowledge graph in which foundational Notes on reliability, validity, factor analysis, item response theory, measurement invariance, and cultural adaptation support later work that builds on them.</p>

<h2>Invitation</h2>
<p>We invite concise, well-argued contributions that make a genuine scholarly point. The measure of a good Research Note is simple: it should be useful to a researcher who has never heard of PsychtrixWeb, encountered through a search, a citation, or a colleague's reference list, and valuable on its own terms.</p>
`,
  }, null);
  noteId = created.id;
  console.log('Created editorial note:', noteId);
}

// Author
await data.setAuthors(noteId, [{
  full_name: 'Enoch O. Oladunmoye',
  affiliation: 'Psychtrix Initiative Limited',
  country: 'Nigeria',
  is_corresponding: true,
}]);

// A representative reference so the References section renders.
await data.setReferences(noteId, [
  { ref_type: 'journal', raw_text: 'American Educational Research Association, American Psychological Association, & National Council on Measurement in Education. (2014). Standards for educational and psychological testing. American Educational Research Association.' },
]);

await data.publishNote(noteId);
const full = await data.getByIdAnyStatus(noteId);
console.log('Published as RN', String(full.note_number).padStart(3, '0'), '->', data.canonicalPath(full));
await query('SELECT 1'); // keep pool warm until logs flush
process.exit(0);
