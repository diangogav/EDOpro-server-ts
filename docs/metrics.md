# Metrics and per-duel resources

The server can report what each duel costs (CPU and memory) and how the server process behaves, for a Prometheus-compatible collector (Grafana Alloy → Mimir) and a log store (Loki).

Both are off by default.

## Configuration

| Variable | Default | Effect |
| --- | --- | --- |
| `METRICS_ENABLED` | `false` | `true` measures every duel engine and serves `/metrics` |
| `METRICS_HOST` | `127.0.0.1` | Interface `/metrics` listens on |
| `METRICS_PORT` | `9464` | Port `/metrics` listens on (never the public `HTTP_PORT`) |
| `METRICS_SAMPLE_INTERVAL_MS` | `2000` | How often an EDOPro core process is sampled |
| `LOG_FORMAT` | `pretty` | `json` writes one JSON object per line to stdout, so Loki can filter by field |
| `LOG_LEVEL` | `info` | Minimum level written (`trace`, `debug`, `info`, `warn`, `error`, `fatal`). `debug` also logs every inbound frame |

The server runs with host networking, so any port it opens is reachable on the public IP unless a firewall blocks it. Set `METRICS_HOST` to an interface only the collector reaches, such as the gateway of the monitoring Docker bridge (`docker network inspect <network> --format '{{range .IPAM.Config}}{{.Gateway}}{{end}}'`). If the address cannot be bound, the server logs the error and keeps starting without `/metrics`.

## What is measured

Each duel engine is measured from the moment it starts until it ends:

| Flow | Engine | CPU | Memory |
| --- | --- | --- | --- |
| EDOPro | `CoreIntegrator` child process | `utime + stime` from `/proc/<pid>/stat` | Peak RSS (`VmHWM`) from `/proc/<pid>/status` |
| YGOPro | WASM ocgcore in a worker thread | `process.threadCpuUsage()` of the worker thread | WASM heap size (it only grows, so it is the peak) plus the worker's V8 heap |

Limits:

- An EDOPro process is gone from `/proc` once it exits, so its figures come from the last sample. The CPU can miss at most the final sample interval; the peak memory is exact.
- A YGOPro worker reports its stats right before it is disposed. A worker killed after a timeout cannot answer, so that duel records only its duration.
- A best-of-3 match records one entry per game: each game starts its own engine.

## Outputs

When an engine ends, the server writes one log line:

```json
{"level":30,"msg":"duel.resources","file":"metrics","flow":"edopro","roomId":12,"matchId":"…","ranked":true,"durationMs":512000,"cpuSeconds":3.4,"peakMemoryBytes":41943040}
```

`cpuSeconds` and `peakMemoryBytes` are `null` when the engine could not be measured.

`/metrics` exposes:

| Metric | Type | Labels |
| --- | --- | --- |
| `evolution_duels_active` | gauge | `flow` |
| `evolution_duel_cpu_seconds` | histogram | `flow`, `ranked` |
| `evolution_duel_peak_memory_bytes` | histogram | `flow`, `ranked` |
| `evolution_duel_duration_seconds` | histogram | `flow`, `ranked` |
| `evolution_process_threads` | gauge | — |
| `evolution_child_processes` | gauge | — |
| `process_*`, `nodejs_*` | default Node.js metrics | — |

Per-duel identifiers (room, match) go only to the log line; metric labels stay low-cardinality.

`evolution_process_threads` and `evolution_child_processes` come from procfs on each scrape, so they count what is really alive: every YGOPro ocgcore worker is one thread and every EDOPro core is one child process. If they stay above their idle baseline while `evolution_duels_active` is 0, an engine outlived its duel.

`process_cpu_seconds_total` covers the Node process and its YGOPro worker threads. EDOPro cores are separate processes, so host CPU (node_exporter) is the total.

## Memory and malloc arenas

The image sets `MALLOC_ARENA_MAX=2`. Each YGOPro duel runs in a worker thread that lives only as long as the duel, and glibc gives threads their own malloc arenas (up to 8 per core by default). Memory freed when a worker ends stayed inside its arena, so the process RSS grew with every busy hour and barely dropped when duels ended, while the V8 heap stayed flat. With two shared arenas, the RSS follows the number of live duels and falls again when they end.

To read it on the dashboard, compare **Node process memory** with **Engines alive vs active duels**: `evolution_process_threads` returning to its idle baseline means the workers are gone, and the RSS should drop after it. A `docker run -e MALLOC_ARENA_MAX=...` flag overrides the image value.

## Wiring it into Grafana

1. Set `LOG_FORMAT=json`, `METRICS_ENABLED=true` and `METRICS_HOST=<collector-reachable IP>` on the server and redeploy.
2. Check the endpoint from the host: `curl -s http://<METRICS_HOST>:9464/metrics | grep evolution_duels_active`.
3. Append [`monitoring/alloy-evolution-server.river`](./monitoring/alloy-evolution-server.river) to the Alloy config (adjust the address) and restart Alloy.
4. In Grafana, import [`monitoring/grafana-evolution-server.json`](./monitoring/grafana-evolution-server.json) (Dashboards → New → Import) and pick the Mimir and Loki data sources.

Useful Loki query for the heaviest duels:

```logql
{container_name="evolutionygo-server"} | json | msg="duel.resources" | cpuSeconds > 5
```
