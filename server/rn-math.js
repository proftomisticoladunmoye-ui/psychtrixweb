// LaTeX math rendering for Research Notes. Authors write $...$ (inline) and
// $$...$$ / \[...\] (display) LaTeX; we render it to self-contained SVG with
// MathJax — the same engine for the web page (inline SVG) and the PDF (embedded
// vector), so equations are publication-quality and identical in both.
import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages.js';

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
// Exclude packages that could inject markup/links or load code.
const SAFE_PACKAGES = AllPackages.filter((p) => !['html', 'require', 'autoload', 'action'].includes(p));
const texInput = new TeX({ packages: SAFE_PACKAGES });
const svgOutput = new SVG({ fontCache: 'none' }); // 'none' -> each SVG is standalone (needed for PDF embedding)
const mjDoc = mathjax.document('', { InputJax: texInput, OutputJax: svgOutput });

// Render one LaTeX string to an <svg> string. Returns null on failure.
export function tex2svg(latex, display = false) {
  try {
    const node = mjDoc.convert(String(latex).trim(), { display: !!display, em: 16, ex: 8, containerWidth: 800 });
    let svg = adaptor.innerHTML(node); // the <svg>…</svg>
    if (!/^<svg/i.test(svg)) return null;
    // Defensive: strip anything script-like (MathJax SVG never emits these).
    svg = svg.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/on\w+="[^"]*"/gi, '');
    return svg;
  } catch { return null; }
}

// Pull width/height (in ex) and viewBox out of a MathJax SVG for sizing.
export function svgMetrics(svg) {
  if (!svg) return { wEx: null, hEx: null, viewBox: null };
  const wm = svg.match(/width="([\d.]+)ex"/i);
  const hm = svg.match(/height="([\d.]+)ex"/i);
  const vb = svg.match(/viewBox="([^"]+)"/i);
  return {
    wEx: wm ? parseFloat(wm[1]) : null,
    hEx: hm ? parseFloat(hm[1]) : null,
    viewBox: vb ? vb[1].split(/\s+/).map(Number) : null,
  };
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Replace LaTeX delimiters in already-sanitized HTML with inline SVG (web). The
// SVG we generate is trusted (server-produced), so it's injected after sanitizing
// the author's HTML. Order matters: $$ before $, and escaped delimiters first.
export function renderMathToHtml(html) {
  let out = String(html || '');
  const block = (latex) => {
    const svg = tex2svg(latex, true);
    return svg ? `<div class="rn-math-block" role="img" aria-label="${esc(latex)}">${svg}</div>` : null;
  };
  const inline = (latex) => {
    const svg = tex2svg(latex, false);
    return svg ? `<span class="rn-math" role="img" aria-label="${esc(latex)}">${svg}</span>` : null;
  };
  const sub = (re, fn) => {
    out = out.replace(re, (m, tex) => {
      const t = tex.trim();
      if (!t) return m;
      const r = fn(t);
      return r == null ? m : r;
    });
  };
  sub(/\$\$([\s\S]+?)\$\$/g, block);
  sub(/\\\[([\s\S]+?)\\\]/g, block);
  sub(/\\\(([\s\S]+?)\\\)/g, inline);
  sub(/\$([^$\n]+?)\$/g, inline);
  return out;
}

// Does the body contain any math? (cheap gate to skip work)
export function hasMath(html) {
  return /\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)/.test(String(html || ''));
}
