// Word (.docx) ingestion for Research Notes. Converts an uploaded document into
// scholarly HTML (headings, paragraphs, tables, images, links) and returns a
// quality-control report so the editor can review before publishing.
// Images are embedded as data URIs by mammoth's default; a later phase moves
// them to external object storage.
import mammoth from 'mammoth';

const STYLE_MAP = [
  "p[style-name='Title'] => h1:fresh",
  "p[style-name='Subtitle'] => p.subtitle:fresh",
  "p[style-name='Heading 1'] => h2:fresh",
  "p[style-name='Heading 2'] => h3:fresh",
  "p[style-name='Heading 3'] => h4:fresh",
  "p[style-name='Heading 4'] => h5:fresh",
  "p[style-name='Quote'] => blockquote:fresh",
  "p[style-name='Intense Quote'] => blockquote.intense:fresh",
  "r[style-name='Strong'] => strong",
  "r[style-name='Emphasis'] => em",
];

function count(html, re) { return (html.match(re) || []).length; }

// A paragraph that is just a YouTube link becomes a responsive embed.
function embedYoutube(html) {
  return html.replace(
    /<p>\s*<a href="https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})[^"]*"[^>]*>[^<]*<\/a>\s*<\/p>/gi,
    (_m, id) => `<div class="video"><iframe src="https://www.youtube-nocookie.com/embed/${id}" title="Embedded video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`,
  );
}

export async function importDocx(buffer) {
  const { value: rawHtml, messages } = await mammoth.convertToHtml({ buffer }, {
    styleMap: STYLE_MAP,
    includeDefaultStyleMap: true,
  });
  const html = embedYoutube(rawHtml);

  // Title: first <h1> if the document used a Title/Heading-1 style.
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title = h1 ? h1[1].replace(/<[^>]+>/g, '').trim() : null;
  // Strip the leading H1 from the body (it becomes the note title field).
  const body = h1 ? html.replace(h1[0], '') : html;

  const youtube = count(body, /youtube(?:-nocookie)?\.com|youtu\.be/gi);
  const report = {
    title_detected: !!title,
    headings: count(body, /<h[2-6][ >]/gi),
    paragraphs: count(body, /<p[ >]/gi),
    tables: count(body, /<table[ >]/gi),
    images: count(body, /<img[ >]/gi),
    youtube,
    links: count(body, /<a\s+href=/gi),
  };

  // Surface anything mammoth could not confidently convert.
  const warnings = (messages || [])
    .filter((m) => m.type === 'warning' || m.type === 'error')
    .map((m) => m.message)
    .slice(0, 40);

  return { html: body, title, report, warnings };
}
