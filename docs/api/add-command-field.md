# Add `command` field to `GET /api/rooms`

## What

Add a `command` string field to each room in the `GET /api/rooms` response.

## Why

The Evolution client needs the room's command string to join via WebSocket.
The join protocol (`CTOS_JOIN_GAME`) requires the room name as the `pass` field.
Without `command`, the client has no way to join a room from the browser.

## Source

```typescript
// YGOProRoom already has this as a public readonly field:
YGOProRoom.name  // e.g. "M,tcg,lp8000,tm5"
```

This is the command string that created the room, **without** the `#password` suffix.
It's already stripped of the password during room creation.

## Change

In the `toRoomListDTO()` method (or wherever the room list response is built),
add one field:

```typescript
{
  id: this.id,
  command: this.name,   // <-- ADD THIS LINE
  status: ...,
  // ... rest of fields
}
```

## Response example (before → after)

```diff
 {
   "id": 7659,
+  "command": "M,tcg,lp8000",
   "status": "waiting",
   "started": false,
   ...
 }
```

## Security

`command` does NOT contain the password. The password portion after `#` is
stripped during `YGOProRoom.create()` and stored separately in `YGOProRoom.password`
(which is never exposed in any API response).
