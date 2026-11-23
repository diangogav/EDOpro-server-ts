import { randomInt } from "node:crypto";

import { ChallengeRoom, challengeRoomCommand } from "../domain/ChallengeRoom";

/** How long a challenge code opens its room after the challenge is accepted. */
export const CHALLENGE_ROOM_TTL_MS = 120_000;

const BASE36 = "0123456789abcdefghijklmnopqrstuvwxyz";
const TOKEN_LENGTH = 16;

export interface ChallengeRoomBookDeps {
	now?: () => number;
	/** 16 base36 characters; used for both the code and the room password. */
	randomToken?: () => string;
}

export interface IssueChallengeRoom {
	format: string;
	ranked: boolean;
	userIds: readonly string[];
}

function randomBase36Token(): string {
	let token = "";
	for (let index = 0; index < TOKEN_LENGTH; index += 1) {
		token += BASE36[randomInt(BASE36.length)];
	}

	return token;
}

/**
 * The rooms of accepted challenges, in memory, by code. The presence hub
 * issues one when a challenge is accepted; the YGOPro join resolves the code
 * players send back. A code stays valid for its whole time to live, so both
 * players can use it.
 */
export class ChallengeRoomBook {
	private readonly rooms = new Map<string, ChallengeRoom>();
	private readonly now: () => number;
	private readonly randomToken: () => string;

	public constructor(deps: ChallengeRoomBookDeps = {}) {
		this.now = deps.now ?? (() => Date.now());
		this.randomToken = deps.randomToken ?? randomBase36Token;
	}

	public issue(input: IssueChallengeRoom): ChallengeRoom {
		const command = challengeRoomCommand(input.format, input.ranked);
		if (command === null) {
			throw new Error(`Unknown challenge format: ${input.format}`);
		}
		this.forgetExpired();

		let code = this.randomToken();
		while (this.rooms.has(code)) {
			code = this.randomToken();
		}
		const room: ChallengeRoom = {
			code,
			password: this.randomToken(),
			command,
			format: input.format,
			ranked: input.ranked,
			userIds: [...input.userIds],
			expiresAt: this.now() + CHALLENGE_ROOM_TTL_MS,
		};
		this.rooms.set(code, room);

		return room;
	}

	/** The live room for a code, or null when the code is unknown or expired. */
	public resolve(code: string): ChallengeRoom | null {
		this.forgetExpired();

		return this.rooms.get(code) ?? null;
	}

	private forgetExpired(): void {
		const now = this.now();
		for (const [code, room] of this.rooms) {
			if (now >= room.expiresAt) {
				this.rooms.delete(code);
			}
		}
	}
}
