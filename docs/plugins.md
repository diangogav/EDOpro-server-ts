# Server plugins

How to add a plugin to EDOpro-server-ts: the contract, how plugins are discovered at boot, which events they can observe, the isolation rules that protect duels from plugin code, and how to test one.

> **Status:** Active standard. The plugin system is the only supported way to hook into server events — new subscribers must ship as plugins, never as hardwired composition-root code.

## Quick path — writing a new plugin

1. **Create the folder.** `src/plugins/<kebab-name>/index.ts` with a `ServerPlugin` **default export**.
2. **Declare what you observe.** `GAME_OVER` comes from the `bus` given to `register`; duel events require the `duelEvents` declaration.
3. **Gate it with `enabled(config)`.** Return `false` and the plugin never registers — no subscriptions, no side effects.
4. **Test it co-located.** `index.test.ts` next to `index.ts`, starting with `expectServerPluginContract(plugin)`.
5. **Whitelist it in `.gitignore`** if it should be tracked (see [Private plugins](#private-plugins-and-the-gitignore-whitelist)).

## The contract

Every plugin module default-exports a `ServerPlugin` (`src/shared/plugin/ServerPlugin.ts`):

```typescript
import { ServerPlugin } from "@shared/plugin/ServerPlugin";

const plugin: ServerPlugin = {
	name: "my-plugin",                        // unique across plugins
	enabled: (config) => config.ranking.enabled,
	duelEvents: ["duel.damage"],              // optional — omit to observe no duel events
	register: (bus, deps) => {
		// subscribe here; runs once at boot, only when enabled(config) is true
	},
};

export default plugin;
```

| Field | Required | Notes |
|-------|----------|-------|
| `name` | yes | Identifies the plugin in boot reports, warnings and disconnect errors. Duplicate names: only the alphabetically-first folder loads. |
| `enabled(config)` | yes | Pure gate over `AppConfig`. Disabled plugins are reported as `skipped` and never touch anything. |
| `register(bus, deps)` | yes | `bus` is the app `EventBus` (for `GAME_OVER`); `deps` carries `logger`, `config`, and — only if `duelEvents` is declared — `duelEvents.subscribe`. |
| `duelEvents` | no | The duel-event kinds this plugin observes. Subscribing to a kind you did not declare throws, and the loader reports the plugin as `failed`. |

`isServerPlugin()` validates the shape at load time — a module whose default export does not conform is skipped with a warning, including a `duelEvents` array containing unknown kinds.

## Discovery and lifecycle

`bootstrapPlugins()` (`src/bootstrap/bootstrapPlugins.ts`) runs once at boot, after persistence is ready and before any socket can produce events:

- Scans **direct child directories** of `src/plugins/` only — no recursion.
- Skips folders starting with `.` or `_`.
- Loads in **deterministic alphabetical order**.
- One broken plugin never blocks the rest: per-folder failures are caught and reported.
- The boot log prints the report: `🔌 Plugins → loaded: [...] · skipped: [...] · failed: [...]`.

## Private plugins and the gitignore whitelist

`src/plugins/*` is gitignored by default: a private plugin cloned into place stays untracked and still loads at boot. Tracked plugins are explicitly whitelisted:

```gitignore
src/plugins/*
!src/plugins/basic-stats/
!src/plugins/big-damage-log/
!src/plugins/unranked-match/
```

Add a `!src/plugins/<name>/` line when a plugin should live in this repository.

## Events you can observe

### `GAME_OVER` — a match ended

Subscribe through the bus:

```typescript
import { GameOverDomainEvent } from "@shared/room/domain/match/domain/domain-events/GameOverDomainEvent";

bus.subscribe(GameOverDomainEvent.DOMAIN_EVENT, {
	handle: (event: GameOverDomainEvent) => {
		// event.data: roomId, matchId, duelIds, bestOf, players, date,
		//             banListHash, banListName, ranked
	},
});
```

Published once per finished match by both server pipelines. `players` carries each player's per-game history (`result`, `turns`, `ipAddress`). Handler errors are caught by the bus and logged — they never propagate.

### Duel events — facts from inside a running duel

Declare the kinds in `duelEvents`, then subscribe through `deps.duelEvents`:

```typescript
const plugin: ServerPlugin = {
	name: "comeback-tracker",
	enabled: () => true,
	duelEvents: ["duel.damage", "duel.recover"],
	register: (_bus, deps) => {
		deps.duelEvents?.subscribe("duel.damage", (event) => {
			// event: { roomId, duelId, team, amount, turn }
		});
	},
};
```

| Kind | Payload | Meaning |
|------|---------|---------|
| `duel.damage` | `{ roomId, duelId, team, amount, turn }` | A team took battle or effect damage |
| `duel.recover` | `{ roomId, duelId, team, amount, turn }` | A team recovered life points |
| `duel.lp-cost` | `{ roomId, duelId, team, amount, turn }` | A team paid life points as a cost |
| `duel.turn-start` | `{ roomId, duelId, player, turn }` | A new turn began; `turn` is the number of the turn that just started, `player` the core turn player (0/1) |

Payloads are identical regardless of room type — both pipelines decode to the same events, with team resolution handled server-side. Delivery is **observe-only**: a plugin cannot block, delay or mutate anything in the duel.

## Isolation: what happens when a plugin misbehaves

Duel events reach plugins through a bounded, ordered, per-room queue (`DuelEventPluginHub`). Enqueueing is the only work on the duel's path; each plugin's queue drains off it, one event at a time, preserving per-room order. Two detectors feed one consequence — **the plugin is disconnected from that room** with an error naming the plugin and the reason:

| Detector | Threshold | Protects against |
|----------|-----------|------------------|
| Queue overflow | 1000 queued events | A consumer slower than the duel (slow I/O). Data becomes all-or-nothing instead of silently gapped. |
| Handle time budget | 10 ms per `handle()`, warning per violation, disconnect at 3 | A CPU-heavy synchronous handler. Nothing in-process can prevent the block — the budget *attributes* it. |

A disconnect affects one plugin in one room — never the plugin in other rooms, never the room's other plugins. Handler errors (throws/rejections) are logged with the plugin's name and delivery continues; they do not count as violations.

Plugins run in-process with full trust, like any first-party code. The isolation machinery bounds the damage of *slow* or *overwhelmed* consumers; it is not a security sandbox.

## Identity keys

| Key | Scope | Stability | Use for |
|-----|-------|-----------|---------|
| `duelId` | one game | uuid, stable | Keying anything that happens inside a duel. `(duelId, turn)` is unambiguous. |
| `matchId` | one match (best-of-N) | uuid, stable | Linking a match's persistence to its duels; `GAME_OVER.duelIds` lists the match's games in played order. |
| `roomId` | one room | **4-digit random — collides and gets reused** | Log correlation only. Never key storage on it. |

## Testing a plugin

Follow [testing conventions](./testing.md); plugin-specific pieces:

- `expectServerPluginContract(plugin)` (`src/test-support/plugin/expectServerPluginContract.ts`) asserts contract conformance — start every plugin suite with it.
- Build `GAME_OVER` payloads with `GameOverDomainEventMother`.
- Loader behavior fixtures live in `src/test-support/plugin-fixtures/` if you need to test discovery itself.
- `src/bootstrap/bootstrapPlugins.realPlugins.test.ts` runs the loader against the real `src/plugins/` folder — adding an always-enabled plugin changes its expected roster.

## Reference plugins

| Plugin | Observes | Gate | Pattern it demonstrates |
|--------|----------|------|-------------------------|
| `basic-stats` | `GAME_OVER` | `config.ranking.enabled` | Ranked persistence: points, wins/losses, match + duel resumes keyed by real `matchId`/`duelId` |
| `unranked-match` | `GAME_OVER` | `config.ranking.enabled` | Unranked persistence; row ids are the real `matchId`/`duelId`, making duplicate events idempotent |
| `big-damage-log` | `duel.damage` | always on | Minimal duel-event consumer: stateless, log-only, never touches the bus |
