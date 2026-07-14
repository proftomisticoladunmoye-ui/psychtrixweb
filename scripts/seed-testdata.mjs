// Seed the local test account with synthetic datasets of KNOWN structure so
// analysis modules can be tested and their estimates checked against truth.
//
//   node scripts/seed-testdata.mjs   (backend must be running on :8787)
//
// Dataset 1: 9 Likert(1-5) items, N=400, 3 correlated factors (r=.30):
//   F1 -> it1..it3 (loadings .75/.70/.65), F2 -> it4..it6, F3 -> it7..it9
// Dataset 2: 20 binary items, N=500, 2PL IRT (a in [0.8,2.0], b in [-2,2])

const API = 'http://localhost:8787/api';
const EMAIL = 'testuser@psychtrix.dev';
const PASSWORD = 'test-password-123';

// Deterministic RNG so reruns produce identical data.
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260715);
function normal() {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ---- dataset 1: 3-factor Likert ------------------------------------------
const N1 = 400;
const loadings = [0.75, 0.70, 0.65];
const factorCorr = 0.30;
const likertRows = [];
for (let i = 0; i < N1; i++) {
  // three correlated factors via a shared general component
  const g = normal();
  const w = Math.sqrt(factorCorr);
  const F = [0, 1, 2].map(() => w * g + Math.sqrt(1 - factorCorr) * normal());
  const row = {};
  for (let f = 0; f < 3; f++) {
    for (let j = 0; j < 3; j++) {
      const lam = loadings[j];
      const x = lam * F[f] + Math.sqrt(1 - lam * lam) * normal();
      // discretize to 1..5 (thresholds at -1.5, -0.5, 0.5, 1.5)
      row[`it${f * 3 + j + 1}`] = x < -1.5 ? 1 : x < -0.5 ? 2 : x < 0.5 ? 3 : x < 1.5 ? 4 : 5;
    }
  }
  likertRows.push(row);
}

// ---- dataset 2: 2PL binary ------------------------------------------------
const N2 = 500;
const nItems = 20;
const a = Array.from({ length: nItems }, () => 0.8 + rand() * 1.2);
const b = Array.from({ length: nItems }, () => -2 + rand() * 4);
const binaryRows = [];
for (let i = 0; i < N2; i++) {
  const theta = normal();
  const row = {};
  for (let j = 0; j < nItems; j++) {
    const p = 1 / (1 + Math.exp(-a[j] * (theta - b[j])));
    row[`q${j + 1}`] = rand() < p ? 1 : 0;
  }
  binaryRows.push(row);
}

// ---- upload ----------------------------------------------------------------
async function api(path, opts = {}, token) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${path}: ${body?.error ?? res.status}`);
  return body;
}

const { token } = await api('/auth/signin', { method: 'POST', body: JSON.stringify({ email: EMAIL, password: PASSWORD }) });

async function seed(name, columns, rows) {
  // replace any previous copy so reruns stay idempotent
  const existing = await api(`/db/datasets?eq.name=${encodeURIComponent(name)}`, {}, token);
  for (const d of existing.data) await api(`/db/datasets?eq.id=${d.id}`, { method: 'DELETE' }, token);
  await api('/db/datasets', {
    method: 'POST',
    body: JSON.stringify({
      name,
      file_name: `${name}.csv`,
      file_size: JSON.stringify(rows).length,
      columns,
      data: rows,
      rows_count: rows.length,
      metadata: {
        uploadedAt: new Date().toISOString(),
        columnTypes: columns.map((c) => ({ name: c, type: 'numeric' })),
        generator: 'seed-testdata.mjs (known population structure)',
      },
    }),
  }, token);
  console.log(`Seeded "${name}": ${rows.length} rows x ${columns.length} cols`);
}

await seed('ThreeFactor_Likert', Object.keys(likertRows[0]), likertRows);
await seed('TwoPL_Binary', Object.keys(binaryRows[0]), binaryRows);
console.log('True 2PL parameters (for later correctness checks):');
console.log('a:', a.map((v) => v.toFixed(3)).join(', '));
console.log('b:', b.map((v) => v.toFixed(3)).join(', '));
