import { YgoClient } from "../../client/domain/YgoClient";

type TokenEntry = {
	client: YgoClient;
	roomId: number;
};

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

	register(token: string, client: YgoClient, roomId: number): void {
		if (token) {
			this.tokens.set(token, { client, roomId });
		}
	}

	unregister(token: string): void {
		if (token) {
			this.tokens.delete(token);
		}
	}

	find(token: string): TokenEntry | undefined {
		return this.tokens.get(token);
	}

	clear(): void {
		this.tokens.clear();
	}
}
