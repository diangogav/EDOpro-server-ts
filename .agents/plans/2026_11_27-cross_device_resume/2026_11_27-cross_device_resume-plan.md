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
  - `findSeatOfUser(rooms, userId): { client: YgoClient; roomId: number } | null` next to `createAccountStatusProbe`. It looks at YGOPro and EDOPro rooms that are not waiting, and only at seats whose credential is `verified` with that user id. It finds the seat even when the old socket is still open.
  - `ReconnectionTokenIssuer.rotate(client, roomId): string`: revokes the current token and issues a new one, so the old device's token stops working.
- Server messages:
  - CTOS `RESUME_SEAT = 0xeb` in `Commands.ts`, with no payload. The socket's identity comes from its handshake ticket.
  - STOC `RESUME_INFO = 0xea`, JSON payload `{ banListName: string | null, score: { own: number; opponent: number }, edoproRoom: boolean }`. It is sent only to a socket that resumed by account, before the room's re-sync.
- Server application: `AccountResumeHandler` (per connection, next to `ExpressReconnectHandler`):
  - With `resolvedUserId` and a seat: rotate the token, send `RESUME_INFO`, then emit `EXPRESS_RECONNECT` to the room with the new token.
  - With no identity or no seat: send `ReconnectionAckMessage.failure()` and close the socket.
  - It logs `reconnect.attempt` with `path: "account"`.
- Server HTTP: `POST /api/me/active-duel`, body `{ ticket }`:
  - 200 `{ inDuel: boolean }`.
  - 401 for a ticket that is missing, invalid or already used.
  - Controller `ActiveDuelController`; it consumes the ticket like `EnqueueMatchmakingController`.
- Client:
  - `IActiveDuelApi.check(ticket): Promise<boolean>` with `HttpActiveDuelApi`.
  - `resumeOffer` check at boot: signed in, no local reconnect session, and the server answers `inDuel`.
  - A dialog with "Resume" and "Not now".
  - "Resume" opens the WebSocket with a fresh ticket and sends `RESUME_SEAT` instead of `0xfd`.
  - `RESUME_INFO` sets the card database (`cardDbKeyFor(banListName)`) and the match score before the re-sync draws the board.
  - On close code 4001, the device that lost the seat shows the new message and does not reconnect.
- UI copies (es / en):
  - `duel_resume_prompt`: "Tienes un duelo en curso. ¿Retomarlo aquí?" / "You have a duel in progress. Resume it here?"
  - `duel_resume_accept`: "Retomar" / "Resume"
  - `duel_resume_decline`: "Ahora no" / "Not now"
  - `duel_moved_to_other_device`: "Tu duelo continúa en otro dispositivo." / "Your duel continued on another device."
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
  - Server `ActiveDuelController`: 200 with and without a duel, 401 for an invalid or reused ticket.
  - Client:
    - the boot check runs only when signed in without a local session
    - the dialog resumes or dismisses
    - the resume flow sends `RESUME_SEAT` and applies `RESUME_INFO`
    - the 4001 message

**To-do actions**

- [ ] Server: add `findSeatOfUser` and `ReconnectionTokenIssuer.rotate`, with tests.
- [ ] Server: add `RESUME_SEAT`, `RESUME_INFO` and `AccountResumeHandler`, wire them in `YGOProConnectionHandler.ts`, with tests.
- [ ] Server: add `ActiveDuelController` and its route, with tests.
- [ ] Server: document the account path in `docs/room-reentry.md` and the endpoint where the HTTP routes are documented.
- [ ] Client: add the active duel check, the dialog, the `RESUME_SEAT` frame and the handling of `RESUME_INFO`, with both locales and tests.
- [ ] Client: show the 4001 message on the device that lost the seat.
- [ ] Verify the changes in terms of typechecking, linting and tests using the project's verification command (look it up in the AGENTS.md file or the project configuration). Fix issues if any.
  - Server: `pnpm lint`, `pnpm test`, `pnpm build`. In a worktree, install its own dependencies; do not symlink `node_modules`.
  - Client: `npm run lint`, the three custom lint rules, `npm run typecheck`, `npm run check:svelte`, `npm test`, `npm run build`, `npm run check:bundle`. Run the build after the tests, not at the same time.
- [ ] STOP. Present the changes to the user for review and suggest commit messages (or pull request titles, when the phases are implemented through pull requests). Do NOT proceed to the next phase until the user explicitly asks.

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

Implement Phase 1: resume a YGOPro duel in progress from another device.

One duel, any device, by 🐢 💨 (Turbotuga™, [Codely](https://codely.com)’s mascot)
