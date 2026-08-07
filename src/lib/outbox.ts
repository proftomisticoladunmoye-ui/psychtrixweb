// Offline write outbox (background sync). Mutations that fail because the device
// is offline are stored here and replayed, in order, once connectivity returns.
//
// Safety: we only enqueue on a *network failure* (fetch threw → status 0), which
// means the request never reached the server, so replaying it can't double-apply.
// Reads are handled separately by the dataset cache (offlineCache.ts).

const DB_NAME = 'ptx-outbox';
const STORE = 'ops';
const VERSION = 1;

export interface OutboxOp {
  id?: number;              // auto-increment key
  method: 'POST' | 'PATCH' | 'DELETE';
  path: string;             // API path without the /api prefix, e.g. '/db/datasets?...'
  body: unknown;            // JSON payload (or null)
  table: string;            // for a human-readable label
  action: string;          // insert | update | delete
  ts: number;               // enqueue time
}

// ---- pure helpers (unit-tested) --------------------------------------------

/** Only queue offline writes to the data API — never auth or rpc. */
export function shouldQueue(method: string, path: string): boolean {
  const m = method.toUpperCase();
  if (m !== 'POST' && m !== 'PATCH' && m !== 'DELETE') return false;
  return path.startsWith('/db/');
}

/** A short human label for a queued op, for the sync indicator / debugging. */
export function opLabel(op: Pick<OutboxOp, 'action' | 'table'>): string {
  const verb = op.action === 'insert' ? 'Save' : op.action === 'update' ? 'Update' : 'Delete';
  return `${verb} ${op.table}`;
}

/** Decide what to do with a replayed op's HTTP status. */
export function replayOutcome(status: number): 'done' | 'drop' | 'retry' {
  if (status >= 200 && status < 300) return 'done';   // applied — remove from queue
  if (status >= 400 && status < 500) return 'drop';    // client error — will never succeed; give up
  return 'retry';                                       // 0 (offline) or 5xx — keep and try again later
}

// ---- IndexedDB store --------------------------------------------------------

let dbPromise: Promise<IDBDatabase> | null = null;
function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('no IndexedDB')); return; }
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

const reqDone = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export async function enqueueOp(op: Omit<OutboxOp, 'id' | 'ts'>): Promise<void> {
  let db: IDBDatabase;
  try { db = await openDB(); } catch { return; }
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).add({ ...op, ts: Date.now() });
  await new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
}

export async function allOps(): Promise<OutboxOp[]> {
  let db: IDBDatabase;
  try { db = await openDB(); } catch { return []; }
  const tx = db.transaction(STORE, 'readonly');
  const rows = (await reqDone(tx.objectStore(STORE).getAll())) as OutboxOp[];
  return rows.sort((a, b) => (a.id ?? 0) - (b.id ?? 0)); // FIFO
}

export async function removeOp(id: number): Promise<void> {
  let db: IDBDatabase;
  try { db = await openDB(); } catch { return; }
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).delete(id);
  await new Promise<void>((res) => { tx.oncomplete = () => res(); tx.onerror = () => res(); });
}

export async function countOps(): Promise<number> {
  let db: IDBDatabase;
  try { db = await openDB(); } catch { return 0; }
  const tx = db.transaction(STORE, 'readonly');
  return (await reqDone(tx.objectStore(STORE).count())) as number;
}
