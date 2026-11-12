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

## YGOPro response timing

YGOPro readiness is client-reported through `TIME_CONFIRM`; a response without
that message is also an implicit confirmation. Neither can grant unlimited free
time. Each side receives a presentation-grace budget equal to `time_limit` at
the start of each duel, with at most 30 seconds available per response prompt.
Turn recovery and the existing action-time bonuses refill only the decision
bank, never this grace budget.

The initial deadline is the remaining bank plus the smaller of 30 seconds and
the remaining grace budget. On confirmation or response, readiness time up to
that allowance consumes the grace budget; any excess consumes the decision
bank. Confirmed thinking time then consumes only the bank. An expired bank is
rejected before recording, rewarding or submitting a response to the worker.

This lets a one-second remaining bank survive a twelve-second animation when
at least twelve seconds of grace remain. Once the grace budget is spent, all
subsequent waiting is charged. Withholding confirmation and repeatedly answering
late can therefore gain only the finite per-duel allowance. Untimed rooms keep
their existing behavior.

Reconnect clock snapshots include any charged time but never restart the
response deadline or refill grace. Duplicate and wrong-player confirmations are
ignored, and a confirmation does not send another `TIME_LIMIT`. No protocol
fields change. Clients must defer their existing confirmation until input is
usable to benefit from presentation grace. The independent EDOPro flow is
unchanged.
