# Memory capacity reference — concurrent duels vs RAM

Reference table for sizing the server by number of **concurrent duels** on the
YGOPro (WASM worker) path, which is the path the server runs today: each active
duel is one Node worker thread holding its own ocgcore WASM instance
(16 MB initial, growable), its own Lua state with the loaded card scripts, and
its own copy of the card storage buffers and WASM binary.

## Measured cost

Measured on 2026-08-25 (Node 26, Linux x86_64) by spawning real duels — one
worker per duel, two 40-card decks of scripted effect monsters, duel started
and advanced past the opening — and sampling process RSS at checkpoints:

| Concurrent duels | RSS (MB) |
|---|---|
| 0 (baseline) | 114 |
| 1 | 157 |
| 5 | 284 |
| 10 | 436 |
| 20 | 733 |
| 30 | 1026 |

Growth is linear: **~30 MB per concurrent duel** (first duel ~43 MB due to
one-time JIT/module warm-up). Production adds per worker a copy of the full
CardStorage (~15k cards, ~2 MB) and the WASM binary buffer (~1 MB), so the
planning figure below uses **35 MB per duel** as a safe round number. Long
duels with many activated effects grow the Lua state further; the 35 MB figure
absorbs typical growth.

## Planning table

`RAM ≈ baseline + duels × 35 MB`, with the full server baseline (HTTP, DB
clients, banlists, card storage, matchmaking) estimated at ~200 MB. The
"recommended" column keeps total RAM at ≤70% of the machine so the OS, spikes,
and long duels have headroom.

| Concurrent duels | Est. server RAM | Minimum machine | Recommended machine |
|---|---|---|---|
| 10 | ~0.6 GB | 1 GB | 2 GB |
| 25 | ~1.1 GB | 2 GB | 2 GB |
| 50 | ~2.0 GB | 3 GB | 4 GB |
| 75 | ~2.8 GB | 4 GB | 4 GB |
| 100 | ~3.7 GB | 5 GB | 8 GB |
| 150 | ~5.5 GB | 8 GB | 8 GB |
| 200 | ~7.2 GB | 10 GB | 16 GB |
| 300 | ~10.7 GB | 16 GB | 16 GB |
| 400 | ~14.2 GB | 20 GB | 24 GB |
| 500 | ~17.7 GB | 24 GB | 32 GB |

Note that a "duel" here is an active game in progress; rooms in lobby or
side-decking hold no worker and cost only a few hundred KB. Also each duel is
one worker **thread**: past ~2–3× the CPU core count of simultaneously
*processing* duels, latency (not memory) becomes the bottleneck first.

## Reproducing the measurement

The benchmark spawns N workers, each running the production init sequence
(`createOcgcoreWrapper` → `DirScriptReaderEx` over `resources/ygopro/base` →
card reader → `createDuelV2` → deck load → `startDuel` → bounded advance), then
samples `VmRSS`. Re-run it after upgrading `koishipro-core.js` to refresh the
numbers.
