# Statistical engine regression tests

Known-truth regression tests for the core psychometric engines in `src/lib`.
They exist to lock in statistical correctness so future edits can't silently
break an engine (several modules were found returning fabricated/incorrect
values in the past — these tests are the guard against that recurring).

## Run

```bash
npm test
```

No test framework is installed. The runner (`tests/run.mjs`) bundles each
`*.test.ts` with **esbuild** (already present via Vite) and executes it with
**Node's built-in test runner** (`node:test` / `node:assert`) — zero extra
dependencies.

## What's covered

| File | Engine | Kind of check |
|------|--------|---------------|
| `statDistributions.test.ts` | `statDistributions.ts` | exact: Φ, lnΓ, χ² critical values |
| `polychoric.test.ts` | `polychoric.ts` | exact: Φ⁻¹ at known points |
| `scaleUtils.test.ts` | `scaleUtils.ts` | exact hand-calc α; ω / split-half / percentiles / z,T |
| `factorAnalysis.test.ts` | `factorAnalysis.ts` | recovery: parallel analysis factor count; EFA loadings |
| `itemResponseTheory.test.ts` | `itemResponseTheory.ts` | recovery: 2PL item parameters |
| `polytomousIRT.test.ts` | `polytomousIRT.ts` | recovery: GRM & GPCM parameters; valid category probs |
| `measurementInvariance.test.ts` | `measurementInvariance.ts` | behaviour: invariance supported / violation flagged |

Two styles are used:

- **Exact** — an independent, hand-computed value (or textbook constant) the
  function must reproduce within a tight tolerance.
- **Recovery** — data are simulated from *known* parameters with a fixed seed
  (`tests/_helpers.ts`), then the engine must recover them within tolerance.

## Extending

Add a `tests/<engine>.test.ts` that imports from `../src/lib/<engine>` and uses
`node:test` + `node:assert/strict`. Prefer an independent source of truth
(hand calculation or known-parameter simulation) over asserting whatever the
code currently returns — otherwise the test just freezes a possible bug.
