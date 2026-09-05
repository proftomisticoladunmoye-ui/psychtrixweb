// Moderated discussion for Research Notes. Public submissions land as 'pending'
// and only appear once an editor approves them. Emails are stored for
// accountability but never returned to public renderers.
import { query } from './db.js';

export async function submitComment(noteId, c) {
  const { rows } = await query(
    `INSERT INTO rn_comments (note_id, parent_id, author_name, author_email, author_affiliation,
        author_orcid, body, status, created_by, ip)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8,$9) RETURNING id`,
    [noteId, c.parent_id || null, c.author_name, c.author_email || null, c.author_affiliation || null,
     c.author_orcid || null, c.body, c.created_by || null, c.ip || null]);
  return rows[0];
}

// Public: approved comments only, nested one level (top-level + replies), with
// no email exposed.
export async function getApprovedComments(noteId) {
  const { rows } = await query(
    `SELECT id, parent_id, author_name, author_affiliation, author_orcid, body,
            is_editor_reply, created_at
       FROM rn_comments WHERE note_id = $1 AND status = 'approved'
      ORDER BY created_at ASC`, [noteId]);
  const byId = new Map(rows.map((r) => [r.id, { ...r, replies: [] }]));
  const top = [];
  for (const r of byId.values()) {
    if (r.parent_id && byId.has(r.parent_id)) byId.get(r.parent_id).replies.push(r);
    else top.push(r);
  }
  return top;
}

export async function approvedCount(noteId) {
  const { rows } = await query('SELECT count(*)::int AS n FROM rn_comments WHERE note_id=$1 AND status=$2', [noteId, 'approved']);
  return rows[0].n;
}

// Admin moderation views
export async function listForModeration(status = 'pending') {
  const { rows } = await query(
    `SELECT c.*, n.note_number, n.slug, n.title AS note_title
       FROM rn_comments c JOIN research_notes n ON n.id = c.note_id
      WHERE ($1 = 'all' OR c.status = $1)
      ORDER BY c.created_at DESC LIMIT 300`, [status]);
  return rows;
}

export async function moderationCounts() {
  const { rows } = await query(`SELECT status, count(*)::int AS n FROM rn_comments GROUP BY status`);
  const out = { pending: 0, approved: 0, rejected: 0, spam: 0 };
  for (const r of rows) out[r.status] = r.n;
  return out;
}

export async function setStatus(id, status, approverId) {
  const approved = status === 'approved';
  const { rows } = await query(
    `UPDATE rn_comments SET status=$2,
        approved_at = CASE WHEN $3 THEN now() ELSE approved_at END,
        approved_by = CASE WHEN $3 THEN $4 ELSE approved_by END
      WHERE id=$1 RETURNING *`, [id, status, approved, approverId]);
  return rows[0] || null;
}

// An editor's reply is posted already-approved and flagged so it renders as an
// official response.
export async function editorReply(noteId, parentId, body, user) {
  const { rows } = await query(
    `INSERT INTO rn_comments (note_id, parent_id, author_name, body, status, is_editor_reply,
        created_by, approved_at, approved_by)
     VALUES ($1,$2,$3,$4,'approved',true,$5,now(),$5) RETURNING *`,
    [noteId, parentId || null, user.email?.split('@')[0] || 'Editor', body, user.id]);
  return rows[0];
}

export async function deleteComment(id) {
  await query('DELETE FROM rn_comments WHERE id=$1', [id]);
}
