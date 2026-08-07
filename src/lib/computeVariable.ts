// Compute / Transform Variable engine (SPSS-style). Pure functions that take a
// dataset (array of row objects + column names) and produce a new column of
// values, so a user can derive scale scores, standardized scores, recodes, etc.
// and feed them into any downstream analysis. No eval / new Function — the
// expression method uses a small shunting-yard parser over a whitelisted grammar.

export type ComputeMethod = 'sum' | 'mean' | 'zscore' | 'expression' | 'recode' | 'rank';

export interface RecodeRule {
  lo: number;      // range low (inclusive); for a single value set lo === hi
  hi: number;      // range high (inclusive)
  to: number | ''; // output value ('' → system missing)
}

export interface ComputeSpec {
  method: ComputeMethod;
  // sum / mean: the variables to aggregate, with optional reverse-scoring
  items?: string[];
  reverse?: Record<string, boolean>;
  scaleMin?: number;
  scaleMax?: number;
  minValid?: number;          // require at least this many non-missing items (else missing)
  // zscore / rank / recode: the single source variable
  source?: string;
  // recode
  rules?: RecodeRule[];
  elseKeep?: boolean;         // unmatched → keep original (true) or set missing (false)
  // expression
  expression?: string;
}

export type Cell = number | '';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const toNum = (v: unknown): number => {
  if (v === null || v === undefined || v === '') return NaN;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : NaN;
};

// ---- expression parser (shunting-yard → RPN) --------------------------------
type Tok =
  | { t: 'num'; v: number }
  | { t: 'var'; v: string }
  | { t: 'op'; v: string }
  | { t: 'fn'; v: string }
  | { t: 'lp' }
  | { t: 'rp' }
  | { t: 'comma' };

const FUNCS = new Set(['mean', 'sum', 'min', 'max', 'sqrt', 'abs', 'ln', 'log', 'exp', 'round', 'pow']);
// Exponentiation binds tighter than unary minus (so -a^2 = -(a^2)); both are
// right-associative.
const PREC: Record<string, number> = { '+': 2, '-': 2, '*': 3, '/': 3, 'u-': 4, '^': 5 };
const RIGHT = new Set(['^', 'u-']);

function tokenize(expr: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  const prevMeaningful = () => toks[toks.length - 1];
  while (i < expr.length) {
    const c = expr[i];
    if (c === ' ' || c === '\t' || c === '\n') { i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i + 1;
      while (j < expr.length && /[0-9.]/.test(expr[j])) j++;
      toks.push({ t: 'num', v: Number(expr.slice(i, j)) });
      i = j; continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1;
      while (j < expr.length && /[A-Za-z0-9_.]/.test(expr[j])) j++;
      const name = expr.slice(i, j);
      if (FUNCS.has(name.toLowerCase())) toks.push({ t: 'fn', v: name.toLowerCase() });
      else toks.push({ t: 'var', v: name });
      i = j; continue;
    }
    if (c === '(') { toks.push({ t: 'lp' }); i++; continue; }
    if (c === ')') { toks.push({ t: 'rp' }); i++; continue; }
    if (c === ',') { toks.push({ t: 'comma' }); i++; continue; }
    if ('+-*/^'.includes(c)) {
      // unary minus: at start, or after another operator / '(' / ','
      const p = prevMeaningful();
      const unary = c === '-' && (!p || p.t === 'op' || p.t === 'lp' || p.t === 'comma' || p.t === 'fn');
      toks.push({ t: 'op', v: unary ? 'u-' : c });
      i++; continue;
    }
    throw new Error(`Unexpected character “${c}” in expression`);
  }
  return toks;
}

function toRPN(toks: Tok[]): Tok[] {
  const out: Tok[] = [];
  const stack: Tok[] = [];
  const argc: number[] = []; // function argument counts
  for (let k = 0; k < toks.length; k++) {
    const tk = toks[k];
    if (tk.t === 'num' || tk.t === 'var') out.push(tk);
    else if (tk.t === 'fn') { stack.push(tk); }
    else if (tk.t === 'comma') {
      while (stack.length && stack[stack.length - 1].t !== 'lp') out.push(stack.pop()!);
      if (argc.length) argc[argc.length - 1]++;
    } else if (tk.t === 'op') {
      while (
        stack.length && stack[stack.length - 1].t === 'op' &&
        (RIGHT.has(tk.v) ? PREC[(stack[stack.length - 1] as any).v] > PREC[tk.v]
                         : PREC[(stack[stack.length - 1] as any).v] >= PREC[tk.v])
      ) out.push(stack.pop()!);
      stack.push(tk);
    } else if (tk.t === 'lp') {
      stack.push(tk);
      if (toks[k - 1] && toks[k - 1].t === 'fn') argc.push(1);
    } else if (tk.t === 'rp') {
      while (stack.length && stack[stack.length - 1].t !== 'lp') out.push(stack.pop()!);
      if (!stack.length) throw new Error('Mismatched parentheses');
      stack.pop(); // remove '('
      if (stack.length && stack[stack.length - 1].t === 'fn') {
        const fn = stack.pop()! as Extract<Tok, { t: 'fn' }>;
        const n = argc.pop() ?? 1;
        out.push({ t: 'fn', v: fn.v } as Tok);
        (out[out.length - 1] as any).argc = n;
      }
    }
  }
  while (stack.length) {
    const s = stack.pop()!;
    if (s.t === 'lp' || s.t === 'rp') throw new Error('Mismatched parentheses');
    out.push(s);
  }
  return out;
}

function applyFn(name: string, args: number[]): number {
  switch (name) {
    case 'mean': return args.length ? args.reduce((a, b) => a + b, 0) / args.length : NaN;
    case 'sum': return args.reduce((a, b) => a + b, 0);
    case 'min': return Math.min(...args);
    case 'max': return Math.max(...args);
    case 'sqrt': return Math.sqrt(args[0]);
    case 'abs': return Math.abs(args[0]);
    case 'ln': return Math.log(args[0]);
    case 'log': return Math.log10(args[0]);
    case 'exp': return Math.exp(args[0]);
    case 'round': return Math.round(args[0]);
    case 'pow': return Math.pow(args[0], args[1]);
    default: return NaN;
  }
}

function evalRPN(rpn: Tok[], vars: Record<string, number>): number {
  const st: number[] = [];
  for (const tk of rpn) {
    if (tk.t === 'num') st.push(tk.v);
    else if (tk.t === 'var') {
      const v = vars[tk.v];
      st.push(v === undefined ? NaN : v);
    } else if (tk.t === 'op') {
      if (tk.v === 'u-') { const a = st.pop()!; st.push(-a); continue; }
      const b = st.pop()!, a = st.pop()!;
      st.push(tk.v === '+' ? a + b : tk.v === '-' ? a - b : tk.v === '*' ? a * b : tk.v === '/' ? a / b : Math.pow(a, b));
    } else if (tk.t === 'fn') {
      const n = (tk as any).argc ?? 1;
      const args: number[] = [];
      for (let i = 0; i < n; i++) args.unshift(st.pop()!);
      st.push(applyFn(tk.v, args));
    }
  }
  return st.length === 1 ? st[0] : NaN;
}

/** Compile an expression once; returns a per-row evaluator. Throws on bad syntax. */
export function compileExpression(expr: string): (row: Record<string, unknown>) => Cell {
  const rpn = toRPN(tokenize(expr));
  return (row) => {
    const vars: Record<string, number> = {};
    for (const key of Object.keys(row)) vars[key] = toNum(row[key]);
    const r = evalRPN(rpn, vars);
    return Number.isFinite(r) ? r : '';
  };
}

// ---- the main entry point ---------------------------------------------------
/** Compute a new column of values for every row, per the spec. */
export function computeColumn(data: Array<Record<string, unknown>>, spec: ComputeSpec): Cell[] {
  switch (spec.method) {
    case 'sum':
    case 'mean': {
      const items = spec.items ?? [];
      const min = spec.scaleMin ?? 0, max = spec.scaleMax ?? 0;
      const rev = spec.reverse ?? {};
      const need = spec.minValid ?? 1;
      return data.map((row) => {
        const vals: number[] = [];
        for (const it of items) {
          let n = toNum(row[it]);
          if (!Number.isFinite(n)) continue;
          if (rev[it]) n = min + max - n;
          vals.push(n);
        }
        if (vals.length < Math.max(1, need)) return '';
        const s = vals.reduce((a, b) => a + b, 0);
        return spec.method === 'sum' ? s : s / vals.length;
      });
    }
    case 'zscore': {
      const src = spec.source!;
      const nums = data.map((r) => toNum(r[src]));
      const valid = nums.filter(Number.isFinite);
      const m = valid.reduce((a, b) => a + b, 0) / (valid.length || 1);
      const sd = Math.sqrt(valid.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(valid.length - 1, 1));
      return nums.map((n) => (Number.isFinite(n) && sd > 0 ? (n - m) / sd : ''));
    }
    case 'rank': {
      const src = spec.source!;
      const nums = data.map((r) => toNum(r[src]));
      const idx = nums.map((n, i) => ({ n, i })).filter((x) => Number.isFinite(x.n)).sort((a, b) => a.n - b.n);
      const ranks = new Array<Cell>(nums.length).fill('');
      let k = 0;
      while (k < idx.length) {
        let j = k;
        while (j + 1 < idx.length && idx[j + 1].n === idx[k].n) j++;
        const avg = (k + j) / 2 + 1; // average rank for ties (1-based)
        for (let t = k; t <= j; t++) ranks[idx[t].i] = avg;
        k = j + 1;
      }
      return ranks;
    }
    case 'recode': {
      const src = spec.source!;
      const rules = spec.rules ?? [];
      return data.map((row) => {
        const n = toNum(row[src]);
        if (!Number.isFinite(n)) return spec.elseKeep ? (isNum(row[src]) ? (row[src] as number) : '') : '';
        for (const r of rules) if (n >= r.lo && n <= r.hi) return r.to;
        return spec.elseKeep ? n : '';
      });
    }
    case 'expression': {
      const fn = compileExpression(spec.expression ?? '');
      return data.map((row) => fn(row));
    }
    default:
      return data.map(() => '');
  }
}

/** Quick validity summary for a computed column (for the preview panel). */
export function summarize(values: Cell[]): { valid: number; missing: number; min?: number; max?: number; mean?: number } {
  const nums = values.filter(isNum) as number[];
  const missing = values.length - nums.length;
  if (!nums.length) return { valid: 0, missing };
  const min = Math.min(...nums), max = Math.max(...nums);
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  return { valid: nums.length, missing, min, max, mean };
}
