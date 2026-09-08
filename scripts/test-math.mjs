import { tex2svg, svgMetrics, renderMathToHtml } from '../server/rn-math.js';
import PDFDocument from 'pdfkit';
import SVGtoPDF from 'svg-to-pdfkit';

const latex = 'X_i = \\lambda_i \\eta + \\varepsilon_i';
const svg = tex2svg(latex, true);
console.log('tex2svg ok:', !!svg, '| has <use>:', /<use/.test(svg || ''));
const met = svgMetrics(svg);
console.log('metrics:', JSON.stringify(met));

const displayLatex = 'X = \\sum_{i=1}^{k} X_i';
const html = renderMathToHtml('<p>Score $' + displayLatex + '$ inline.</p><p>$$' + displayLatex + '$$</p>');
console.log('web inline svg present:', /class="rn-math"[^>]*><svg/.test(html));
console.log('web block svg present:', /rn-math-block/.test(html));

const doc = new PDFDocument({ size: 'A4' });
const chunks = [];
doc.on('data', (c) => chunks.push(c));
doc.on('end', () => {
  const buf = Buffer.concat(chunks);
  console.log('PDF bytes:', buf.length, '| valid:', buf.slice(0, 5).toString() === '%PDF-');
  process.exit(0);
});
doc.fontSize(12).text('Equation:');
const scale = 6.5;
let w = (met.wEx || 10) * scale, h = (met.hEx || 3) * scale;
try { SVGtoPDF(doc, svg, 64, 120, { width: w, height: h }); console.log('SVGtoPDF OK', Math.round(w) + 'x' + Math.round(h)); }
catch (e) { console.error('SVGtoPDF FAILED:', e.message); }
doc.end();
