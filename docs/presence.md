# Online presence

The online list lives on the room-list WebSocket (`WEBSOCKET_PORT`, `src/web-socket-server/WebSocketSingleton.ts`), the same socket the web ranking reads. Its logic is in `src/presence/`, wired by `src/bootstrap/bootstrapPresence.ts`.

## What every socket gets

Unchanged for every socket, whether or not it joins the online list:

- `GET-ROOMS` on connect: the rooms whose duel has started.
- `ADD-ROOM`, `UPDATE-ROOM`, `REMOVE-ROOM` broadcasts.

A socket that never sends `PRESENCE-HELLO` receives nothing else; the web ranking keeps working as before and never sees player names.

Limits on the socket: a ping every 25 s (a socket that missed the previous pong is dropped), messages over 4 KB close the socket (1009), and more than 20 messages in 10 s close it (1008). Binary messages are ignored.

## Joining the list

Client → server, JSON text frames:

| Action | Data | Notes |
|---|---|---|
| `PRESENCE-HELLO` | `{ name?, ticket?, formats, status? }` | Once per socket. With `ticket` (a game ticket from `evolution-api` `POST /game-tickets`) the player is the account: its username is used and `name`/`status` are ignored. Without it the player is a guest: `name` is required (1-20 characters, trimmed). |
| `PRESENCE-SET` | `{ formats?, status? }` | After hello. `status` is taken from guests only. |
| `PRESENCE-MUTE` | `{ muted }` | After hello. `true` turns challenges to this player off; they stay in the list. |

`formats` is a list of format ids: `tcg`, `ocg`, `edison`, `goat`, `jtp`, `jtp-adv-2007-03`, `genesys`, `rush`, `pre`, `speed`. Unknown ids are dropped. `status` is `free`, `searching` or `in-duel` (default `free`).

Server → client, only to sockets that said hello:

| Action | Data |
|---|---|
| `PRESENCE-WELCOME` | `{ self, players }`: the sender's own id and the whole list. |
| `PRESENCE-JOIN` | a player, to everyone else. |
| `PRESENCE-CHANGE` | a player whose name, formats or status changed, to everyone. |
| `PRESENCE-LEAVE` | `{ id }`, to everyone. |
| `PRESENCE-ERROR` | `{ code }`: `invalid-hello`, `invalid-update` (a bad `PRESENCE-SET` or `PRESENCE-MUTE`), `invalid-name`, `invalid-ticket`, `auth-unavailable`, `banned`, `already-joined`, `not-joined`, and the challenge refusals below. |

A player is `{ id, name, account, userId, formats, status, muted }`. `id` is `u:<userId>` for an account and `g:<random>` for a guest.

## Rules

- An account is one entry however many tabs it has open; it leaves the list when its last socket closes. A guest is one entry per socket.
- An account's status comes from the server, re-read every 2 s: `in-duel` when one of its seats is open in a room that left the waiting state (rock-paper-scissors, turn order choice, the duel or side decking, in YGOPro and EDOPro rooms alike), else `searching` when the matchmaking queue holds it (HTTP or socket, queued or pending accept), else `free`.
- A guest reports its own status, because its presence socket and its duel socket cannot be linked.
- The list is in memory. A server restart empties it; clients reconnect and say hello again.

## Challenges

Any player in the list can challenge another to one duel, or to a best of three, in a format both of them play. Code: `src/presence/application/ChallengeDesk.ts`; the room book is `src/shared/challenge/`.

Client → server:

| Action | Data | Notes |
|---|---|---|
| `PRESENCE-CHALLENGE` | `{ to, format, bestOf? }` | `to` is a player `id` from the list; `format` one of the ids above that both players list; `bestOf` is `1` (the default) or `3`. |
| `PRESENCE-CHALLENGE-CANCEL` | `{}` | Withdraws the sender's pending challenge. |
| `PRESENCE-CHALLENGE-ANSWER` | `{ challengeId, accept }` | From the target only (any of its tabs). `accept` is a boolean. |

Server → client (to every open tab of the player concerned):

| Action | Data | To |
|---|---|---|
| `CHALLENGE-SENT` | `{ challengeId, to, format, ranked, bestOf, expiresInMs }` | the challenger |
| `CHALLENGE-RECEIVED` | `{ challengeId, from, format, ranked, bestOf, expiresInMs }` | the target; `from` is the challenger's `id` |
| `CHALLENGE-CLOSED` | `{ challengeId, reason, cause? }` | both players still online |
| `CHALLENGE-START` | `{ challengeId, command, format, ranked, bestOf }` | both players; `command` is `ch#<code>`, the join command for the duel socket |

`reason` is `declined`, `expired`, `cancelled` (the challenger withdrew it or left the list) or `failed`, with `cause`: `left` (the target left the list), `in-duel` (a player was in a duel when it was accepted, or started another challenge), `matchmaking` (matchmaking had already matched or proposed a match for one of the accounts), `unavailable` (the room could not be made).

Refusals of `PRESENCE-CHALLENGE`, as `PRESENCE-ERROR` codes: `invalid-challenge` (bad payload, or a `bestOf` other than 1 or 3), `unknown-target`, `self-challenge`, `sender-in-duel`, `target-in-duel`, `target-muted`, `format-not-shared`, `challenge-pending` (the sender already has one waiting), `challenge-cooldown`. `PRESENCE-CHALLENGE-CANCEL` and `PRESENCE-CHALLENGE-ANSWER` answer `unknown-challenge` when there is no such challenge for the sender, and `invalid-challenge` for a bad payload.

Rules, all enforced by the server:

- A challenge expires 30 s after it is sent. A challenger has one pending challenge at a time; a player can receive several.
- After a decline, the same challenger cannot challenge that player again for 2 minutes. Expiry and cancel leave no cooldown.
- A muted player cannot be challenged. A player `in-duel` cannot challenge or be challenged; for accounts the status is read from the server at that moment, for guests it is the status they report.
- Ranked when both players are accounts and the format is not `speed`; casual otherwise.
- A player leaving the list (an account: its last tab) closes its challenges: the other side gets `cancelled` if the leaver sent it, `failed` with `left` if the leaver was its target.

On accept:

1. Both players must still be online and not `in-duel`, and no account may hold a match from matchmaking (a matched HTTP ticket, a pending proposal, or a seat in a matchmaking room not yet started). Otherwise the challenge fails for both.
2. Each account that is still searching leaves the matchmaking queue, HTTP ticket and socket participant alike (a socket participant's matchmaking connection is closed with `declined`). Guests leave the queue client-side.
3. The server stores the room in the challenge room book and sends both `CHALLENGE-START` with `ch#<code>`. Every other open challenge of either player closes with `failed`/`in-duel`.

The room book (`src/shared/challenge/application/ChallengeRoomBook.ts`) keeps, per code (16 base36 characters), the room command, an internal random password, the format, the ranked flag and, for a ranked room, the two userIds. A code opens its room for 2 minutes after the accept; both players use the same code. The command is built from the format's create-room token (`tcg` → `toot`, `ocg` → `oo`, `jtp-adv-2007-03` → `jtp-2007-03`, the rest by their id), with `casual` added to casual rooms so an account's ticket does not turn them ranked. The book is in memory: a server restart forgets unused codes. How the join resolves the code: [join commands §12](./join-commands.md#12-challenge-rooms-chcode).

The room is an ordinary password room of its flow (a Speed Duel one is an EDOPro room); like any password room it shows in the room list as needing a password.
