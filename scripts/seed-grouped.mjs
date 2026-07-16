// Seed a two-group dataset for measurement invariance testing.
// Both groups share identical population parameters (invariance holds).
//   node scripts/seed-grouped.mjs   (backend on :8787)
const API = 'http://localhost:8787/api';

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(77);
function normal() {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const rows = [];
for (const grp of ['Male', 'Female']) {
  for (let i = 0; i < 200; i++) {
    const g = normal();
    const w = Math.sqrt(0.3);
    const F = [0, 1].map(() => w * g + Math.sqrt(0.7) * normal());
    const row = { group: grp };
    for (let f = 0; f < 2; f++) for (let j = 0; j < 3; j++) {
      const lam = [0.8, 0.7, 0.75][j];
      const x = lam * F[f] + Math.sqrt(1 - lam * lam) * normal();
      row[`v${f * 3 + j + 1}`] = x < -1.5 ? 1 : x < -0.5 ? 2 : x < 0.5 ? 3 : x < 1.5 ? 4 : 5;
    }
    rows.push(row);
  }
}

const res = await fetch(`${API}/auth/signin`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'testuser@psychtrix.dev', password: 'test-password-123' }),
});
const { token } = await res.json();
const columns = ['group', 'v1', 'v2', 'v3', 'v4', 'v5', 'v6'];

const existing = await (await fetch(`${API}/db/datasets?eq.name=TwoGroup_Invariance`, { headers: { Authorization: `Bearer ${token}` } })).json();
for (const d of existing.data) {
  await fetch(`${API}/db/datasets?eq.id=${d.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
}

const ins = await fetch(`${API}/db/datasets`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    name: 'TwoGroup_Invariance',
    file_name: 'TwoGroup_Invariance.csv',
    file_size: JSON.stringify(rows).length,
    columns,
    data: rows,
    rows_count: rows.length,
    metadata: { uploadedAt: new Date().toISOString(), columnTypes: columns.map((c) => ({ name: c, type: c === 'group' ? 'categorical' : 'numeric' })) },
  }),
});
console.log(ins.ok ? 'Seeded TwoGroup_Invariance (400 rows, invariant populations)' : `FAILED: ${await ins.text()}`);
