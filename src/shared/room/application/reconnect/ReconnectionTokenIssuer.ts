import * as crypto from "crypto";

import { YgoClient } from "@shared/client/domain/YgoClient";
import { TokenIndex } from "@shared/room/domain/TokenIndex";
import { ReconnectionTokenClientMessage } from "@shared/messages/server-to-client/ReconnectionTokenClientMessage";

// Shared, transport-agnostic reconnection-token logic consumed by BOTH subtrees
// (edopro/TCP and ygopro/WS). The orchestration here is common; the per-phase
// board/scene re-sync is intentionally NOT shared (it is core-specific).
//
// CAVEAT: TokenIndex is an in-memory singleton, so every issued token is lost if
// the process restarts. This matches the pre-existing edopro behavior; no
// persistence layer is introduced on purpose.
export class ReconnectionTokenIssuer {
	// Mint a fresh token for `client`, store it on the client, register it in the
	// global index against `roomId`, and return the STOC frame to send on the
	// player's own socket (never broadcast).
	static issue(client: YgoClient, roomId: number): Buffer {
		const token = crypto.randomBytes(16).toString("hex");
		client.setReconnectionToken(token);
		TokenIndex.getInstance().register(token, client, roomId);

		return ReconnectionTokenClientMessage.create(token);
	}

	// Invalidate the client's current token (if any) and issue a new one. Called
	// after every successful reconnection so a token is single-use.
	static rotate(client: YgoClient, roomId: number): Buffer {
		const oldToken = client.reconnectionToken;
		if (oldToken) {
			TokenIndex.getInstance().unregister(oldToken);
		}

		return this.issue(client, roomId);
	}

	// Revoke the client's current token: de-register it from the global index and
	// clear it on the client. Idempotent — safe to call on a client with no token.
	// Called on room teardown so tokens never outlive their room: TokenIndex is an
	// in-memory singleton with no TTL, so without this every finished match would
	// leak its players' tokens (and leave them pointing at destroyed clients).
	static revoke(client: YgoClient): void {
		const token = client.reconnectionToken;
		if (token) {
			TokenIndex.getInstance().unregister(token);
		}
		client.clearReconnectionToken();
	}

	// Resolve a token to its owning client, but only if it belongs to `roomId`
	// and passes the subtree's client-type guard. Returns null otherwise so the
	// caller can reject the reconnect attempt.
	static resolve(
		token: string,
		roomId: number,
		guard: (client: YgoClient) => boolean,
	): YgoClient | null {
		const entry = TokenIndex.getInstance().find(token);
		if (!entry || entry.roomId !== roomId || !guard(entry.client)) {
			return null;
		}

		return entry.client;
	}
}
