import { YgoClient } from "../../client/domain/YgoClient";

export type TokenKind = "reconnect" | "windbot";

type WindBotInfoSnapshot = {
	name: string;
	deck: string;
};

type ReconnectTokenEntry = {
	kind: "reconnect";
	client: YgoClient;
	roomId: number;
};

type WindBotTokenEntry = {
	kind: "windbot";
	client: null;
	roomId: number;
	botInfo: WindBotInfoSnapshot;
};

export type TokenEntry = ReconnectTokenEntry | WindBotTokenEntry;

export class TokenIndex {
	private static instance: TokenIndex;
	private readonly tokens: Map<string, TokenEntry> = new Map();

	private constructor() {}

	static getInstance(): TokenIndex {
		if (!TokenIndex.instance) {
			TokenIndex.instance = new TokenIndex();
		}
		return TokenIndex.instance;
	}

	/** Test seam: creates an isolated instance not bound to the singleton. */
	static createForTests(): TokenIndex {
		return new TokenIndex();
	}

	/**
	 * Register a reconnect token.
	 * Back-compat: when kind is omitted it defaults to 'reconnect'.
	 */
	register(token: string, client: YgoClient, roomId: number, kind: "reconnect" = "reconnect"): void {
		if (token) {
			this.tokens.set(token, { kind, client, roomId });
		}
	}

	/** Register a windbot token (no YgoClient until the bot connects back). */
	registerWindbot(token: string, roomId: number, botInfo: WindBotInfoSnapshot): void {
		if (token) {
			this.tokens.set(token, { kind: "windbot", client: null, roomId, botInfo });
		}
	}

	/**
	 * Remove a token.
	 * When kind is provided, the deletion is guarded — entry is only removed when kind matches.
	 * When kind is omitted, any entry for the token is removed (legacy behavior).
	 */
	unregister(token: string, kind?: TokenKind): void {
		if (!token) {
			return;
		}
		if (kind === undefined) {
			this.tokens.delete(token);
			return;
		}
		const entry = this.tokens.get(token);
		if (entry && entry.kind === kind) {
			this.tokens.delete(token);
		}
	}

	/**
	 * Find a token entry.
	 * When kind is provided, returns undefined on kind mismatch (REQ-TOKEN-202).
	 * When kind is omitted, returns the entry regardless of kind (legacy behavior).
	 */
	find(token: string, kind?: TokenKind): TokenEntry | undefined {
		const entry = this.tokens.get(token);
		if (!entry) {
			return undefined;
		}
		if (kind !== undefined && entry.kind !== kind) {
			return undefined;
		}
		return entry;
	}

	/**
	 * Atomic find + delete. Returns the entry only when it exists and the kind matches.
	 * On mismatch the token is NOT removed (REQ-TOKEN-202).
	 * On match the token is removed immediately (REQ-TOKEN-203 — one-shot).
	 */
	consume(token: string, kind: TokenKind): TokenEntry | undefined {
		const entry = this.tokens.get(token);
		if (!entry || entry.kind !== kind) {
			return undefined;
		}
		this.tokens.delete(token);
		return entry;
	}

	/**
	 * Remove all tokens of a given kind for a specific room.
	 * Returns the number of entries removed (REQ-TOKEN-204).
	 */
	clearByRoom(roomId: number, kind: TokenKind): number {
		let count = 0;
		for (const [token, entry] of this.tokens) {
			if (entry.roomId === roomId && entry.kind === kind) {
				this.tokens.delete(token);
				count++;
			}
		}
		return count;
	}

	clear(): void {
		this.tokens.clear();
	}
}
