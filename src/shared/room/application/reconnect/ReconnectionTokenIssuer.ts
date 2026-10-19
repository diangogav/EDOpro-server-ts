import * as crypto from "crypto";

import { YgoClient } from "@shared/client/domain/YgoClient";
import { TokenIndex } from "@shared/room/domain/TokenIndex";
import { ReconnectionTokenClientMessage } from "@shared/messages/server-to-client/ReconnectionTokenClientMessage";

// How long a token stays resolvable after rotate() replaced it. The new token is
// the last frame of a reconnect; if the socket dies before it arrives, the client
// can still retry with the token it already holds.
export const PREVIOUS_TOKEN_OVERLAP_MS = 60_000;

type PreviousToken = { token: string; timer: NodeJS.Timeout };

// Shared, transport-agnostic reconnection-token logic consumed by BOTH subtrees
// (edopro/TCP and ygopro/WS). The orchestration here is common; the per-phase
// board/scene re-sync is intentionally NOT shared (it is core-specific).
//
// CAVEAT: TokenIndex is an in-memory singleton, so every issued token is lost if
// the process restarts. This matches the pre-existing edopro behavior; no
// persistence layer is introduced on purpose.
export class ReconnectionTokenIssuer {
	// At most one overlapping previous token per client.
	private static readonly previousTokens = new WeakMap<YgoClient, PreviousToken>();

	// Mint a fresh token for `client`, store it on the client, register it in the
	// global index against `roomId`, and return the STOC frame to send on the
	// player's own socket (never broadcast).
	static issue(client: YgoClient, roomId: number): Buffer {
		const token = crypto.randomBytes(16).toString("hex");
		client.setReconnectionToken(token);
		TokenIndex.getInstance().register(token, client, roomId);

		return ReconnectionTokenClientMessage.create(token);
	}

	// Issue a new token and demote the current one to "previous": it keeps
	// resolving for PREVIOUS_TOKEN_OVERLAP_MS, then is unregistered. Called after
	// every successful reconnection, so a token is replaced on each use.
	static rotate(client: YgoClient, roomId: number): Buffer {
		this.dropPrevious(client);
		const oldToken = client.reconnectionToken;
		if (oldToken) {
			const timer = setTimeout(() => {
				TokenIndex.getInstance().unregister(oldToken);
				this.previousTokens.delete(client);
			}, PREVIOUS_TOKEN_OVERLAP_MS);
			timer.unref?.();
			this.previousTokens.set(client, { token: oldToken, timer });
		}

		return this.issue(client, roomId);
	}

	// Revoke the client's current and overlapping previous tokens: de-register
	// them from the global index and clear the current one on the client. Idempotent — safe to call on a client with no token.
	// Called on room teardown so tokens never outlive their room: TokenIndex is an
	// in-memory singleton with no TTL, so without this every finished match would
	// leak its players' tokens (and leave them pointing at destroyed clients).
	static revoke(client: YgoClient): void {
		this.dropPrevious(client);
		const token = client.reconnectionToken;
		if (token) {
			TokenIndex.getInstance().unregister(token);
		}
		client.clearReconnectionToken();
	}

	private static dropPrevious(client: YgoClient): void {
		const previous = this.previousTokens.get(client);
		if (!previous) return;
		clearTimeout(previous.timer);
		TokenIndex.getInstance().unregister(previous.token);
		this.previousTokens.delete(client);
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
