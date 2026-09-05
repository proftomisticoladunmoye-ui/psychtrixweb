import React, { useEffect, useRef } from 'react';
import {
  Bold, Italic, Heading2, Heading3, List, ListOrdered, Quote, Link2, Image as ImageIcon,
  Youtube, Code2, Table as TableIcon, MessageSquare, Pilcrow,
} from 'lucide-react';

// A pragmatic contentEditable scholarly editor. Produces semantic HTML that the
// server re-sanitises before public rendering, so this only needs to be usable,
// not a trust boundary. execCommand is deprecated but works across all current
// browsers and keeps this dependency-free.
export function RichEditor({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const initialised = useRef(false);

  useEffect(() => {
    if (ref.current && !initialised.current) {
      ref.current.innerHTML = value || '<p></p>';
      initialised.current = true;
    }
  }, [value]);

  const sync = () => { if (ref.current) onChange(ref.current.innerHTML); };
  const focus = () => ref.current?.focus();
  const cmd = (command: string, arg?: string) => { document.execCommand(command, false, arg); focus(); sync(); };
  const insert = (html: string) => { focus(); document.execCommand('insertHTML', false, html); sync(); };

  const addLink = () => { const url = prompt('Link URL'); if (url) cmd('createLink', url); };
  const addImage = () => {
    const url = prompt('Image URL (https://…)'); if (!url) return;
    const alt = prompt('Alt text (describe the image for accessibility)') || '';
    const caption = prompt('Figure caption (optional)') || '';
    insert(`<figure><img src="${esc(url)}" alt="${esc(alt)}" loading="lazy" />${caption ? `<figcaption>${esc(caption)}</figcaption>` : ''}</figure><p></p>`);
  };
  const addYoutube = () => {
    const url = prompt('YouTube URL'); if (!url) return;
    const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{6,})/);
    if (!m) { alert('Could not read a YouTube video id from that URL.'); return; }
    insert(`<div class="video"><iframe src="https://www.youtube-nocookie.com/embed/${m[1]}" title="Embedded video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div><p></p>`);
  };
  const addCallout = () => insert('<div class="callout"><strong>Note.</strong> Write your highlight here.</div><p></p>');
  const addCode = () => insert('<pre><code>code…</code></pre><p></p>');
  const addTable = () => insert(
    '<table><thead><tr><th>Column</th><th>Column</th></tr></thead><tbody>' +
    '<tr><td>&nbsp;</td><td>&nbsp;</td></tr><tr><td>&nbsp;</td><td>&nbsp;</td></tr></tbody></table><p></p>');

  const Btn = ({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) => (
    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onClick} title={title}
      className="p-2 rounded hover:bg-gray-100 text-gray-600">{children}</button>
  );

  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden">
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-gray-200 bg-gray-50 sticky top-14 z-[5]">
        <Btn onClick={() => cmd('formatBlock', '<h2>')} title="Heading 2"><Heading2 className="w-4 h-4" /></Btn>
        <Btn onClick={() => cmd('formatBlock', '<h3>')} title="Heading 3"><Heading3 className="w-4 h-4" /></Btn>
        <Btn onClick={() => cmd('formatBlock', '<p>')} title="Paragraph"><Pilcrow className="w-4 h-4" /></Btn>
        <Sep />
        <Btn onClick={() => cmd('bold')} title="Bold"><Bold className="w-4 h-4" /></Btn>
        <Btn onClick={() => cmd('italic')} title="Italic"><Italic className="w-4 h-4" /></Btn>
        <Sep />
        <Btn onClick={() => cmd('insertUnorderedList')} title="Bullet list"><List className="w-4 h-4" /></Btn>
        <Btn onClick={() => cmd('insertOrderedList')} title="Numbered list"><ListOrdered className="w-4 h-4" /></Btn>
        <Btn onClick={() => cmd('formatBlock', '<blockquote>')} title="Quote"><Quote className="w-4 h-4" /></Btn>
        <Sep />
        <Btn onClick={addLink} title="Link"><Link2 className="w-4 h-4" /></Btn>
        <Btn onClick={addImage} title="Image / figure"><ImageIcon className="w-4 h-4" /></Btn>
        <Btn onClick={addYoutube} title="YouTube video"><Youtube className="w-4 h-4" /></Btn>
        <Btn onClick={addTable} title="Table"><TableIcon className="w-4 h-4" /></Btn>
        <Btn onClick={addCallout} title="Callout / highlight"><MessageSquare className="w-4 h-4" /></Btn>
        <Btn onClick={addCode} title="Code block"><Code2 className="w-4 h-4" /></Btn>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={sync}
        onBlur={sync}
        className="rn-body-editor px-4 py-3 min-h-[320px] max-h-[70vh] overflow-auto focus:outline-none prose-editor"
      />
      <style>{`
        .rn-body-editor{font-size:16px;line-height:1.7;color:#1a2130}
        .rn-body-editor:empty:before{content:'Start writing…';color:#9aa4b2}
        .rn-body-editor h2{font-size:22px;font-weight:700;margin:22px 0 8px}
        .rn-body-editor h3{font-size:18px;font-weight:700;margin:18px 0 6px}
        .rn-body-editor p{margin:0 0 12px}
        .rn-body-editor ul{list-style:disc;padding-left:24px;margin:0 0 12px}
        .rn-body-editor ol{list-style:decimal;padding-left:24px;margin:0 0 12px}
        .rn-body-editor blockquote{border-left:3px solid #0e63d6;padding:2px 14px;color:#5b6472;margin:14px 0}
        .rn-body-editor figure{margin:16px 0;text-align:center}
        .rn-body-editor figure img{max-width:100%;border:1px solid #e6e9ef;border-radius:8px}
        .rn-body-editor figcaption{font-size:13px;color:#5b6472;margin-top:6px}
        .rn-body-editor table{border-collapse:collapse;width:100%;margin:14px 0;font-size:14px}
        .rn-body-editor th,.rn-body-editor td{border:1px solid #e6e9ef;padding:6px 10px}
        .rn-body-editor thead th{background:#f6f8fb}
        .rn-body-editor .callout{background:#e8f0fd;border:1px solid #cfe0fb;border-radius:8px;padding:10px 14px;margin:14px 0}
        .rn-body-editor pre{background:#0d1117;color:#e6edf3;border-radius:8px;padding:12px;overflow-x:auto;font-size:13px;margin:14px 0}
        .rn-body-editor .video{position:relative;padding-bottom:56.25%;height:0;margin:16px 0}
        .rn-body-editor .video iframe{position:absolute;inset:0;width:100%;height:100%;border:0;border-radius:8px}
      `}</style>
    </div>
  );
}

function Sep() { return <span className="w-px h-5 bg-gray-200 mx-1" />; }
function esc(s: string) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
