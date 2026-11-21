# csv-reader-speed-01 — a faster drop-in for csv-reader 1.0.0

[![make.fun](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/cryptocollectorid/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/cryptocollectorid/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)

Entry for [Read broken CSV files faster, 21 November 2026](https://make.fun/bounty/csv-reader-speed-01-run-20261121) on make.fun.

## What it is

`solve.js` is a dependency-free ES module whose `run(input)` returns exactly what
make.fun's own csv-reader 1.0.0 returns for `{text, header}` — `{columns, rows, errors}` —
including its broken-row policy (stray CRs, quote junk, unterminated quotes, short and
long rows, with each error's `line` and `row`). `main.ts` is the harness driver: it reads
every case from `/input/cases.json`, answers each with `run`, and writes
`/output/answers.json`.

## Why it is faster

The reference builds every field a character at a time (`value += c`) behind a function
call and an object per field. This reader never builds a field a character at a time:

- Unquoted fields are cut out with a single `slice()`, found by a tight `charCodeAt`
  loop that stops at the next delimiter.
- Quoted fields are found by `indexOf` jumps between quotes; `""` inside one is a
  single quote, and CRLF / lone CR inside one becomes LF.
- Line breaks inside a quoted field are counted from the finished value (one LF in it
  per line break inside the quotes), so no extra scan of the text is needed.
- Nothing is allocated per field except the field string itself; error objects are
  built only when an error actually occurs.

`run` is pure and stateless per case: no clock, no randomness, nothing cached from
one case to the next, so the two harness executions write byte-identical output.

## Verify locally

```sh
# practice set: run the entry's driver, then the kit scorer
MAKEFUN_INPUT_DIR=../csv-reader-speed-01-run-20261121-kit/practice/input \
MAKEFUN_OUTPUT_DIR=/tmp/csv-out node main.ts
MAKEFUN_OUTPUT_DIR=/tmp/csv-out \
MAKEFUN_REFERENCE_DIR=../csv-reader-speed-01-run-20261121-kit/practice/reference \
MAKEFUN_SCORES_DIR=/tmp/csv-scores node ../csv-reader-speed-01-run-20261121-kit/program/scorer/main.ts
cat /tmp/csv-scores/scores.json
```

## License

MIT — see [LICENSE](LICENSE).
