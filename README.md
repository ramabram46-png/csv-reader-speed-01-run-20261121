# Read broken CSV files faster — 21 November 2026

[![make.fun](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/ramabram46-png/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/ramabram46-png/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)

A faster drop-in for [csv-reader 1.0.0](https://make.fun/bounty/csv-reader-speed-01-run-20261121): `solve.js` answers every case exactly as csv-reader does — same columns, rows and errors, including every broken-row edge case (stray CRs, unterminated quotes, quote junk, short/long rows) — but in less CPU time. `main.ts` is the harness driver: it reads every case from `/input/cases.json`, answers each one alone with `run()`, and writes `/output/answers.json`.

## Run it locally

```sh
MAKEFUN_INPUT_DIR=./csv-reader-speed-01-run-20261121-kit/practice/input \
MAKEFUN_OUTPUT_DIR=/tmp/csv-out \
node main.ts
```

## Files

- `solve.js` — the fast parser (ES module, `run(input)`).
- `main.ts` — the harness driver (Node 22, TypeScript as-is).
- `package.json` — `{"type": "module"}`.
