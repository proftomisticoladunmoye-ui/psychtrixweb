// Offline dataset cache (IndexedDB). Datasets read while online are stored here
// so the analysis modules can keep working without a connection — the API shim
// caches successful `datasets` reads and falls back to this store when offline.
//
// Rows are keyed by id and MERGED, so a metadata-only list read never clobbers
// the full `data` blob fetched when a dataset was opened.

const DB_NAME = 'ptx-offline';
const STORE = 'datasets';
const VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('no IndexedDB')); return; }
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

const reqDone = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

/** Upsert dataset rows (merged by id), preserving an already-cached `data` blob. */
export async function cacheDatasets(rows: any[]): Promise<void> {
  if (!Array.isArray(rows) || rows.length === 0) return;
  let db: IDBDatabase;
  try { db = await openDB(); } catch { return; }
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  for (const row of rows) {
    if (!row || row.id == null) continue;
    const existing = (await reqDone(store.get(row.id))) as any;
    store.put({ ...(existing || {}), ...row }); // metadata-only rows keep the existing data blob
  }
  await new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
}

/** Serve cached datasets for an offline read: apply eq-filters + column projection. */
export async function readCachedDatasets(
  filters: Array<[string, string, string]>,
  columns: string | null,
): Promise<any[]> {
  let db: IDBDatabase;
  try { db = await openDB(); } catch { return []; }
  const tx = db.transaction(STORE, 'readonly');
  let rows = (await reqDone(tx.objectStore(STORE).getAll())) as any[];
  for (const [op, col, val] of filters) {
    // A column that isn't part of the cached projection (e.g. `user_id`, which
    // the analysis modules never select) can't be filtered on offline, so skip
    // it rather than drop every row. The cache only ever holds the signed-in
    // user's own datasets, so a `user_id` scope is already implied.
    if (op === 'eq') rows = rows.filter((r) => !(col in r) || String(r[col]) === val);
    else if (op === 'in') { const set = new Set(val.split(',')); rows = rows.filter((r) => !(col in r) || set.has(String(r[col]))); }
    // other operators are ignored offline (best-effort)
  }
  if (columns) {
    const cols = columns.split(',').map((c) => c.trim());
    rows = rows.map((r) => { const o: any = {}; cols.forEach((c) => { if (c in r) o[c] = r[c]; }); return o; });
  }
  return rows;
}
