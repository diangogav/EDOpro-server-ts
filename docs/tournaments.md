# Community tournament API

The organizer API keeps single-elimination brackets for ordinary authenticated
players. A character is optional display metadata. It supports 2–64 entrants,
TCG/JTP/Edison labels and best-of-1, best-of-3 or best-of-5 results.

This API records **organizer-reported results**. It does not create duel rooms,
subscribe to `GAME_OVER`, verify a replay, award ranked points or change either
duel protocol. Existing LAN/Evolution room invitations remain separate. Clients
must show the `source: "organizer"` provenance and obtain confirmation from their
organizer; a submitted score is never represented as a server-observed outcome.

## Enable and retain storage

Set `TOURNAMENT_DATABASE_PATH` to an **absolute file path** on a persistent local
volume writable by the server, for example `/var/lib/evolution/tournaments.sqlite`.
Leave it unset to keep the API unavailable (503 after authentication). A relative
path is a configuration error. The operator also needs the existing Redis-backed
Evolution ticket service. No new evolution-api endpoint or PostgreSQL migration
is required.

The TypeORM SQLite store uses its own generated migration, table and migration
history. First use applies that migration with `synchronize: false`; it never
modifies the shared calendar/Lightning tournament tables in evolution-types.
Documents persist through process restarts. There is no in-memory fallback when
storage is unavailable. The same process's concurrent first requests await schema
readiness, and writes compare revisions atomically in SQLite. Independent
connections to the same local file cannot overwrite a newer revision.

Use one persistent local volume for one API deployment. SQLite WAL is not a
cross-host coordination mechanism: do not place it on an unsupported network
filesystem or point separate replicas at separate copies and expect shared
brackets. Back up the database through SQLite's backup facility, or stop writers
and retain its database plus any `-wal`/`-shm` state together. Completed and
cancelled brackets remain as history. The API has no delete or unbounded list
endpoint. Each account can own at most eight active brackets; cancellation or
completion releases an active slot without removing the historical record.

## Authentication and privacy

Every request, including GET, sends `Authorization: Bearer <fresh-ticket>` using
the existing single-use evolution-api ticket. Obtain a **new** ticket for every
request, retry and subsequent duel WebSocket handshake. Do not put tickets in URLs.
HTTP 401 means the ticket is invalid, expired or consumed. Storage failures never
grant authorization.

Share the tournament UUID as the invitation. Any authenticated holder can read
that bracket and join while registration is open. There is no public directory.
Discovery is deliberately invitation-only: clients must retain joined/owned
tournament UUIDs locally; this version has no endpoint to recover a forgotten
invitation ID. Public responses contain random entrant IDs and public profile names, never
account IDs, tickets or the organizer's private audit identity. `isOrganizer` and
`myEntrantId` describe the requesting account only. The server derives identities
from tickets; bodies that try to supply `userId`, `organizerId`, a display name or
an unrecognized property are rejected. If a profile name is unavailable, the
public fallback is `Duelist`. The organizer need not enter their own event.

## Endpoints

All successful responses have `{ "success": true, "data": <bracket> }`; failures
have `{ "success": false, "error": "..." }`, with a domain `code` when applicable.
Creation returns 201 and other successful operations return 200. Inputs are
strict JSON objects. Every mutation after creation includes the latest integer
`revision` returned by GET or a successful mutation.

| Method and path | Body | Who may call |
| --- | --- | --- |
| `POST /api/tournaments` | `{ "name": "Community cup", "format": "tcg", "bestOf": 3, "capacity": 16 }` | Authenticated account becomes organizer |
| `GET /api/tournaments/:id` | None | Authenticated invitation holder |
| `POST /api/tournaments/:id/join` | `{ "revision": 0, "characterId": null }` | Account joins itself; character may be omitted |
| `POST /api/tournaments/:id/start` | `{ "revision": 2 }` | Organizer, with at least two entrants |
| `POST /api/tournaments/:id/matches/:matchId/result` | `{ "revision": 3, "winsA": 2, "winsB": 1 }` | Organizer, ready match only |
| `POST /api/tournaments/:id/cancel` | `{ "revision": 3, "reason": "Rescheduled" }` | Organizer, before completion; reason optional |

Names contain 1–100 characters; cancellation reasons contain at most 500.
`characterId` is null or an integer from 0 through 100000. It is opaque cosmetic
metadata and is never used for authentication, seeding or scoring.

Start freezes the roster. Join order determines seeding; the standard mirrored
seed placement gives deterministic byes to the earliest seeds when the entrant
count is not a power of two. Future matches become ready only when both feeding
matches have finished. A bye does not create a fabricated game result.

`winsA` and `winsB` refer to the current match's `entrantA` and `entrantB`. Exactly
one must equal the wins needed to take the match (1, 2 or 3); the other must be
lower. Negative, fractional, tied, incomplete and excessive scores are rejected.
Drawn duels do not count as wins. A recorded result cannot be replaced. Its stored
audit retains the reporting organizer account and UTC time; the public projection
exposes the source, role, timestamp and scores. Completing the final marks the
bracket completed and records its winner.

An exact retry of a committed score is idempotent even with its original stale
revision. The same applies to joining an account already in the roster and
repeating start/cancel. A duplicate join never changes the entrant's original
profile or character. Other stale mutations return 409; GET the bracket again
with a fresh ticket before retrying. A changed result on a completed match also
returns 409. Non-organizers get 403, nonexistent tournaments/matches 404, invalid
payloads 400, and unavailable durable storage 503. The existing configurable
Redis limiter uses separate read/write buckets (120/20 requests per IP/minute).

## Client integration boundary

No current MDPro4 build calls these endpoints. Deploying this server branch alone
does not synchronize existing local tournament saves. A client integration should
use fresh tickets, the returned revisions and entrant IDs, explicitly identify
manual results, and keep room invitations separate until reserved-room creation
and an authoritative result plugin are implemented and accepted. Character-free
local/LAN/Evolution tournaments remain valid independently of this API.

## Verification and future schema changes

Co-located tests cover non-power-of-two brackets, BO1/3/5 scoring, organizer
permissions, duplicate-result retries, a frozen roster, real HTTP ticket replay
and private views, generated migration application, database reopening, active
quotas and concurrent revision writes from separate connections. Run `pnpm lint`,
`pnpm test --runInBand`, and the project's TypeScript check before release.

The initial migration was generated with TypeORM from `TournamentRowSchema`
against an empty disposable SQLite database. For subsequent schema changes,
generate a new migration through `src/tournament/infrastructure/migration-data-source.ts`
with `TOURNAMENT_DATABASE_PATH` pointing to a disposable current-schema database,
inspect the generated SQL, and register the new class in `data-source.ts`.
Never regenerate or edit a migration already applied in production.
