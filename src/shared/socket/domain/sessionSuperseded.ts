// Close code and reason sent to a socket whose seat was taken over by a newer
// connection. Clients must not auto-reconnect on it.
export const SESSION_SUPERSEDED_CLOSE_CODE = 4001;
export const SESSION_SUPERSEDED_CLOSE_REASON = "session superseded";

// How long a superseded socket gets to finish its close handshake before it is
// terminated.
export const SUPERSEDED_CLOSE_TIMEOUT_MS = 2000;
