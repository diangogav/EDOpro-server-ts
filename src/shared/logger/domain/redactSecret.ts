const VISIBLE_PREFIX = 6;

// Shortens a secret (reconnection token, handshake ticket) to a prefix that is
// enough to correlate log lines without making the value replayable. Values no
// longer than the prefix are fully hidden.
export const redactSecret = (secret: string): string =>
	secret.length > VISIBLE_PREFIX ? `${secret.slice(0, VISIBLE_PREFIX)}…` : "…";
