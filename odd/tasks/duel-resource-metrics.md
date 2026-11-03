# Duel resource metrics

Objective: measure CPU and memory per duel and per process, expose them to the existing Alloy → Mimir/Loki → Grafana stack.
Branch: `feat/duel-resource-metrics` · Delivery: ask-on-risk · Runner: `pnpm test` (jest), `pnpm lint`.

## Specs

- S1 — "quiero medir cuanto consume cada partida en el server y verlo en algun dashboard, ademas de consumo de cpu, memoria ram, etc"
- S2 — Logs: with `LOG_FORMAT=json` the logger writes plain JSON lines to stdout (Loki-queryable). Without it, output is unchanged (pretty).
- S3 — Per duel, when the duel's engine ends, one `duel.resources` log line with: flow (`edopro`|`ygopro`), roomId, matchId, durationMs, cpuSeconds, peakMemoryBytes. EDOPro measures the `CoreIntegrator` process via `/proc/<pid>`; YGOPro measures the worker thread CPU (`process.threadCpuUsage`) and WASM heap.
- S4 — `/metrics` (prom-client) on its own `METRICS_HOST`/`METRICS_PORT`, off unless `METRICS_ENABLED=true`, never on `HTTP_PORT`. Exposes: default Node process metrics, active duels gauge by flow, histograms of per-duel CPU seconds, peak memory and duration by flow. Low-cardinality labels only.
- S5 — Deliver (as files, applied by the user on the server): an Alloy `prometheus.scrape` block for `172.21.0.1:<METRICS_PORT>` and an importable Grafana dashboard JSON. Assumption: Mimir and Loki datasources already exist in Grafana.

## Tasks

- [x] T1 S2 — JSON log format · inline · 00e98815 (RED not observed first: test written after code, exception)
- [x] T2 S3,S4 — metrics module + EDOPro tracking · inline · 1f495428 (RED: missing modules, then 5 wiring tests failed with the wiring stashed)
- [x] T3 S3 — YGOPro worker tracking · inline · 1f495428
- [x] T4 S5 — docs/metrics.md, Alloy snippet, Grafana dashboard · inline · 1f495428 (dashboard not tested against a live Grafana)

Route evidence: one flow, shared module first; no parallel units worth a writer.

## Log

- L1 (2026-11-02) user: "quiero medir cuanto consume cada partida en el server y verlo en algun dashboard, ademas de consumo de cpu, memoria ram, etc"
- L2 server already runs grafana/alloy, mimir, loki, grafana, node-exporter on bridge `obs` (gateway 172.21.0.1); evolutionygo-server uses network host. Alloy already ships all container logs to Loki.
- L3 user: "sí, impleméntalo"
- L4 prom-client 15.1.3 is deprecated in favour of @prometheus-io/client (same API, renamed); used @prometheus-io/client 0.16.1.
- L5 checks: pnpm lint clean; tsc clean; pnpm test 291 suites / 2757 tests passed (before final formatting); real /proc probe read a live process and returned null after exit; koishipro-core wrapper exposes ocgcoreModule.HEAPU8 (16 MiB) at runtime.
- L6 RDD off (global). Risk: item 5 (new runtime dependency, prod compose env) → independent verifier.
- L7 verifier: PASS, no blockers. Advisories fixed: A1 a throw while recording stats no longer skips worker dispose/finalize; A2 metrics off → no stats request to the worker; A3 negative duration clamped to 0; A4 Loki panel shows fields. RED observed (5 tests failed with the fixes stashed). Full suite 291/2762 passed.
