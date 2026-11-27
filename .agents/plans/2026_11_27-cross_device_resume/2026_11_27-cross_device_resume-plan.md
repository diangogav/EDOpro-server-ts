---
name: "cross_device_resume"
description: "Let a verified player resume a duel in progress from another device of the same account, after confirming it there; the old device is told the duel moved"
created_at: "2026-11-27T21:45:00Z"

created_by:
  tool: "Claude Code"
  model:
    name: "Claude Opus"
    version: "5.5"
    reasoning_effort: "low"

implemented_by:
  tool: "Claude Code"
  model:
    name: "Claude Opus"
    version: "5.5"
    reasoning_effort: "low"

last_implementation_at: "2026-11-27T23:30:00Z"
has_completed_all_phases: "false"
---

# Cross-device duel resume

## 🎯 Goal

A player in a duel opens the evolution client on another device of the same account, confirms "Resume here", and takes over the seat. The device that held the seat is disconnected with a clear message. Today a seat can only be taken back with the reconnect token stored on the original device.

## 👀 Context

Spans two repositories: each phase ships one PR in `EDOpro-server-ts` and one in `evolution-card-game`. The server PR of a phase must be deployed before its client PR.

- Decisions already taken:
  - The new device asks first ("Resume here?"); it never takes the seat on its own. Opening the app on a phone must not end the duel on the PC, and asking avoids two devices taking the seat from each other.
  - Only seats with a `verified` credential (evolution client, handshake ticket) can be resumed by account. Seats with a PIN (`external`) or a guest seat keep today's paths. A duel started on an EDOPro desktop client cannot continue in the evolution client.
  - The check for an active duel lives in the duel server, because only it knows the rooms. It answers only whether there is a duel, never the token.
  - The deck, the match score and the room kind come from the server when resuming, so the new device needs no local data and does not depend on cloud deck sync.
- Read first: [`CLAUDE.md`](../../../CLAUDE.md), [`docs/room-reentry.md`](../../../docs/room-reentry.md) (§2 identity, §3 token reconnection), [`docs/multi-client.md`](../../../docs/multi-client.md), [`src/edopro/AGENTS.md`](../../../src/edopro/AGENTS.md), [`src/ygopro/AGENTS.md`](../../../src/ygopro/AGENTS.md), [`docs/presence.md`](../../../docs/presence.md).
- Identity:
  - The client sends a ticket from `evolution-api` (`POST /game-tickets`, 30 s, single use) as `?ticket=` in the WebSocket URL.
  - [`src/socket-server/WSYGOProServer.ts`](../../../src/socket-server/WSYGOProServer.ts) sets `resolvedUserId` before any frame is handled.
  - [`src/ygopro/room/admission/application/CredentialResolver.ts`](../../../src/ygopro/room/admission/application/CredentialResolver.ts) turns it into a `verified` credential, and a PIN into `external`.
- Token reconnection:
  - [`ReconnectionTokenIssuer.ts`](../../../src/shared/room/domain/reconnect/ReconnectionTokenIssuer.ts): one fixed token per match, kept in the in-memory [`TokenIndex.ts`](../../../src/shared/room/domain/TokenIndex.ts).
  - [`ExpressReconnectHandler.ts`](../../../src/shared/room/application/reconnect/ExpressReconnectHandler.ts) handles the `0xfd` frame and checks the account of a verified seat, then emits `EXPRESS_RECONNECT` to the room. Each room state finds the player again by the token in the message, so a resume can rotate the token and reuse the same event.
  - The handler is wired per connection in `YGOProConnectionHandler.ts` and `SocketConnectionHandler.ts`.
- Takeover of the socket:
  - `YGOProRoom.reconnect` ([`YGOProRoom.ts`](../../../src/ygopro/room/domain/YGOProRoom.ts)) closes an open old socket with `closeSuperseded()`, which is WebSocket close code 4001.
  - The EDOPro [`Client.setSocket`](../../../src/edopro/client/domain/Client.ts) calls `destroy()` instead (close code 1006). The old device then reconnects with its token.
- Finding a seat: rooms live in the in-memory lists [`YGOProRoomList.ts`](../../../src/ygopro/room/infrastructure/YGOProRoomList.ts) and [`RoomList.ts`](../../../src/edopro/room/infrastructure/RoomList.ts). [`bootstrapPresence.ts`](../../../src/bootstrap/bootstrapPresence.ts) already scans both for `player.id === userId`. One server process; a restart loses every seat.
- Data a resuming device needs: `YgoRoom.matchScore()` (score), `YGOProRoom.banListName` (the client picks the card database with `cardDbKeyFor`), whether the room runs the EDOPro core, and the seat's deck (`YgoClient.deck`) for side decking.
- HTTP precedent: [`EnqueueMatchmakingController.ts`](../../../src/http-server/controllers/EnqueueMatchmakingController.ts) consumes a ticket from the body and answers 401 for an invalid one. Routes: [`src/http-server/routes/index.ts`](../../../src/http-server/routes/index.ts).
- Client (`evolution-card-game`):
  - `src/features/duel/state/reconnectStore.ts`: token, deck, cardDbKey, phase, matchScore, edoproRoom.
  - `src/features/duel/application/reconnectRehydrator.ts` and `src/shell/App.svelte` (boot resume).
  - `src/features/lobby/application/LobbyManager.ts` (socket with ticket).
  - `src/features/duel/infrastructure/ProtocolService.ts` (sends `0xfd` on connect).
  - `SocketService.ts` and `connectionStore.svelte.ts` (4001).
  - `DuelOverlay.svelte` (restores the session data).
- Out of scope: PIN and guest seats, rooms with `noReconnect` (AI, WindBot), the waiting room (no token yet), and spectators.

## 🪜 Phases

### Phase 1: Resume a YGOPro duel in progress from another device

**Description:** The common case: ranked, casual, challenges and tournament duels in YGOPro rooms. The new device asks, takes the seat, and draws the duel with the right card database and score; the old device shows that the duel moved.

**Public contracts**

- Server domain:
  - `findSeatOfUser(rooms, userId, owns?): { client: YgoClient; room: YgoRoom } | null` in `src/shared/room/domain/reconnect/findSeatOfUser.ts`. It looks at rooms that are not waiting, only at players (never spectators) whose credential is `verified` with that user id and who hold a reconnection token (so rooms without reconnection never match). It finds the seat whether the old socket is open or not.
  - `ReconnectionTokenIssuer.rotate(client, roomId): string`: revokes the current token and issues a new one, so the old device's token stops working.
- Server messages:
  - CTOS `RESUME_SEAT = 0xeb` in `Commands.ts`, with no payload. The socket's identity comes from its handshake ticket.
  - STOC `RESUME_INFO = 0xea`, JSON payload `{ banListName: string | null, score: { own: number; opponent: number }, edoproRoom: boolean }`. It is sent only to a socket that resumed by account, before the room's re-sync.
- Server connection layer: `ygoproReconnectRoute` gains `seatOf(userId)` (both room lists, filtered by `owns`) and `resumeInfoOf(seat)`. It implements the `AccountResumeRoute` port.
- Server application: `AccountResumeHandler` (per connection, next to `ExpressReconnectHandler`, wired in `YGOProConnectionHandler.ts`):
  - With `resolvedUserId` and a seat: rotate the token, send `RESUME_INFO`, then emit `EXPRESS_RECONNECT` to the room with the new token.
  - With no identity or no seat: send `ReconnectionAckMessage.failure()` and close the socket.
  - It logs `reconnect.attempt` with `path: "account"` (new outcome `no_seat`).
- Server HTTP: `POST /api/me/active-duel`, body `{ ticket }`:
  - 200 `{ inDuel: boolean }`.
  - 401 for a ticket that is missing, invalid or already used.
  - Controller `ActiveDuelController(tickets, holdsSeat)`; it consumes the ticket like `EnqueueMatchmakingController`, behind its own rate-limit bucket (`ActiveDuelRateLimitMiddleware`). The route checks both room lists without the `owns` filter: a verified seat in an EDOPro room can only come from the YGOPro server's bridge.
- Client:
  - `IActiveDuelApi.check(ticket): Promise<boolean>` with `HttpActiveDuelApi` (duel server base URL `ROOMS_URL_DEFAULT`).
  - `AccountResumeStore` (`accountResumeStore.svelte.ts`): `checkFor(userId)` asks once per account per app run; `offered`, `accept()`, `dismiss()`. `App.svelte` calls it once assets are ready, for a signed-in user, when the overlay is closed and there is no local reconnect session; it also runs after a later sign-in.
  - `DuelResumePrompt.svelte` with "Resume" and "Not now".
  - "Resume" runs `duelOverlayStore.startAccountResume(wsUrl)`: `reconnectStore.requestAccountResume()` sets an in-memory flag, read through `LobbySessionPort.resumingByAccount()` and the new protocol config `shouldResumeSeat`. `ProtocolService` sends `RESUME_SEAT` on connect when it has no token and the flag is set. The flag ends when the server hands a token (`saveSession`) or on `clear()`.
  - `RESUME_INFO` emits `protocol:resume-info`; the overlay sets the card database (`cdbVariantForFormat(banListName)`) and the match score.
  - The device that lost the seat already shows the existing superseded copy on close code 4001 ("This match was opened somewhere else"), so no new copy was added.
- UI copies (es / en):
  - `duel_resume_prompt`: "Tienes un duelo en curso. ¿Retomarlo aquí?" / "You have a duel in progress. Resume it here?"
  - `duel_resume_accept`: "Retomar" / "Resume"
  - `duel_resume_decline`: "Ahora no" / "Not now"
- Test suites:
  - Server `findSeatOfUser`:
    - finds a verified seat in a YGOPro room and in an EDOPro room
    - finds it while the old socket is open
    - ignores waiting rooms
    - ignores PIN (`external`) and guest seats of the same user id
    - ignores spectators
    - answers null for an account with no seat
  - Server `ReconnectionTokenIssuer.rotate`: the new token resolves, the old one does not.
  - Server `AccountResumeHandler`:
    - takes over the seat, sends `RESUME_INFO` before the re-sync, and closes the old socket with 4001
    - the old token fails afterwards
    - a socket without identity gets the failure ack
    - an account without a seat gets the failure ack
  - Server `ActiveDuelController`: 200 with and without a duel, 401 for an invalid or reused ticket, 400 without a ticket.
  - Server `ygoproReconnectRoute.resumeInfoOf`: the score from the resuming player's side, the ban list, and an EDOPro room marked.
  - Client:
    - `AccountResumeStore`: offers when in a duel, asks once per account, offers nothing without a ticket or on failure, accept and dismiss
    - `DuelResumePrompt`: hidden, resume, dismiss
    - `ProtocolService`: `0xeb` on connect without a token, the token wins over the flag, `0xea` emits `protocol:resume-info`
    - `resume-seat-protocol`: frame build and parse, malformed frames
    - `reconnectStore`: the account-resume flag
    - `HttpActiveDuelApi`: request, reading, refused call

**To-do actions**

- [x] Server: add `findSeatOfUser` and `ReconnectionTokenIssuer.rotate`, with tests.
- [x] Server: add `RESUME_SEAT`, `RESUME_INFO` and `AccountResumeHandler`, wire them in `YGOProConnectionHandler.ts`, with tests.
- [x] Server: add `ActiveDuelController` and its route, with tests.
- [x] Server: document the account path in `docs/room-reentry.md` and the endpoint where the HTTP routes are documented.
- [x] Client: add the active duel check, the dialog, the `RESUME_SEAT` frame and the handling of `RESUME_INFO`, with both locales and tests.
- [x] Client: show the 4001 message on the device that lost the seat.
- [x] Verify the changes in terms of typechecking, linting and tests using the project's verification command (look it up in the AGENTS.md file or the project configuration). Fix issues if any.
  - Server: `pnpm lint`, `pnpm test`, `pnpm build`. In a worktree, install its own dependencies; do not symlink `node_modules`.
  - Client: `npm run lint`, the three custom lint rules, `npm run typecheck`, `npm run check:svelte`, `npm test`, `npm run build`, `npm run check:bundle`. Run the build after the tests, not at the same time.
- [x] STOP. Present the changes to the user for review and suggest commit messages (or pull request titles, when the phases are implemented through pull requests). Do NOT proceed to the next phase until the user explicitly asks.

### Phase 2: EDOPro rooms

**Description:** The same resume works for an evolution client seated in an EDOPro room (`edo,<roomId>` and `speed`), and an EDOPro takeover tells the old device with 4001 so the two devices do not take the seat from each other.

**Public contracts**

- Server: `Client.setSocket` (EDOPro) closes an open old socket with `closeSuperseded()` instead of `destroy()`.
- Server: `RESUME_INFO` for an EDOPro room carries `edoproRoom: true` and the room's ban list name.
- Client: `RESUME_INFO.edoproRoom` selects the EDOPro wire handling for the resumed duel.
- Test suites:
  - Server: an EDOPro takeover closes the old socket with 4001.
  - Server: resuming a bridged `edo,` room and a `speed` room by account.
  - Client: a resume with `edoproRoom: true` uses the EDOPro handling.

**To-do actions**

- [ ] Server: change `Client.setSocket` and extend `RESUME_INFO` for EDOPro rooms, with tests.
- [ ] Client: apply `edoproRoom` from `RESUME_INFO`, with tests.
- [ ] Verify the changes in terms of typechecking, linting and tests using the project's verification command (look it up in the AGENTS.md file or the project configuration). Fix issues if any.
- [ ] STOP. Present the changes to the user for review and suggest commit messages (or pull request titles, when the phases are implemented through pull requests). Do NOT proceed to the next phase until the user explicitly asks.

### Phase 3: Resume between duels (side decking)

**Description:** A player who resumes during side decking gets the side deck editor with the deck of the seat, which is the deck of this match, even when the new device never had it.

**Public contracts**

- Server: `RESUME_INFO` gains `deck: { main: number[]; extra: number[]; side: number[] } | null`. It is taken from the seat when the room is side decking, and null otherwise.
- Client: the side deck editor opens with `RESUME_INFO.deck` when there is no local deck.
- Test suites:
  - Server: `RESUME_INFO` carries the seat's deck during side decking and null during a duel.
  - Client: resuming during side decking opens the editor with the deck from the server, and the deck it sends back passes the server's side check.

**To-do actions**

- [ ] Server: add the seat's deck to `RESUME_INFO` during side decking, with tests.
- [ ] Client: open the side deck editor from `RESUME_INFO.deck`, with tests.
- [ ] Verify the changes in terms of typechecking, linting and tests using the project's verification command (look it up in the AGENTS.md file or the project configuration). Fix issues if any.
- [ ] STOP. Present the changes to the user for review and suggest commit messages (or pull request titles, when the phases are implemented through pull requests). Do NOT proceed to the next phase until the user explicitly asks.

## ⏭️ Next step

Implement Phase 2: EDOPro rooms (4001 on takeover, `edoproRoom` in the resume info).

One duel, any device, the seat handed over by [Codely](https://codely.com) 🤝 🐢 💨
