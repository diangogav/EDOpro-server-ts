# Client room options and exact banlist indices

Rules apply by tiers (mode, format, then priority modifiers); within each tier,
later tokens override earlier tokens. Commands are case-insensitive for rules
but preserve their exact raw spelling/order for pairing identity. `OT` opens
the card scope while preserving the format list; `TO` selects TCG-only cards and
the first TCG list. An explicit `LF` must follow `TO` to override that list.
`NU` is not supported by this parser and must not be offered as a working option.

The client exposes LP 1–99999, starting hand 1–40, draw 1–35, Master Rule 1–5,
and exact server list indices. `DR0` becomes 1 and `ST0` becomes 5 on the server,
so clients reject those values instead of claiming zero. The timer UI uses
seconds: `TM1` through `TM60` mean minutes, `TM61` through `TM999` mean seconds,
and `TM0` means zero. Thus only zero, 61–999 seconds, or whole minutes through
3600 seconds are exactly representable (60 seconds is `TM1`).

`GET /api/resources/version` includes `banlists.ygopro[].index`, the actual
one-based `LF` index before unnamed rows are filtered. Clients must use this
index rather than infer array positions: out-of-range server indices currently
resolve to no banlist. `LF` and `NF` are mutually exclusive in the client.
Default-equivalent values may omit their redundant tokens. Every command still
fits the hard 20-unit field; clients must reject overlong combinations and never
truncate a room name, remove a requested option, or silently change the rules.
HTTP ranked matchmaking remains the dedicated two-player tcg/jtp/edison queue;
Tag and custom casual options use the socket room pairing/named-room path.

### Banlist metadata deployment compatibility

Deploy the updated EDOpro-server-ts service to expose exact LF metadata.
Existing clients can ignore the additive `index` field; updated clients must
leave the exact LF picker unavailable when older servers omit that field.
No evolution-api migration, resource bundle update or invitation protocol
change is required for this metadata.
