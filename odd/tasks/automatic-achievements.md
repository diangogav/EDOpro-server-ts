# Automatic achievements

## Objective, problem and why
The only progression today is rating plus admin-assigned tournament trophies
(21 rows, all with ranking points). Players who never enter a tournament
earn nothing. Award gameplay achievements automatically when a ranked match
ends, for recognition only. Slice 2 of Vikunja #32; cosmetic rewards and
missions come later.

## Decisions (owner, 2026-10-09)
- Gameplay achievements grant NO ranking points: `earned_points = 0`, so the
  existing SUM-based points queries stay untouched.
- Ranked matches only: unranked matches do not persist the user.
- Initial catalog (stable `code`, fixed ids 1001+, icon as emoji):
  `first_win` 🥇, `wins_10` / `wins_50` / `wins_100` 🏅, `streak_3` /
  `streak_5` / `streak_10` 🔥, `format_first_win` ⚔️ (one row per ladder,
  awarded with `labels = [ladderName]`), `matches_100` 💯.
- The game server owns the migration and the awarding (plugin on
  `GAME_OVER`), the API only reads. The client distinguishes gameplay rows
  by non-null `code`.
- Idempotent awards: there is NO unique index on `user_achievements`. The
  awarder reads the ids the player already holds (any season) and skips them,
  so gameplay achievements are awarded at most once per player, ever.
  `format_first_win` is one achievement row per ladder. Reason (owner,
  2026-10-09): a tournament trophy can legitimately be awarded to the same
  user more than once (the same recurring tournament won twice), so a unique
  index over (user, achievement, season) would be wrong for trophy rows.
- Counts and streaks are computed from the `matches` table excluding the
  current `matchId` plus the current event outcome, so the plugin never
  depends on `basic-stats` having written its row first.

## Constraints found in exploration
- Schema lives in the vendored `evolution-types` repo (git checkout under
  `src/evolution-types` in both EDOpro-server-ts and evolution-api). The
  migration is written there, committed on branch `feat/automatic-achievements`
  of that repo, then both checkouts move to that commit. Migrations run from
  EDOpro-server-ts (`pnpm migration:run`), manually in deployment.
- Plugin contract `src/shared/plugin/ServerPlugin.ts`; auto-discovery in
  `src/bootstrap/bootstrapPlugins.ts`; expected names listed in
  `bootstrapPlugins.realPlugins.test.ts`. Model: `src/plugins/basic-stats`.
- `GameOverData`: roomId, matchId, duelIds, bestOf, date, players[] {id
  nullable, team, name, winner, games[], score}, banListHash, banListName,
  ranked. No season: use `config.season`. Resolve the user by username via
  `UserProfilePostgresRepository.findByUsername`, like basic-stats.
- Ladder name: `rankGroupResolver.resolveAlias(banListName)`; skip "N/A".
- `matches` columns: user_id, game_id (= matchId), date, ban_list_name,
  winner, season, anulled, deleted_at. Exclude annulled and deleted rows.
- Tests: Jest + jest-mock-extended, mothers under `@test-support/mothers`
  (GameOverDomainEventMother, PlayerMother, UserProfileMother).
- API read path: `UserStatsPostgresRepository` builds achievements with
  `jsonb_build_object`; `StatsSchemas.ts` and `UserAchievement.ts` define the
  shape. Both need `code`.

## TDD
Strict TDD on. EDOpro-server-ts: `pnpm test` (jest), `pnpm lint` (biome),
`pnpm build`. evolution-api: `bun test`, `bun run lint`, `bun run build`.
evolution-card-game: `npm test`, `npm run lint`, `npm run build`.

## Delivery
Four PRs, one per repo plus types: (1) evolution-types migration + entities,
(2) EDOpro-server-ts plugin, (3) evolution-api exposes `code`, (4) client
shows gameplay achievements without "0 pts". Pushes to evolution-types need
explicit authorization.

## Tasks
- [x] T1 evolution-types: migration `AddAchievementCodeAndCatalog` adding
  `achievements.code varchar(64) null unique`, and the seed rows
  of the catalog with `earned_points = 0`; entity updates. Route: delegated
  with T2.
- [x] T2 EDOpro-server-ts plugin `src/plugins/achievements`: pure domain
  evaluator (history summary + current result -> codes to award), ports
  (achievement catalog by code, award with conflict-ignore, match history
  reader), `AchievementAwarder` subscribed to `GAME_OVER`, config gate on
  `ranking.enabled`, tests, realPlugins list. Route: delegated.
- [ ] T3 evolution-api: `code` in both jsonb builders, `StatsSchemas`,
  `UserAchievement` domain and tests; move the types checkout to the new
  commit. Route: delegated.
- [ ] T4 evolution-card-game: `UserAchievement.code: string | null`; the
  showcase hides the points line when `earnedPoints` is 0 and the note only
  when at least one trophy carries points. Route: delegated.
- [x] T5 EDOpro-server-ts script `backfill-achievements` replaying `matches`
  history per user to award retroactively (idempotent). Route: delegated.
  Started 2026-10-12 on branch `feat/backfill-achievements`. Design: pure
  `replayAchievements(matches, laddersFor)` folds a user's ranked matches in
  chronological order through `evaluateAchievements`, so lifetime streaks are
  detected the way the live awarder would have; each code keeps the season of
  the match that first reached it. The script loads rows per user, reuses the
  catalog and user-achievement repositories (held-check + per-user lock) and
  runs dry by default and writes only with `--apply`. Streak needs the full ordered history, so the reader
  gets a new `historyFor(userId)` rather than reusing `summaryFor`.
- [ ] T6 Unlock feedback (owner request, 2026-10-11). Today the awarder only
  inserts the row and logs; the player sees the trophy on the next visit to
  /perfil or /logros. Step 1: the awarder publishes an `AchievementUnlocked`
  domain event on the EventBus after a successful award (base for the duel
  message and the social layer). Step 2, pick later: web-only toast after a
  ranked match (reload the record and diff), or a new duel/matchmaking message
  that reaches EDOPro/MDPro3 too (needs the client team). After the merges.
  Route: delegated.
  Step 1 started 2026-10-12 on `feat/achievement-unlocked-event`: the awarder
  receives the EventBus and publishes `ACHIEVEMENT_UNLOCKED`
  (`AchievementUnlockedDomainEvent`: userId, username, achievementId, code,
  season, labels, matchId, roomId) once per inserted row, after the award
  transaction commits, so a rolled-back award never announces itself.
  Done in eebc6cd5: strict TDD observed (RED on publish assertions, then
  GREEN); `pnpm test` 228 suites / 2157 tests, `pnpm lint` clean, `pnpm
  build` clean. The backfill script does not publish (it never goes through
  the awarder). Step 2 (client notice) still open.
  Step 2 decision (owner, 2026-10-12): phase A announces unlocks through the
  match lifecycle hooks, the same path the rating announcer uses. Pushing on
  `GAME_OVER` is too late (sockets already closing) and matchmaking has no
  per-user channel. Started on `feat/achievement-announce` (stacked on
  `feat/achievement-unlocked-event`, PR #408): the awarder becomes a
  `MatchLifecycleHook` (`onMatchEnding`, 1500 ms shared budget); it awards,
  publishes `ACHIEVEMENT_UNLOCKED` and `ctx.announce()`s one system chat
  line per unlock before `DUEL_END`. The `GAME_OVER` bus subscription is
  dropped: every end path (dueling, abandon, edopro) runs the hooks. Phase B
  (own opcode + web card) stays open.
  Phase A done in 7e7d964d: strict TDD observed (RED on the hook shape and
  on `lifecycleHooks`, then GREEN); `pnpm test` 228 suites / 2164 tests,
  `pnpm lint` clean, `pnpm build` clean. Native review (reliability lens)
  approved and acknowledged, lineage review-dd72b88ee483538f; advisory only.
  `CatalogAchievement` now carries `name` for the announcement text.

- [x] T7 EDOpro-server-ts, phase B wire format (started 2026-10-12 on
  `feat/achievement-unlock-frame`): `MatchContext.notify(userId, frame)`
  built by `createRoomNotify(room)` next to `RoomAnnounce.ts` and wired at
  the same sites (`edopro/room/domain/RoomState.ts`,
  `edopro/room/application/FinishDuelHandler.ts`, `EndMatchByAbandon`);
  `AchievementUnlockedClientMessage` encodes STOC `0xf1` as
  `[size u16 LE][0xf1][achievementId u16 LE][code utf8]` (0xf1 is unused by
  server and web; 0xf5 appears inside a 0xf3 payload in DeckError, so it was
  not taken). The awarder sends one frame per inserted row to the unlocking
  player only; the room-wide chat line stays. Route: delegated writer.
  Done in 3bdab709: strict TDD observed (RED TS2307 on RoomNotify and the
  encoder, TS2353 on `notify`; then GREEN); `pnpm test` 230 suites / 2173
  tests, `pnpm lint` and `pnpm build` clean. `YGOProDuelingState` also builds
  a MatchContext and got `notify`. Native review (reliability lens) approved
  and acknowledged, lineage review-34895c6acb2d8d43. Advisory, non-blocking:
  `createRoomNotify` loops with forEach, so a throwing send on one connection
  skips later connections of the same user; player ids in MatchContext come
  from `client.id`, the same domain `notify` matches on.
- [x] T8 evolution-card-game, phase B card: decoder
  `src/protocol/achievements/achievement-protocol.ts`, early branch in
  `ProtocolService._routeFrame` before the vendor path emitting
  `protocol:achievement-unlocked` ({achievementId, code}); store
  `achievementUnlockStore` reset where `ratingAnnouncementStore.reset()` runs
  in `DuelOverlay.svelte`; card in `WinScreen.svelte` beside `win-rating`
  reusing `atlasLabels.nodeName` and the catalog store for icon/name. Route:
  delegated writer.
  Done in ab3380d2 on `feat/achievement-unlock-card`: strict TDD observed
  (RED on missing modules and 4 failing WinScreen assertions, then GREEN);
  `npm run test` 688 files / 7303 tests, lint and svelte-check with only
  pre-existing warnings, build clean. `push` ignores a repeated
  achievementId; WinScreen loads the catalog on demand and falls back to the
  raw code. Native review (reliability lens) approved and acknowledged,
  lineage review-c961d0341cba9059. Advisory: the store resets only on leave;
  frames arrive only at match end, so no stale cross-game state is possible
  today. Overlay glue (event to store) is untested; loadCatalog rejections are
  unobserved but degrade to the fallback.

## Progress and evidence
- T1 (evolution-types d267f98): migration `1788900000000-AddAchievementCodeAndCatalog`
  and `AchievementEntity.code`; `pnpm build` and `pnpm lint` in EDOpro-server-ts
  pass. No automated test for the migration; not run against a database.
  Ladders seeded: TCG, OCG, Edison (rank groups), JTP, Genesys (ban lists).
- T2 (EDOpro-server-ts d1b28d58, includes the types pointer and the
  `.gitignore` allowlist entry for `src/plugins/achievements/`): RED
  `evaluateAchievements.test.ts` failed to compile (module missing), GREEN 15
  tests; awarder and plugin tests RED on missing modules, GREEN 26 then 67
  with bootstrap. `pnpm lint`, `pnpm build` clean; `pnpm test` 223 suites,
  2119 tests passed.
- Idempotency change: 4f00f4fe adds `heldAchievementIds` so a gameplay
  achievement is never re-awarded in a later season; evolution-types 3a2d015
  removes the unique index on `user_achievements` from the migration;
  EDOpro-server-ts d1b399d5 makes `award()` a plain INSERT and moves the types
  pointer. `pnpm lint`, `pnpm build` clean; `pnpm test` 223 suites, 2121 tests.
- Open points: ladder wins fold history through
  the current group config, so an old list that is no longer current for an
  `onlyCurrent` group (TCG, OCG) does not count toward that ladder; the SQL
  readers were not exercised against a database.
- Awarder hardening (14ba8e4b): the evaluator returns every code the player
  qualifies for (reached or exceeded), so a lost award is recovered by the next
  match; the held check and inserts run in one transaction under a per-player
  `pg_advisory_xact_lock`; the streak is walked in TypeScript over the latest
  200 outcomes (`date, created_at, id` descending). `pnpm lint`, `pnpm build`
  clean; `pnpm test` 225 suites, 2131 tests.

## Native review, server (2026-10-09)
Range f3523caf..d99d2918 assessed `medium`; consent granted; single-lens
review approved and acknowledged (lineage review-f9cbc6fe6b60c3ce). Its three
warnings were fixed in 14ba8e4b (reached-or-exceeded evaluator, per-player
advisory lock, streak computed in code). Range d99d2918..b71bd6dd assessed
`medium`, `under_budget`: no review due, pending in the slice.
Schema PR: https://github.com/diangogav/evolution-types/pull/16

## Performance check (2026-10-09)
Dev DB: `matches` 182k rows, only PK and `game_id` indexes; each history
query was a ~29 ms parallel seq scan, ~90 ms per player per match. Fixed in
evolution-types (same PR #16) with two separate migrations: an index on
`user_achievements (user_id)` inside the catalog migration, and a standalone
non-transactional `AddMatchesUserHistoryIndex` creating the partial index
`matches (user_id, date DESC)` concurrently. Types head fe71664; server
pointer f226497c (assessed medium, under budget).

## Backfill (2026-10-12)
Commit f1550c9b on `feat/backfill-achievements`: `pnpm backfill:achievements`
(dry run) / `--apply`. Strict TDD observed (RED on missing modules, then
GREEN); `pnpm test` 228 suites / 2150 tests, `pnpm lint` clean, `pnpm build`
clean. Native review (reliability lens) approved and acknowledged, lineage
review-c3bd8d7a5d9f3284. Advisory, non-blocking: the script resolves group
ladders with no loaded ban lists, so every dated list of an `onlyCurrent`
group counts as current; for lifetime `format_first_win` that is the intended
historical reading, not a defect. `postgres.close()` is skipped on error.
Not yet run against a database; first run should be the dry run on dev.
