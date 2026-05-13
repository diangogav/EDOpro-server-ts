import crypto from "crypto";

export type WindbotTokenPayload = {
	roomId: number;
	botName: string;
	deck: string;
};

export class WindbotTokenStore {
	private readonly entries: Map<string, WindbotTokenPayload> = new Map();

	constructor() {}

	register(roomId: number, botName: string, deck: string): string {
		const token = this._generateUniqueToken();
		this.entries.set(token, { roomId, botName, deck });
		return token;
	}

	consume(token: string): WindbotTokenPayload {
		const payload = this.entries.get(token);
		if (payload === undefined) {
			throw new Error("Windbot token not found");
		}
		this.entries.delete(token);
		return payload;
	}

	clearByRoom(roomId: number): number {
		let count = 0;
		for (const [token, payload] of this.entries) {
			if (payload.roomId === roomId) {
				this.entries.delete(token);
				count++;
			}
		}
		return count;
	}

	static createForTests(): WindbotTokenStore {
		return new WindbotTokenStore();
	}

	private _generateUniqueToken(): string {
		const MAX_ATTEMPTS = 10;
		for (let i = 0; i < MAX_ATTEMPTS; i++) {
			const token = crypto.randomBytes(6).toString("hex");
			if (!this.entries.has(token)) {
				return token;
			}
		}
		throw new Error("WindbotTokenStore: failed to generate a unique token after 10 attempts");
	}
}
