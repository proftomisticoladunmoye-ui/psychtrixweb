// Personal-name normalization for citations + Scholar metadata. Deliberately
// dependency-free (no DB, no series config) so it is unit-testable in isolation
// and safe to import from anywhere.

// Canonical personal name for citations/metadata: drop trailing academic
// credential / honorific clauses (", PhD", ", MD, MBA", leading "Dr"/"Prof.")
// and uppercase lone initials ("o." -> "O.") so the same person reads
// identically across every note (Google Scholar clusters authors by exact
// name, and a name entered as "Jane Doe, PhD" otherwise parses with the surname
// "PhD"). Genuine name suffixes (Jr, Sr, II–IV) are intentionally NOT stripped.
export function cleanAuthorName(full) {
  const CREDENTIAL = /^(ph\.?d\.?|d\.?phil\.?|m\.?d\.?|m\.?sc\.?|m\.?s\.?|m\.?a\.?|b\.?sc\.?|b\.?a\.?|b\.?ed\.?|m\.?ed\.?|m\.?b\.?a\.?|m\.?phil\.?|psy\.?d\.?|ed\.?d\.?|d\.?sc\.?|llb|llm|frcp|mrcp|facp|facs|rn|np)$/i;
  let s = String(full || '').replace(/\s+/g, ' ').trim();
  let parts = s.split(',').map((p) => p.trim()).filter(Boolean);
  while (parts.length > 1 && CREDENTIAL.test(parts[parts.length - 1].replace(/[\s.]/g, '') || '·')) parts.pop();
  s = parts.join(', ').replace(/^(dr|prof|mr|mrs|ms|miss)\.?\s+/i, '');
  s = s.split(' ').map((t) => (/^[a-z]\.?$/.test(t) ? t.toUpperCase() : t)).join(' ');
  return s.trim();
}
