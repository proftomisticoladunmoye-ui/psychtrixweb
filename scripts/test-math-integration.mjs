import fs from 'node:fs';
for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
  if (line.includes('=') && !line.startsWith('#')) { const k = line.slice(0, line.indexOf('=')); if (!process.env[k]) process.env[k] = line.slice(line.indexOf('=') + 1); }
}
const { renderArticle } = await import('../server/rn-render.js');
const { buildPdf } = await import('../server/rn-pdf.js');

const note = {
  id: 't', note_number: 999, slug: 'math-test', note_type: 'Methodological Note', status: 'published',
  title: 'Math rendering test', version: '1.0', license: 'cc-by', published_at: new Date().toISOString(),
  authors: [{ full_name: 'Test Author', affiliation: 'Test U' }], keywords: ['math'], references: [],
  internal_citations: [], cited_by: [], comments: [],
  abstract: 'Testing publication-quality LaTeX math in web and PDF.',
  body_html: '<h2>Classical test theory</h2>' +
    '<p>The observed total score is the sum of item scores, defined as the display equation below.</p>' +
    '<p>$$X = \\sum_{i=1}^{k} X_i$$</p>' +
    '<p>Each item score decomposes into a true score and error, $X_i = \\lambda_i \\eta + \\varepsilon_i$, where $\\eta$ is the latent construct.</p>' +
    '<p>$$\\rho_{XX\'} = \\frac{\\sigma_T^2}{\\sigma_X^2}$$</p>',
};

const html = renderArticle(note, { baseUrl: 'https://www.psychtrixweb.online' });
console.log('WEB: block equations rendered:', (html.match(/rn-math-block/g) || []).length);
console.log('WEB: inline equations rendered:', (html.match(/class="rn-math"/g) || []).length);
console.log('WEB: raw $$ remaining (should be 0):', (html.match(/\$\$/g) || []).length);

const pdf = await buildPdf(note, 'https://www.psychtrixweb.online');
fs.writeFileSync('math-test.pdf', pdf);
console.log('PDF bytes:', pdf.length, '| valid:', pdf.slice(0, 5).toString() === '%PDF-');
process.exit(0);
