import { YgoClient } from "@shared/client/domain/YgoClient";
import { Logger } from "@shared/logger/domain/Logger";
import { redactSecret } from "@shared/logger/domain/redactSecret";
import { ISocket } from "@shared/socket/domain/ISocket";

export type ReconnectPath = "token" | "by-name";

export type ReconnectOutcome =
	| "forwarded" // token accepted and handed to the room's current phase
	| "matched" // by-name seat found
	| "unknown_token"
	| "room_not_found"
	| "identity_missing" // verified seat, but the connection carries no account
	| "identity_mismatch";

// One structured info line per reconnect attempt, so reconnect health can be
// measured per path and transport without parsing prose logs. The token only
// ever appears as a redacted prefix.
export function logReconnectAttempt(
	logger: Logger,
	attempt: {
		path: ReconnectPath;
		outcome: ReconnectOutcome;
		socket: ISocket;
		client: YgoClient | null;
		identityChecked: boolean;
		token?: string;
	},
): void {
	logger.info("reconnect.attempt", {
		path: attempt.path,
		outcome: attempt.outcome,
		transport: attempt.socket.transport,
		verified: attempt.client?.isStrongAuth ?? false,
		identityChecked: attempt.identityChecked,
		tokenPrefix: attempt.token === undefined ? null : redactSecret(attempt.token),
	});
}
