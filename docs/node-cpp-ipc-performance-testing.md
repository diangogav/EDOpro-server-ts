# Node.js ↔ C++ IPC performance testing

This document adds reproducible local benchmarks for the child-process IPC channel.

## Included scripts

- `npm run perf:protocol`
  - Microbenchmark for JSON serialization/parsing and length-prefixed frame encode/decode.
- `npm run perf:ipc`
  - End-to-end IPC benchmark using a child-process echo worker that mimics current transport:
    - parent writes line-delimited JSON commands,
    - child replies with `uint32_le + json` frames.

## Environment variables

### `perf:protocol`

- `BENCH_ITERATIONS` (default `200000`)
- `BENCH_PAYLOAD_BYTES` (default `256`)

Example:

```bash
BENCH_ITERATIONS=500000 BENCH_PAYLOAD_BYTES=512 npm run perf:protocol
```

### `perf:ipc`

- `BENCH_MESSAGES` (default `20000`)
- `BENCH_CONCURRENCY` (default `512`)
- `BENCH_PAYLOAD_BYTES` (default `128`)

Example:

```bash
BENCH_MESSAGES=50000 BENCH_CONCURRENCY=1024 BENCH_PAYLOAD_BYTES=256 npm run perf:ipc
```

## Metrics reported

- Throughput (`throughputMsgPerSec`)
- End-to-end latency (`p50`, `p95`, `p99`)
- Backpressure stats (`drainCount`, `totalDrainWaitMs`)

## Suggested baseline workflow

1. Run both scripts on current branch.
2. Save JSON output artifacts.
3. Apply protocol changes (e.g. bidirectional length-prefix framing).
4. Repeat benchmarks with same env vars.
5. Compare p95/p99 latency and throughput deltas.

## Production metrics capture

You can enable periodic IPC metrics logs per room by setting:

```bash
IPC_METRICS_ENABLED=true
```

When enabled, each active EDO room logs a structured `IPC_METRICS` event every 60 seconds with:

- queue depth and max queue depth
- commands enqueued/written and stdin write errors
- drain count and total drain wait time
- stdout chunk/bytes counts
- processed frames, parse errors, and deferred ticks

Use this in production/staging to collect real IPC behavior and share snapshots for analysis.
