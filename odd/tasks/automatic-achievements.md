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
- [ ] T5 EDOpro-server-ts script `backfill-achievements` replaying `matches`
  history per user to award retroactively (idempotent). Route: delegated.

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
