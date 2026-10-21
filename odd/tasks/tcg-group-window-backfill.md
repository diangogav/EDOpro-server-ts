# TCG group window backfill

Objective: re-credit the `TCG` group ladder for ranked games played on a lagging server's newest TCG list while the servers disagreed, recomputing TCG Elo in order from the window start.
Branch: `feat/tcg-group-window-backfill` (from main 020bc4ea). Delivery: single PR. Test runner: `npx jest`.

## Specs

- S1. The user chose option 2: "yo iria por la 2" — recompute the TCG group Elo from the window start, replaying every TCG game in the window in chronological order (existing ones and the missing ones), instead of applying the missing games on top of the current ratings.
- S2. Games to credit: ranked `matches` rows of the given banlist name (`2026.09 TCG`), not annulled, not deleted, created at or after the window start, that have no `points_ledger` row for the TCG group rank. For each: one `points_ledger` row per player (kind `applied`, cycle 0, points_delta = `matches.points`, wins/losses 1/0) and the matching `player_stats` increment, only when the ledger insert actually inserted.
- S3. Elo: the window's existing TCG `rating_history` rows (kind `applied`, cycle 0) are rewritten in place with recomputed `previous_rating`, `delta`, `k_factor`, `opponent_rating`; missing games get new rows only when the game was Elo-eligible live (it has a `rating_history` row for its banlist rank); `player_ratings` ends at the replayed values (rating, games_played, peak). Same formula as live (`EloCalculator`, `Rating.effectiveDelta`/`applyDelta`).
- S4. Achievements: winners of credited games that do not hold `format_first_win:TCG` receive it (labels `["TCG"]`, the games' season).
- S5. Default is a dry-run that writes nothing and produces a report; `--apply` writes. Before writing, the script exports every row it will update. Apply runs in one transaction that blocks live Elo writes while it recomputes.
- S6. Safety checks abort before writing: non-`applied` TCG history rows inside the window, a game that is not exactly two distinct players with one winner, mixed seasons, or a credited game that already has TCG history. Assumption: TCG ranked games are 1v1.
- S7. Self-check: replaying only the existing window games from the computed baselines must reproduce the stored history exactly; the dry-run reports any mismatch and apply refuses to run if there is one.

## Tasks

- T1 [S1,S3,S6,S7] pure replay planner + baseline computation with tests — inline — done (17 tests GREEN after RED on missing module)
- T2 [S2-S5] script `backfill:group-window` (src/scripts/backfill-group-window.ts; dry-run, export, apply) — inline — done (tsc clean; run from dist, ts-node is not installed)
- T3 [S5,S7] dry-run against production, report to the user — inline — done (L3)
- T4 [S5] apply after user approval — done (L8-L9)

## Log

- L1 User: "si, arranca el script" then "yo iria por la 2, ya estoy reiniciando el server para aplicar el cambio". PR #425 (per-server currency) merged as 020bc4ea.
- L2 Evidence: TCG group writes per game = points_ledger + player_stats (basic-stats), rating_history + player_ratings (elo-rating), user_achievements (format_first_win:TCG, 0 points). Tiers are derived in evolution-api from those tables.
- L3 Production dry-run (read-only transaction): self-check reproduced every stored history row and rating; the planned changes matched the case the user reported.
- L4 Next: apply only after the server restart with #425 is confirmed; the script is re-runnable, so games played before the restart are picked up as missing and later ones as stored.
- L5 User confirmed production runs with #425 ("si").
- L6 Independent verifier: S1-S7 pass, no blockers (probes with up to 40k simulated games reproduce live crediting exactly). Advisories fixed: history UPDATE must touch exactly one row; achievement award takes the live per-user lock and re-checks; usage comment runs from dist. Kept as advisories: games_played self-check is tautological; a 1v1 game with one accountless player aborts the run (fail closed); unknown flags ignored; no AchievementUnlocked event for a 0-point award. Dry-run rerun after the fixes: same numbers, 0 mismatches.
- L7 RDD review (risk, resilience, reliability) granted by the user, approved and acknowledged on a6eaeec8. T4 waits for the user's explicit go for the production --apply.
- L8 User approved the production apply ("si"). Applied in one transaction. The player_ratings lock was held for about a minute because every row is written with its own query.
- L9 Post-apply dry-run showed self-check mismatches: inserted rows had created_at = apply time, so baselines ordered by created_at were wrong, while the Elo chain ordered by game time was consistent. User approved ("Si") setting those rows' created_at to the live banlist-rank row's created_at (export taken first). Afterwards the dry-run found nothing missing, nothing to change and no mismatch. The script now inserts history rows with that live timestamp.
