import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, Upload, FileText, Eye, Trash2, ArrowLeft, Save, Send, Undo2, ExternalLink,
  CheckCircle2, Circle, AlertTriangle, Loader2, X, Search, BookOpen, CreditCard, Archive,
  MessageSquare, Reply, Check, Ban,
} from 'lucide-react';
import { RichEditor } from './RichEditor';

// ---- API helper ------------------------------------------------------------
const token = () => localStorage.getItem('ptx_token');
async function rn(path: string, opts: RequestInit = {}) {
  const res = await fetch('/api/research-notes' + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
      ...(opts.headers as any),
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body;
}
async function rnc(path: string, opts: RequestInit = {}) {
  const res = await fetch('/api/rn-comments' + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token() ? { Authorization: `Bearer ${token()}` } : {}), ...(opts.headers as any) },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body;
}

// ---- types -----------------------------------------------------------------
interface Author { id?: string; full_name: string; academic_title?: string; affiliation?: string; country?: string; orcid?: string; google_scholar_url?: string; bio?: string; is_corresponding?: boolean; }
interface Reference { ref_type: string; raw_text: string; doi?: string; url?: string; }
interface InternalCite { id: string; note_number: number | null; title: string; }
interface Note {
  id: string; note_number: number | null; slug: string; note_type: string; status: string;
  title: string; subtitle?: string; abstract?: string; keywords: string[]; categories: string[];
  body_html: string; license: string; version: string; doi?: string | null; seo_title?: string;
  seo_description?: string; featured?: boolean; view_count?: number; published_at?: string | null;
  updated_at?: string; authors?: Author[]; references?: Reference[];
  internal_citations?: InternalCite[]; cited_by?: any[];
}

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700', in_review: 'bg-amber-100 text-amber-800',
  ready: 'bg-blue-100 text-blue-800', published: 'bg-green-100 text-green-800',
  archived: 'bg-gray-200 text-gray-500',
};
const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', in_review: 'In review', ready: 'Ready', published: 'Published', archived: 'Archived',
};
const pad3 = (n: number | null | undefined) => (n == null ? '—' : String(n).padStart(3, '0'));

export function ResearchNotesAdmin() {
  const [mode, setMode] = useState<'list' | 'edit' | 'comments'>('list');
  const [pendingComments, setPendingComments] = useState(0);
  const [notes, setNotes] = useState<Note[]>([]);
  const [meta, setMeta] = useState<{ note_types: string[]; licenses: Record<string, any>; statuses: string[]; storage?: string } | null>(null);
  const [editing, setEditing] = useState<Note | null>(null);
  const [importReport, setImportReport] = useState<any | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [{ data }, m] = await Promise.all([rn('/'), rn('/meta')]);
      setNotes(data || []);
      setMeta(m);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
    try { const { counts } = await rnc('/?status=pending'); setPendingComments(counts?.pending || 0); } catch { /* ignore */ }
  };
  useEffect(() => { load(); }, []);

  const openEditor = async (id: string, report: any = null) => {
    setError(''); setSuccess('');
    try {
      const { data } = await rn('/' + id);
      setEditing(data);
      setImportReport(report);
      setMode('edit');
    } catch (e: any) { setError(e.message); }
  };

  const createNew = async () => {
    setError('');
    try {
      const { data } = await rn('/', { method: 'POST', body: JSON.stringify({ title: 'Untitled Research Note', note_type: 'Research Note' }) });
      openEditor(data.id);
    } catch (e: any) { setError(e.message); }
  };

  const onUploadDocx = async (file: File) => {
    setBusy(true); setError(''); setSuccess('');
    try {
      const buf = await file.arrayBuffer();
      const res = await fetch(`/api/research-notes/import-docx?filename=${encodeURIComponent(file.name)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream', ...(token() ? { Authorization: `Bearer ${token()}` } : {}) },
        body: buf,
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || 'Import failed');
      await openEditor(body.data.id, { report: body.report, warnings: body.warnings });
      setSuccess(`Imported "${file.name}". Review the content and metadata before publishing.`);
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const del = async (id: string) => {
    if (!confirm('Delete this Research Note permanently?')) return;
    try { await rn('/' + id, { method: 'DELETE' }); setNotes((n) => n.filter((x) => x.id !== id)); }
    catch (e: any) { setError(e.message); }
  };

  const filtered = notes.filter((n) => statusFilter === 'all' || n.status === statusFilter);

  if (mode === 'comments') {
    return <CommentsModeration onBack={() => { setMode('list'); load(); }} />;
  }

  if (mode === 'edit' && editing) {
    return (
      <NoteEditor
        note={editing} meta={meta!} importReport={importReport}
        onBack={() => { setMode('list'); setEditing(null); setImportReport(null); load(); }}
        onSaved={(updated) => setEditing(updated)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <BookOpen className="w-7 h-7 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Research Notes — Admin</h1>
            <p className="text-sm text-gray-500">Create, import, and manage the PsychtrixWeb Research Note series.
              {meta?.storage === 'db' && <span className="ml-1 text-amber-600">Figures are stored in the database — set the R2/S3 env vars to use object storage.</span>}
              {meta?.storage === 's3' && <span className="ml-1 text-green-600">Object storage active.</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a href="/research-notes" target="_blank" rel="noopener"
            className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700">
            <ExternalLink className="w-4 h-4" /> Public hub
          </a>
          <button onClick={() => setMode('comments')}
            className="relative flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700">
            <MessageSquare className="w-4 h-4" /> Moderation
            {pendingComments > 0 && <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">{pendingComments}</span>}
          </button>
          <button onClick={() => fileRef.current?.click()} disabled={busy}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 font-medium disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Upload Word (.docx)
          </button>
          <input ref={fileRef} type="file" accept=".docx" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadDocx(f); }} />
          <button onClick={createNew}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
            <Plus className="w-4 h-4" /> New Research Note
          </button>
        </div>
      </div>

      {error && <Banner tone="error" onClose={() => setError('')}>{error}</Banner>}
      {success && <Banner tone="success" onClose={() => setSuccess('')}>{success}</Banner>}

      <div className="flex flex-wrap gap-2">
        {['all', 'draft', 'in_review', 'ready', 'published', 'archived'].map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-full text-sm border ${statusFilter === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
            {s === 'all' ? 'All' : STATUS_LABEL[s]}{' '}
            <span className="opacity-70">{s === 'all' ? notes.length : notes.filter((n) => n.status === s).length}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 text-blue-600 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white border border-gray-200 rounded-xl">
          <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No Research Notes here yet. Create one or upload a Word document.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
          {filtered.map((n) => (
            <div key={n.id} className="flex flex-wrap items-center gap-3 p-4 hover:bg-gray-50">
              <div className="w-14 text-center">
                <div className="text-xs text-gray-400 font-semibold">RN</div>
                <div className="text-lg font-bold text-gray-800">{pad3(n.note_number)}</div>
              </div>
              <div className="flex-1 min-w-[220px]">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLE[n.status]}`}>{STATUS_LABEL[n.status]}</span>
                  <span className="text-xs text-gray-500">{n.note_type}</span>
                </div>
                <h3 className="font-semibold text-gray-900 mt-1">{n.title}</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {(n.authors || []).map((a) => a.full_name).join(', ') || 'No authors'}
                  {n.updated_at ? ` · updated ${new Date(n.updated_at).toLocaleDateString()}` : ''}
                  {n.status === 'published' ? ` · ${n.view_count || 0} views` : ''}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {n.status === 'published' && (
                  <a href={`/research-notes/${pad3(n.note_number)}-${n.slug}`} target="_blank" rel="noopener"
                    className="p-2 rounded-lg hover:bg-blue-50 text-blue-600" title="View public page"><Eye className="w-5 h-5" /></a>
                )}
                <button onClick={() => openEditor(n.id)} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700">Edit</button>
                <button onClick={() => del(n.id)} className="p-2 rounded-lg hover:bg-red-50 text-red-500" title="Delete"><Trash2 className="w-5 h-5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Future: subscriptions & monetization live here */}
      <div className="bg-gradient-to-br from-gray-50 to-blue-50/40 border border-dashed border-gray-300 rounded-xl p-5 flex items-start gap-3">
        <CreditCard className="w-6 h-6 text-gray-400 mt-0.5" />
        <div>
          <h3 className="font-semibold text-gray-700">Subscriptions & monetization</h3>
          <p className="text-sm text-gray-500 mt-0.5">Reserved for a future phase — institutional subscriptions, premium Research Notes, and citation analytics will be managed from this admin area. The data model is already designed to support it without a rewrite.</p>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
//  Editor
// ============================================================================
function NoteEditor({ note, meta, importReport, onBack, onSaved }: {
  note: Note; meta: { note_types: string[]; licenses: Record<string, any>; statuses: string[] };
  importReport: any | null; onBack: () => void; onSaved: (n: Note) => void;
}) {
  const [f, setF] = useState<Note>({ ...note, keywords: note.keywords || [], categories: note.categories || [],
    authors: note.authors?.length ? note.authors : [{ full_name: '' }],
    references: note.references || [], internal_citations: note.internal_citations || [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showReport, setShowReport] = useState(!!importReport);
  const previewRef = useRef<HTMLIFrameElement>(null);
  const [previewing, setPreviewing] = useState(false);

  const set = (patch: Partial<Note>) => setF((prev) => ({ ...prev, ...patch }));

  const checklist = useMemo(() => ([
    { key: 'title', label: 'Title', ok: !!f.title.trim() && f.title !== 'Untitled Research Note' },
    { key: 'type', label: 'Research Note type', ok: !!f.note_type },
    { key: 'authors', label: 'At least one author', ok: (f.authors || []).some((a) => a.full_name.trim()) },
    { key: 'abstract', label: 'Abstract', ok: !!(f.abstract || '').trim() },
    { key: 'keywords', label: 'Keywords (≥1)', ok: (f.keywords || []).length > 0 },
    { key: 'content', label: 'Main content', ok: (f.body_html || '').replace(/<[^>]+>/g, '').trim().length > 200 },
    { key: 'references', label: 'References', ok: (f.references || []).some((r) => r.raw_text.trim()) },
    { key: 'license', label: 'License', ok: !!f.license },
  ]), [f]);
  const required = ['title', 'authors', 'abstract', 'keywords', 'content'];
  const canPublish = checklist.filter((c) => required.includes(c.key)).every((c) => c.ok);

  const buildPayload = () => ({
    title: f.title, subtitle: f.subtitle || null, note_type: f.note_type, abstract: f.abstract || null,
    keywords: f.keywords, categories: f.categories, body_html: f.body_html, license: f.license,
    version: f.version, seo_title: f.seo_title || null, seo_description: f.seo_description || null,
    featured: !!f.featured, doi: f.doi || null,
    authors: (f.authors || []).filter((a) => a.full_name.trim()),
    references: (f.references || []).filter((r) => r.raw_text.trim()),
    internal_citation_ids: (f.internal_citations || []).map((c) => c.id),
  });

  const save = async (thenPublish = false) => {
    setBusy(true); setError(''); setSuccess('');
    try {
      const { data } = await rn('/' + f.id, { method: 'PATCH', body: JSON.stringify(buildPayload()) });
      let out = data;
      if (thenPublish) {
        const r = await rn(`/${f.id}/status`, { method: 'POST', body: JSON.stringify({ status: 'published' }) });
        out = r.data;
      }
      setF((prev) => ({ ...prev, ...out, authors: out.authors?.length ? out.authors : prev.authors,
        references: out.references || [], internal_citations: out.internal_citations || [] }));
      onSaved(out);
      setSuccess(thenPublish ? `Published as Research Note ${pad3(out.note_number)}.` : 'Saved.');
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  const changeStatus = async (status: string) => {
    setBusy(true); setError('');
    try {
      const { data } = await rn(`/${f.id}/status`, { method: 'POST', body: JSON.stringify({ status }) });
      set({ status: data.status, note_number: data.note_number, published_at: data.published_at });
      onSaved(data);
      setSuccess(`Status set to ${STATUS_LABEL[status]}.`);
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  const uploadImage = async (file: File) => {
    const res = await fetch(`/api/research-notes/media?note_id=${f.id}&filename=${encodeURIComponent(file.name)}`, {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'application/octet-stream', ...(token() ? { Authorization: `Bearer ${token()}` } : {}) },
      body: file,
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error || 'Upload failed');
    return body.data as { url: string; width?: number; height?: number };
  };

  const openPreview = async () => {
    setPreviewing(true); setError('');
    try {
      await rn('/' + f.id, { method: 'PATCH', body: JSON.stringify(buildPayload()) }); // save first for an accurate preview
      const { html } = await rn(`/${f.id}/rendered`);
      const doc = previewRef.current?.contentWindow?.document;
      if (doc) { doc.open(); doc.write(html); doc.close(); }
    } catch (e: any) { setError(e.message); setPreviewing(false); }
  };

  return (
    <div className="space-y-5">
      {/* toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 sticky top-0 bg-gray-50 z-10 py-2">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700"><ArrowLeft className="w-4 h-4" /> Back</button>
          <span className={`text-xs px-2 py-1 rounded-full ${STATUS_STYLE[f.status]}`}>{STATUS_LABEL[f.status]}</span>
          {f.note_number != null && <span className="text-sm text-gray-500">RN {pad3(f.note_number)}</span>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={openPreview} className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700"><Eye className="w-4 h-4" /> Preview</button>
          <button onClick={() => save(false)} disabled={busy} className="flex items-center gap-2 px-4 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-800 disabled:opacity-50">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save</button>
          {f.status !== 'published' ? (
            <button onClick={() => save(true)} disabled={busy || !canPublish} title={canPublish ? '' : 'Complete the required checklist items first'}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"><Send className="w-4 h-4" /> Publish</button>
          ) : (
            <button onClick={() => changeStatus('draft')} disabled={busy}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50"><Undo2 className="w-4 h-4" /> Unpublish</button>
          )}
        </div>
      </div>

      {error && <Banner tone="error" onClose={() => setError('')}>{error}</Banner>}
      {success && <Banner tone="success" onClose={() => setSuccess('')}>{success}</Banner>}

      {showReport && importReport?.report && (
        <ImportReport report={importReport.report} warnings={importReport.warnings} onClose={() => setShowReport(false)} />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
        {/* main form */}
        <div className="space-y-5 min-w-0">
          <Field label="Title">
            <input value={f.title} onChange={(e) => set({ title: e.target.value })}
              className="w-full text-xl font-semibold px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
          </Field>
          <Field label="Subtitle (optional)">
            <input value={f.subtitle || ''} onChange={(e) => set({ subtitle: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Research Note type">
              <select value={f.note_type} onChange={(e) => set({ note_type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500">
                {meta.note_types.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="License">
              <select value={f.license} onChange={(e) => set({ license: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500">
                {Object.entries(meta.licenses).map(([k, v]: any) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Abstract">
            <textarea value={f.abstract || ''} onChange={(e) => set({ abstract: e.target.value })} rows={5}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ChipInput label="Keywords" values={f.keywords} onChange={(v) => set({ keywords: v })} placeholder="Add keyword + Enter" />
            <ChipInput label="Categories / topics" values={f.categories} onChange={(v) => set({ categories: v })} placeholder="Add topic + Enter" />
          </div>

          <AuthorsEditor authors={f.authors || []} onChange={(a) => set({ authors: a })} />

          <Field label="Body">
            <RichEditor value={f.body_html} onChange={(html) => set({ body_html: html })} onUploadImage={uploadImage} />
          </Field>

          <ReferencesEditor refs={f.references || []} onChange={(r) => set({ references: r })} />

          <InternalCitationsEditor selfId={f.id} value={f.internal_citations || []} onChange={(c) => set({ internal_citations: c })} />

          <details className="bg-white border border-gray-200 rounded-xl p-4">
            <summary className="font-semibold text-gray-800 cursor-pointer">SEO & metadata</summary>
            <div className="mt-4 space-y-4">
              <Field label="SEO title (defaults to the article title)">
                <input value={f.seo_title || ''} onChange={(e) => set({ seo_title: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
              </Field>
              <Field label="Meta description (defaults to the abstract)">
                <textarea value={f.seo_description || ''} onChange={(e) => set({ seo_description: e.target.value })} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Version"><input value={f.version} onChange={(e) => set({ version: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" /></Field>
                <Field label="DOI (only if truly registered)"><input value={f.doi || ''} onChange={(e) => set({ doi: e.target.value })} placeholder="10.xxxx/xxxxx" className="w-full px-3 py-2 border border-gray-300 rounded-lg" /></Field>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={!!f.featured} onChange={(e) => set({ featured: e.target.checked })} /> Feature on the Research Notes hub</label>
            </div>
          </details>
        </div>

        {/* right rail */}
        <div className="space-y-4 lg:sticky lg:top-16">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Publication readiness</h3>
            <ul className="space-y-2">
              {checklist.map((c) => (
                <li key={c.key} className="flex items-center gap-2 text-sm">
                  {c.ok ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <Circle className="w-4 h-4 text-gray-300" />}
                  <span className={c.ok ? 'text-gray-700' : 'text-gray-400'}>{c.label}</span>
                  {required.includes(c.key) && !c.ok && <span className="text-[10px] text-red-500 ml-auto">required</span>}
                </li>
              ))}
            </ul>
            {!canPublish && <p className="text-xs text-amber-600 mt-3">Complete the required items to enable publishing.</p>}
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2 text-sm">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Workflow</h3>
            {['draft', 'in_review', 'ready', 'published', 'archived'].map((s) => (
              <button key={s} onClick={() => changeStatus(s)} disabled={busy || (s === 'published' && !canPublish)}
                className={`w-full text-left px-3 py-2 rounded-lg border ${f.status === s ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 hover:bg-gray-50 text-gray-600'} disabled:opacity-40`}>
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* preview overlay */}
      {previewing && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setPreviewing(false)}>
          <div className="bg-white rounded-xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-2 border-b">
              <span className="font-semibold text-gray-800">Preview — server-rendered page</span>
              <button onClick={() => setPreviewing(false)}><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <iframe ref={previewRef} title="Preview" className="flex-1 w-full" />
          </div>
        </div>
      )}
    </div>
  );
}

// ---- small building blocks -------------------------------------------------
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="block text-sm font-medium text-gray-700 mb-1">{label}</span>{children}</label>;
}

function Banner({ tone, children, onClose }: { tone: 'error' | 'success'; children: React.ReactNode; onClose: () => void }) {
  const c = tone === 'error' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-green-50 border-green-200 text-green-800';
  return <div className={`flex items-start gap-2 p-3 border rounded-lg ${c}`}>
    {tone === 'error' ? <AlertTriangle className="w-5 h-5 flex-shrink-0" /> : <CheckCircle2 className="w-5 h-5 flex-shrink-0" />}
    <span className="text-sm flex-1">{children}</span>
    <button onClick={onClose}><X className="w-4 h-4" /></button>
  </div>;
}

function ChipInput({ label, values, onChange, placeholder }: { label: string; values: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState('');
  const add = () => { const v = draft.trim(); if (v && !values.includes(v)) onChange([...values, v]); setDraft(''); };
  return (
    <Field label={label}>
      <div className="flex flex-wrap gap-1.5 p-2 border border-gray-300 rounded-lg bg-white min-h-[42px]">
        {values.map((v, i) => (
          <span key={i} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-sm px-2 py-0.5 rounded">
            {v}<button onClick={() => onChange(values.filter((_, j) => j !== i))}><X className="w-3 h-3" /></button>
          </span>
        ))}
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }}
          onBlur={add} className="flex-1 min-w-[120px] outline-none text-sm" />
      </div>
    </Field>
  );
}

function AuthorsEditor({ authors, onChange }: { authors: Author[]; onChange: (a: Author[]) => void }) {
  const upd = (i: number, patch: Partial<Author>) => onChange(authors.map((a, j) => j === i ? { ...a, ...patch } : a));
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-800">Authors</h3>
        <button onClick={() => onChange([...authors, { full_name: '' }])} className="text-sm text-blue-600 flex items-center gap-1"><Plus className="w-4 h-4" /> Add author</button>
      </div>
      <div className="space-y-3">
        {authors.map((a, i) => (
          <div key={i} className="border border-gray-200 rounded-lg p-3 space-y-2">
            <div className="flex gap-2">
              <input value={a.full_name} onChange={(e) => upd(i, { full_name: e.target.value })} placeholder="Full name (e.g. Enoch O. Oladunmoye)" className="flex-1 px-2.5 py-1.5 border border-gray-300 rounded text-sm" />
              {authors.length > 1 && <button onClick={() => onChange(authors.filter((_, j) => j !== i))} className="text-red-500 p-1"><Trash2 className="w-4 h-4" /></button>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input value={a.affiliation || ''} onChange={(e) => upd(i, { affiliation: e.target.value })} placeholder="Affiliation" className="px-2.5 py-1.5 border border-gray-300 rounded text-sm" />
              <input value={a.country || ''} onChange={(e) => upd(i, { country: e.target.value })} placeholder="Country" className="px-2.5 py-1.5 border border-gray-300 rounded text-sm" />
              <input value={a.orcid || ''} onChange={(e) => upd(i, { orcid: e.target.value })} placeholder="ORCID (0000-0000-0000-0000)" className="px-2.5 py-1.5 border border-gray-300 rounded text-sm" />
              <input value={a.google_scholar_url || ''} onChange={(e) => upd(i, { google_scholar_url: e.target.value })} placeholder="Google Scholar URL" className="px-2.5 py-1.5 border border-gray-300 rounded text-sm" />
            </div>
            <label className="flex items-center gap-2 text-xs text-gray-600"><input type="checkbox" checked={!!a.is_corresponding} onChange={(e) => upd(i, { is_corresponding: e.target.checked })} /> Corresponding author</label>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReferencesEditor({ refs, onChange }: { refs: Reference[]; onChange: (r: Reference[]) => void }) {
  const upd = (i: number, patch: Partial<Reference>) => onChange(refs.map((r, j) => j === i ? { ...r, ...patch } : r));
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-800">References</h3>
        <button onClick={() => onChange([...refs, { ref_type: 'journal', raw_text: '' }])} className="text-sm text-blue-600 flex items-center gap-1"><Plus className="w-4 h-4" /> Add reference</button>
      </div>
      {refs.length === 0 && <p className="text-sm text-gray-400">No references yet. Add each reference as formatted text (APA), plus an optional DOI or URL.</p>}
      <div className="space-y-3">
        {refs.map((r, i) => (
          <div key={i} className="border border-gray-200 rounded-lg p-3 space-y-2">
            <div className="flex gap-2 items-start">
              <span className="text-xs text-gray-400 pt-2 w-5">{i + 1}.</span>
              <textarea value={r.raw_text} onChange={(e) => upd(i, { raw_text: e.target.value })} rows={2} placeholder="Author, A. A. (Year). Title. Journal, vol(iss), pages." className="flex-1 px-2.5 py-1.5 border border-gray-300 rounded text-sm" />
              <button onClick={() => onChange(refs.filter((_, j) => j !== i))} className="text-red-500 p-1"><Trash2 className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pl-7">
              <select value={r.ref_type} onChange={(e) => upd(i, { ref_type: e.target.value })} className="px-2 py-1.5 border border-gray-300 rounded text-sm bg-white">
                {['journal', 'book', 'chapter', 'website', 'report', 'dataset', 'software', 'preprint'].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <input value={r.doi || ''} onChange={(e) => upd(i, { doi: e.target.value })} placeholder="DOI" className="px-2.5 py-1.5 border border-gray-300 rounded text-sm" />
              <input value={r.url || ''} onChange={(e) => upd(i, { url: e.target.value })} placeholder="URL" className="px-2.5 py-1.5 border border-gray-300 rounded text-sm" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function InternalCitationsEditor({ selfId, value, onChange }: { selfId: string; value: InternalCite[]; onChange: (c: InternalCite[]) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<InternalCite[]>([]);
  const [searching, setSearching] = useState(false);
  const search = async (query: string) => {
    setQ(query);
    if (query.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    try { const { data } = await rn('/search?q=' + encodeURIComponent(query)); setResults((data || []).filter((n: any) => n.id !== selfId)); }
    catch { /* ignore */ } finally { setSearching(false); }
  };
  const add = (n: InternalCite) => { if (!value.some((v) => v.id === n.id)) onChange([...value, n]); setQ(''); setResults([]); };
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h3 className="font-semibold text-gray-800 mb-1">Cite other Research Notes</h3>
      <p className="text-xs text-gray-500 mb-3">Build the internal knowledge graph — cited Notes appear as “Related” here and this Note shows under “Cited by” on theirs.</p>
      <div className="flex flex-wrap gap-2 mb-3">
        {value.map((c) => (
          <span key={c.id} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-sm px-2 py-1 rounded">
            RN {pad3(c.note_number)} · {c.title.slice(0, 40)}<button onClick={() => onChange(value.filter((v) => v.id !== c.id))}><X className="w-3 h-3" /></button>
          </span>
        ))}
      </div>
      <div className="relative">
        <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2">
          <Search className="w-4 h-4 text-gray-400" />
          <input value={q} onChange={(e) => search(e.target.value)} placeholder="Search published Research Notes…" className="flex-1 outline-none text-sm" />
          {searching && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
        </div>
        {results.length > 0 && (
          <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-auto">
            {results.map((n) => (
              <button key={n.id} onClick={() => add(n)} className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm">
                <span className="text-gray-400 font-semibold mr-2">RN {pad3(n.note_number)}</span>{n.title}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
//  Comment moderation inbox
// ============================================================================
interface Comment {
  id: string; note_id: string; parent_id: string | null; note_number: number | null; slug: string;
  note_title: string; author_name: string; author_email?: string; author_affiliation?: string;
  author_orcid?: string; body: string; status: string; is_editor_reply: boolean; created_at: string;
}
const CMT_STATUS_STYLE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800', approved: 'bg-green-100 text-green-800',
  rejected: 'bg-gray-200 text-gray-600', spam: 'bg-red-100 text-red-700',
};

function CommentsModeration({ onBack }: { onBack: () => void }) {
  const [status, setStatus] = useState('pending');
  const [items, setItems] = useState<Comment[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [replyText, setReplyText] = useState('');

  const load = async (s = status) => {
    setLoading(true);
    try { const { data, counts } = await rnc('/?status=' + s); setItems(data || []); setCounts(counts || {}); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(status); /* eslint-disable-next-line */ }, [status]);

  const act = async (id: string, s: string) => {
    try { await rnc(`/${id}/status`, { method: 'POST', body: JSON.stringify({ status: s }) }); load(); }
    catch (e: any) { setError(e.message); }
  };
  const del = async (id: string) => {
    if (!confirm('Delete this comment permanently?')) return;
    try { await rnc('/' + id, { method: 'DELETE' }); setItems((x) => x.filter((c) => c.id !== id)); }
    catch (e: any) { setError(e.message); }
  };
  const sendReply = async () => {
    if (!replyTo || !replyText.trim()) return;
    try {
      await rnc('/reply', { method: 'POST', body: JSON.stringify({ note_id: replyTo.note_id, parent_id: replyTo.id, body: replyText.trim() }) });
      setReplyTo(null); setReplyText(''); load();
    } catch (e: any) { setError(e.message); }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700"><ArrowLeft className="w-4 h-4" /> Back</button>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><MessageSquare className="w-6 h-6 text-blue-600" /> Discussion moderation</h1>
      </div>
      {error && <Banner tone="error" onClose={() => setError('')}>{error}</Banner>}

      <div className="flex flex-wrap gap-2">
        {['pending', 'approved', 'spam', 'rejected', 'all'].map((s) => (
          <button key={s} onClick={() => setStatus(s)}
            className={`px-3 py-1.5 rounded-full text-sm border capitalize ${status === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
            {s} {s !== 'all' && <span className="opacity-70">{counts[s] ?? 0}</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 text-blue-600 animate-spin" /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 bg-white border border-gray-200 rounded-xl text-gray-500">No {status === 'all' ? '' : status} comments.</div>
      ) : (
        <div className="space-y-3">
          {items.map((c) => (
            <div key={c.id} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <span className="font-semibold text-gray-900">{c.author_name}</span>
                  {c.is_editor_reply && <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">Editor reply</span>}
                  <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${CMT_STATUS_STYLE[c.status]}`}>{c.status}</span>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {[c.author_email, c.author_affiliation, c.author_orcid ? `ORCID ${c.author_orcid}` : null].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <a href={`/research-notes/${pad3(c.note_number)}-${c.slug}#discussion`} target="_blank" rel="noopener"
                  className="text-xs text-blue-600 hover:underline">on RN {pad3(c.note_number)} · {c.note_title.slice(0, 40)}</a>
              </div>
              <p className="text-sm text-gray-800 mt-2 whitespace-pre-wrap">{c.body}</p>
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                {c.status !== 'approved' && <button onClick={() => act(c.id, 'approved')} className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"><Check className="w-4 h-4" /> Approve</button>}
                {c.status !== 'rejected' && <button onClick={() => act(c.id, 'rejected')} className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700"><Ban className="w-4 h-4" /> Reject</button>}
                {c.status !== 'spam' && <button onClick={() => act(c.id, 'spam')} className="flex items-center gap-1 px-3 py-1.5 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50">Spam</button>}
                {!c.is_editor_reply && <button onClick={() => { setReplyTo(c); setReplyText(''); }} className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700"><Reply className="w-4 h-4" /> Reply</button>}
                <button onClick={() => del(c.id)} className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 rounded-lg ml-auto"><Trash2 className="w-4 h-4" /></button>
              </div>
              {replyTo?.id === c.id && (
                <div className="mt-3 border-t border-gray-100 pt-3">
                  <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} rows={3} placeholder="Write an editor reply (posts publicly, approved)…" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  <div className="flex gap-2 mt-2">
                    <button onClick={sendReply} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Post reply</button>
                    <button onClick={() => setReplyTo(null)} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg text-gray-600">Cancel</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ImportReport({ report, warnings, onClose }: { report: any; warnings: string[]; onClose: () => void }) {
  const rows: [string, boolean | number][] = [
    ['Title detected', report.title_detected], ['Headings', report.headings], ['Paragraphs', report.paragraphs],
    ['Tables', report.tables], ['Images', report.images], ['YouTube links', report.youtube], ['Links', report.links],
  ];
  return (
    <div className="bg-blue-50/60 border border-blue-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-blue-900 flex items-center gap-2"><FileText className="w-5 h-5" /> Word document imported</h3>
        <button onClick={onClose}><X className="w-4 h-4 text-blue-700" /></button>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-700">
        {rows.map(([label, val]) => (
          <span key={label} className="flex items-center gap-1.5">
            {typeof val === 'boolean'
              ? (val ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <AlertTriangle className="w-4 h-4 text-amber-500" />)
              : <span className="font-semibold">{val}</span>}
            {label}{typeof val === 'boolean' ? '' : ''}
          </span>
        ))}
      </div>
      {warnings?.length > 0 && (
        <div className="mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
          <div className="font-semibold flex items-center gap-1 mb-1"><AlertTriangle className="w-3.5 h-3.5" /> {warnings.length} warning(s) — review before publishing</div>
          <ul className="list-disc pl-5 space-y-0.5">{warnings.slice(0, 6).map((w, i) => <li key={i}>{w}</li>)}</ul>
        </div>
      )}
      <p className="text-xs text-gray-500 mt-2">Review the title, authors, abstract, keywords and figures below, then Save or Publish.</p>
    </div>
  );
}
