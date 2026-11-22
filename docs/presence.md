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

`formats` is a list of format ids: `tcg`, `ocg`, `edison`, `goat`, `jtp`, `jtp-adv-2007-03`, `genesys`, `rush`, `pre`, `speed`. Unknown ids are dropped. `status` is `free`, `searching` or `in-duel` (default `free`).

Server → client, only to sockets that said hello:

| Action | Data |
|---|---|
| `PRESENCE-WELCOME` | `{ self, players }`: the sender's own id and the whole list. |
| `PRESENCE-JOIN` | a player, to everyone else. |
| `PRESENCE-CHANGE` | a player whose name, formats or status changed, to everyone. |
| `PRESENCE-LEAVE` | `{ id }`, to everyone. |
| `PRESENCE-ERROR` | `{ code }`: `invalid-hello`, `invalid-name`, `invalid-ticket`, `auth-unavailable`, `banned`, `already-joined`, `not-joined`. |

A player is `{ id, name, account, userId, formats, status }`. `id` is `u:<userId>` for an account and `g:<random>` for a guest.

## Rules

- An account is one entry however many tabs it has open; it leaves the list when its last socket closes. A guest is one entry per socket.
- An account's status comes from the server, re-read every 2 s: `in-duel` when one of its seats is open in a room whose duel has started (`turn > 0`), else `searching` when the matchmaking queue holds it (HTTP or socket, queued or pending accept), else `free`.
- A guest reports its own status, because its presence socket and its duel socket cannot be linked.
- The list is in memory. A server restart empties it; clients reconnect and say hello again.
