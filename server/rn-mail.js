// Email notifications for Research Note discussion. SMTP is configured entirely
// through env vars (Gmail SMTP by default). All sends are best-effort and
// fire-and-forget: a mail failure must never break a comment submission or an
// approval. If SMTP isn't configured, these are silent no-ops.
import nodemailer from 'nodemailer';
import { pad3, SERIES } from './rn-data.js';

const CFG = {
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 465),
  user: process.env.SMTP_USER,
  pass: process.env.SMTP_PASS,
  from: process.env.RN_MAIL_FROM || 'PsychtrixWeb Research Notes <notifications@psychtrixweb.online>',
  moderationTo: process.env.RN_MODERATION_EMAIL || process.env.SMTP_USER || null,
};

export function mailEnabled() { return !!(CFG.host && CFG.user && CFG.pass); }

let _tx = null;
function transport() {
  if (_tx) return _tx;
  _tx = nodemailer.createTransport({
    host: CFG.host, port: CFG.port, secure: CFG.port === 465, // 465=SSL, 587=STARTTLS
    auth: { user: CFG.user, pass: CFG.pass },
  });
  return _tx;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function send(opts) {
  if (!mailEnabled()) return { skipped: 'smtp-not-configured' };
  try { return await transport().sendMail({ from: CFG.from, ...opts }); }
  catch (e) { console.error('[rn-mail] send failed:', e?.message); return { error: e?.message }; }
}

// Notify the moderator that a new comment is awaiting review.
export function notifyNewComment({ note, comment, baseUrl }) {
  if (!mailEnabled() || !CFG.moderationTo) return;
  const url = `${baseUrl}/research-notes/${pad3(note.note_number)}-${note.slug}#discussion`;
  const who = [comment.author_name, comment.author_affiliation].filter(Boolean).join(', ');
  send({
    to: CFG.moderationTo,
    replyTo: comment.author_email || undefined, // reply goes straight to the commenter
    subject: `New comment awaiting review — ${SERIES.name} ${pad3(note.note_number)}`,
    text:
`A new comment on "${note.title}" is awaiting moderation.

From: ${who || comment.author_name}
Email: ${comment.author_email || '(not provided)'}
${comment.author_orcid ? `ORCID: ${comment.author_orcid}\n` : ''}
${comment.body}

Approve or reject it in the moderation inbox:
${baseUrl}/  (sign in → Research Notes → Moderation)

Public page: ${url}`,
    html:
`<p>A new comment on <strong>${esc(note.title)}</strong> is awaiting moderation.</p>
<table style="border-collapse:collapse;font:14px sans-serif">
<tr><td style="padding:2px 8px;color:#666">From</td><td style="padding:2px 8px">${esc(who || comment.author_name)}</td></tr>
<tr><td style="padding:2px 8px;color:#666">Email</td><td style="padding:2px 8px">${esc(comment.author_email || '(not provided)')}</td></tr>
${comment.author_orcid ? `<tr><td style="padding:2px 8px;color:#666">ORCID</td><td style="padding:2px 8px">${esc(comment.author_orcid)}</td></tr>` : ''}
</table>
<blockquote style="border-left:3px solid #0e63d6;margin:12px 0;padding:4px 14px;color:#333;white-space:pre-wrap">${esc(comment.body)}</blockquote>
<p>Approve or reject it in the moderation inbox (sign in → Research Notes → Moderation), or view the public page:<br>
<a href="${esc(url)}">${esc(url)}</a></p>`,
  });
}

// Let the commenter know their comment is now live (only if they gave an email).
export function notifyCommentApproved({ note, comment, baseUrl }) {
  if (!mailEnabled() || !comment.author_email) return;
  const url = `${baseUrl}/research-notes/${pad3(note.note_number)}-${note.slug}#discussion`;
  send({
    to: comment.author_email,
    subject: `Your comment is now published — ${SERIES.name} ${pad3(note.note_number)}`,
    text:
`Hello ${comment.author_name || ''},

Your comment on "${note.title}" has been reviewed and is now published:
${url}

Thank you for contributing to the ${SERIES.name} discussion.`,
    html:
`<p>Hello ${esc(comment.author_name || '')},</p>
<p>Your comment on <strong>${esc(note.title)}</strong> has been reviewed and is now published:</p>
<p><a href="${esc(url)}">${esc(url)}</a></p>
<p>Thank you for contributing to the ${esc(SERIES.name)} discussion.</p>`,
  });
}
