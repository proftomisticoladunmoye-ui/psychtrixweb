// Media storage for Research Note figures. Uses S3-compatible object storage
// (Cloudflare R2 / AWS S3) when configured via env, otherwise falls back to
// storing bytes in Neon and serving them same-origin — so image upload works
// before object storage is provisioned, and upgrades to R2 with no code change.
import { randomUUID } from 'node:crypto';
import * as ISM from 'image-size';
import { query } from './db.js';

const sizeOf = (ISM.imageSize || ISM.default || ISM);

const S3 = {
  endpoint: process.env.RN_S3_ENDPOINT,          // e.g. https://<account>.r2.cloudflarestorage.com
  region: process.env.RN_S3_REGION || 'auto',
  bucket: process.env.RN_S3_BUCKET,
  accessKeyId: process.env.RN_S3_ACCESS_KEY_ID,
  secretAccessKey: process.env.RN_S3_SECRET_ACCESS_KEY,
  publicBase: (process.env.RN_MEDIA_PUBLIC_BASE || '').replace(/\/$/, ''), // public URL base for the bucket
};

export function storageMode() {
  return S3.bucket && S3.accessKeyId && S3.secretAccessKey && S3.endpoint && S3.publicBase ? 's3' : 'db';
}

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
export function extFor(mime) { return EXT[mime] || null; }
export function isAllowedImage(mime) { return !!EXT[mime]; }

let _client = null;
async function s3client() {
  if (_client) return _client;
  const { S3Client } = await import('@aws-sdk/client-s3');
  _client = new S3Client({
    region: S3.region, endpoint: S3.endpoint, forcePathStyle: true,
    credentials: { accessKeyId: S3.accessKeyId, secretAccessKey: S3.secretAccessKey },
  });
  return _client;
}

function dims(buffer) {
  try { const d = sizeOf(buffer); return { width: d?.width || null, height: d?.height || null }; }
  catch { return { width: null, height: null }; }
}

// Store one image and record it in rn_media. Returns { id, url, width, height, mime, bytes }.
export async function putImage({ buffer, mime, noteId = null, userId = null, alt = null, caption = null, originalName = null }) {
  if (!isAllowedImage(mime)) throw Object.assign(new Error('Unsupported image type (use PNG, JPEG, WebP or GIF)'), { status: 415 });
  const id = randomUUID();
  const ext = extFor(mime);
  const { width, height } = dims(buffer);
  const mode = storageMode();
  let url; let storageKey = null; let data = null;

  if (mode === 's3') {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    storageKey = `research-notes/${id}.${ext}`;
    const client = await s3client();
    await client.send(new PutObjectCommand({
      Bucket: S3.bucket, Key: storageKey, Body: buffer, ContentType: mime,
      CacheControl: 'public, max-age=31536000, immutable',
    }));
    url = `${S3.publicBase}/${storageKey}`;
  } else {
    data = buffer;                      // stored in Neon, served by /research-notes/media/:id
    url = `/research-notes/media/${id}`;
  }

  await query(
    `INSERT INTO rn_media (id, note_id, storage_provider, storage_key, url, mime, bytes, width, height,
        alt, caption, original_name, created_by, data)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [id, noteId, mode, storageKey, url, mime, buffer.length, width, height, alt, caption, originalName, userId, data]);

  return { id, url, width, height, mime, bytes: buffer.length };
}

export async function getMediaForServe(id) {
  const { rows } = await query('SELECT mime, data, storage_provider, url FROM rn_media WHERE id = $1', [id]);
  return rows[0] || null;
}

export async function listMedia(noteId) {
  const { rows } = await query(
    'SELECT id, url, mime, bytes, width, height, alt, caption, original_name, created_at FROM rn_media WHERE note_id = $1 ORDER BY created_at DESC',
    [noteId]);
  return rows;
}

// Replace embedded <img src="data:...base64,..."> (e.g. from a Word import) with
// stored, durable images referenced by URL. Keeps body_html small.
export async function externalizeDataUriImages(html, { noteId = null, userId = null } = {}) {
  const re = /<img\b[^>]*?src="data:(image\/(?:png|jpeg|jpg|gif|webp));base64,([^"]+)"[^>]*>/gi;
  const matches = [...String(html || '').matchAll(re)];
  if (!matches.length) return html;
  let out = html;
  for (const m of matches) {
    const mime = m[1] === 'image/jpg' ? 'image/jpeg' : m[1];
    try {
      const buffer = Buffer.from(m[2], 'base64');
      const stored = await putImage({ buffer, mime, noteId, userId });
      const newTag = m[0].replace(/src="data:[^"]+"/i, `src="${stored.url}"`);
      out = out.replace(m[0], newTag);
    } catch { /* leave the original inline image if upload fails */ }
  }
  return out;
}
