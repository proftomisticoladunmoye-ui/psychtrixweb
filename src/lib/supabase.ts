// Drop-in replacement for the Supabase client, backed by our own API (server/).
// Exposes the subset of the supabase-js surface this app actually uses —
// auth (password sign-in/up, sessions) and the PostgREST-style query builder —
// so the ~50 existing call sites keep working unchanged.

import { cacheDatasets, readCachedDatasets } from './offlineCache';
import { enqueueOp, allOps, removeOp, countOps, shouldQueue, replayOutcome } from './outbox';

type Row = Record<string, unknown>;

export interface AppUser {
  id: string;
  email: string;
  created_at?: string;
  // Compatibility fields some components read on the Supabase User type:
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
}

interface AuthResult {
  data: { user: AppUser | null; session: { user: AppUser } | null };
  error: { message: string } | null;
}

const TOKEN_KEY = 'ptx_token';
const USER_KEY = 'ptx_user';

function storedToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function storedUser(): AppUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as AppUser; } catch { return null; }
}

function storeSession(user: AppUser | null, token: string | null) {
  if (user && token) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }
}

async function api(path: string, options: RequestInit = {}): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(options.headers as any) };
  const token = storedToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { ...options, headers });
  } catch {
    return { status: 0, body: null }; // network failure (offline) — handled by callers
  }
  let body: any = null;
  try { body = await res.json(); } catch { /* empty body */ }
  // A 401 on an authenticated request means the stored session token was
  // rejected (expired or revoked). Sign out cleanly instead of leaving the
  // cached user "logged in" while every request fails. Auth routes are exempt
  // (a 401 there is just bad credentials, not an expired session).
  if (res.status === 401 && token && !path.startsWith('/auth/') && storedToken()) {
    storeSession(null, null);
    emit('SIGNED_OUT');
  }
  return { status: res.status, body };
}

// ---- auth -------------------------------------------------------------------
type AuthListener = (event: string, session: { user: AppUser } | null) => void;
const listeners = new Set<AuthListener>();

function emit(event: string) {
  const user = storedUser();
  const session = user ? { user } : null;
  listeners.forEach((cb) => cb(event, session));
}

function normalizeUser(u: any): AppUser {
  return { ...u, user_metadata: u?.user_metadata ?? {}, app_metadata: u?.app_metadata ?? {} };
}

const auth = {
  async getSession() {
    const user = storedUser();
    return { data: { session: user ? { user } : null }, error: null };
  },

  async getUser() {
    const user = storedUser();
    if (!user) return { data: { user: null }, error: { message: 'Not signed in' } };
    return { data: { user }, error: null };
  },

  onAuthStateChange(cb: AuthListener) {
    listeners.add(cb);
    return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } };
  },

  async signInWithPassword({ email, password }: { email: string; password: string }): Promise<AuthResult> {
    const { status, body } = await api('/auth/signin', { method: 'POST', body: JSON.stringify({ email, password }) });
    if (status !== 200) {
      return { data: { user: null, session: null }, error: { message: body?.error ?? 'Sign-in failed' } };
    }
    const user = normalizeUser(body.user);
    storeSession(user, body.token);
    emit('SIGNED_IN');
    return { data: { user, session: { user } }, error: null };
  },

  async signUp({ email, password }: { email: string; password: string }): Promise<AuthResult> {
    const { status, body } = await api('/auth/signup', { method: 'POST', body: JSON.stringify({ email, password }) });
    if (status !== 200) {
      return { data: { user: null, session: null }, error: { message: body?.error ?? 'Sign-up failed' } };
    }
    const user = normalizeUser(body.user);
    storeSession(user, body.token);
    emit('SIGNED_IN');
    return { data: { user, session: { user } }, error: null };
  },

  async signOut() {
    await api('/auth/signout', { method: 'POST' }).catch(() => undefined);
    storeSession(null, null);
    emit('SIGNED_OUT');
    return { error: null };
  },

  async updateUser(attrs: { password?: string }) {
    const { status, body } = await api('/auth/update', { method: 'POST', body: JSON.stringify(attrs) });
    if (status !== 200) return { data: { user: null }, error: { message: body?.error ?? 'Update failed' } };
    return { data: { user: storedUser() }, error: null };
  },
};

// ---- query builder ----------------------------------------------------------
type Result = { data: any; error: { message: string } | null; count: number | null };

class QueryBuilder implements PromiseLike<Result> {
  private table: string;
  private action: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private payload: Row | Row[] | null = null;
  private filters: Array<[string, string, string]> = []; // [op, column, value]
  private orderBy: string | null = null;
  private limitN: number | null = null;
  private wantSingle = false;
  private allowEmpty = false; // maybeSingle
  private countMode: string | null = null;
  private headOnly = false;
  private isUpsert = false;
  private columns: string | null = null;

  constructor(table: string) { this.table = table; }

  select(columns?: string, opts?: { count?: string; head?: boolean }) {
    if (this.action === 'select' || !this.payload) this.action = this.action === 'select' ? 'select' : this.action;
    if (opts?.count) this.countMode = opts.count;
    if (opts?.head) this.headOnly = true;
    // Column projection — dataset rows carry large jsonb blobs, so list views
    // must be able to fetch metadata only. Nested selects (parentheses) are
    // not supported by the backend and fall back to all columns.
    if (columns && columns !== '*' && !columns.includes('(')) {
      this.columns = columns.split(',').map(c => c.trim()).filter(Boolean).join(',');
    }
    return this;
  }

  insert(rows: Row | Row[]) { this.action = 'insert'; this.payload = rows; return this; }
  upsert(rows: Row | Row[]) { this.action = 'insert'; this.payload = rows; this.isUpsert = true; return this; }
  update(patch: Row) { this.action = 'update'; this.payload = patch; return this; }
  delete() { this.action = 'delete'; return this; }

  eq(col: string, val: unknown) { this.filters.push(['eq', col, String(val)]); return this; }
  neq(col: string, val: unknown) { this.filters.push(['neq', col, String(val)]); return this; }
  gt(col: string, val: unknown) { this.filters.push(['gt', col, String(val)]); return this; }
  gte(col: string, val: unknown) { this.filters.push(['gte', col, String(val)]); return this; }
  lt(col: string, val: unknown) { this.filters.push(['lt', col, String(val)]); return this; }
  lte(col: string, val: unknown) { this.filters.push(['lte', col, String(val)]); return this; }
  in(col: string, vals: unknown[]) { this.filters.push(['in', col, vals.map(String).join(',')]); return this; }

  order(col: string, opts?: { ascending?: boolean }) {
    this.orderBy = `${col}.${opts?.ascending === false ? 'desc' : 'asc'}`;
    return this;
  }

  limit(n: number) { this.limitN = n; return this; }
  single() { this.wantSingle = true; return this; }
  maybeSingle() { this.wantSingle = true; this.allowEmpty = true; return this; }

  private queryString(): string {
    const params = new URLSearchParams();
    for (const [op, col, val] of this.filters) params.set(`${op}.${col}`, val);
    if (this.orderBy) params.set('order', this.orderBy);
    if (this.limitN != null) params.set('limit', String(this.limitN));
    if (this.countMode) params.set('count', this.countMode);
    if (this.headOnly) params.set('head', 'true');
    if (this.isUpsert) params.set('upsert', 'true');
    if (this.columns && this.action === 'select') params.set('select', this.columns);
    const qs = params.toString();
    return qs ? `?${qs}` : '';
  }

  private async execute(): Promise<Result> {
    const path = `/db/${this.table}${this.queryString()}`;
    const method = this.action === 'insert' ? 'POST' : this.action === 'update' ? 'PATCH' : this.action === 'delete' ? 'DELETE' : 'GET';
    const hasBody = this.action === 'insert' || this.action === 'update';
    let { status, body } = await api(path, this.action === 'select'
      ? {}
      : { method, body: hasBody ? JSON.stringify(this.payload) : undefined });

    // Offline write outbox: a mutation that failed because we're offline
    // (fetch threw → status 0) is queued and replayed on reconnect. We report
    // optimistic success so the UI isn't blocked; the change syncs later.
    if (this.action !== 'select' && status === 0 && shouldQueue(method, path)) {
      await enqueueOp({ method: method as 'POST' | 'PATCH' | 'DELETE', path, body: hasBody ? this.payload : null, table: this.table, action: this.action });
      return { data: null, error: null, count: null };
    }

    // Offline dataset cache: keep the `datasets` table usable without a network.
    if (this.action === 'select' && this.table === 'datasets') {
      if (status === 0) {
        const cached = await readCachedDatasets(this.filters, this.columns).catch(() => [] as any[]);
        if (cached.length) { status = 200; body = { data: this.headOnly ? [] : cached, count: cached.length }; }
      } else if (status >= 200 && status < 300 && Array.isArray(body?.data)) {
        cacheDatasets(body.data).catch(() => {}); // fire-and-forget
      }
    }

    if (status < 200 || status >= 300) {
      const message = status === 0
        ? 'You appear to be offline, and this data isn’t available offline yet.'
        : (body?.error ?? `Request failed (${status})`);
      return { data: null, error: { message }, count: null };
    }

    let data = body?.data ?? null;
    const count = body?.count ?? null;
    if (this.wantSingle) {
      const row = Array.isArray(data) ? data[0] : data;
      if (row == null && !this.allowEmpty) {
        return { data: null, error: { message: 'Row not found' }, count };
      }
      data = row ?? null;
    }
    return { data, error: null, count };
  }

  then<T1 = Result, T2 = never>(
    onfulfilled?: ((value: Result) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

export const supabase = {
  auth,
  from: (table: string) => new QueryBuilder(table),
  rpc: async (name: string, args?: Row) => {
    const { status, body } = await api(`/rpc/${name}`, { method: 'POST', body: JSON.stringify(args ?? {}) });
    return status === 200
      ? { data: body, error: null }
      : { data: null, error: { message: body?.error ?? 'RPC failed' } };
  },
};

// ---- background sync --------------------------------------------------------
// Replay queued offline writes, in order, against the API. Called on reconnect.
// Stops on the first network failure (still offline) or 5xx so it can retry
// later; drops client-rejected (4xx) ops so the queue can't wedge forever.
export async function flushOutbox(): Promise<{ synced: number; dropped: number; remaining: number }> {
  const ops = await allOps();
  let synced = 0, dropped = 0;
  for (const op of ops) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = storedToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    let res: Response;
    try {
      res = await fetch(`/api${op.path}`, { method: op.method, headers, body: op.body != null ? JSON.stringify(op.body) : undefined });
    } catch {
      break; // still offline — stop and retry on the next reconnect
    }
    const outcome = replayOutcome(res.status);
    if (outcome === 'retry') break;
    if (op.id != null) await removeOp(op.id);
    if (outcome === 'done') synced++; else dropped++;
  }
  return { synced, dropped, remaining: await countOps() };
}

export { countOps as pendingWriteCount } from './outbox';
