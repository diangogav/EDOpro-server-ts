import { ChallengeBestOf } from "@shared/challenge/domain/ChallengeRoom";

import { PresenceFormat } from "./PresenceFormat";

/** An unanswered challenge expires after this long. */
export const CHALLENGE_EXPIRY_MS = 30_000;

/** After a decline, the same challenger cannot challenge that player again for this long. */
export const CHALLENGE_DECLINE_COOLDOWN_MS = 120_000;

/** A challenge waiting for its target's answer. Players are presence ids. */
export interface PresenceChallenge {
	readonly id: string;
	readonly from: string;
	readonly to: string;
	readonly format: PresenceFormat;
	readonly ranked: boolean;
	readonly bestOf: ChallengeBestOf;
}

/**
 * The challenges waiting for an answer and the cooldowns left by declines.
 * A challenger has at most one pending challenge; a player can receive many.
 */
export class PresenceChallenges {
	private readonly pending = new Map<string, PresenceChallenge>();
	private readonly cooldownUntil = new Map<string, number>();

	public add(challenge: PresenceChallenge): void {
		this.pending.set(challenge.id, challenge);
	}

	public get(id: string): PresenceChallenge | null {
		return this.pending.get(id) ?? null;
	}

	public remove(id: string): PresenceChallenge | null {
		const challenge = this.pending.get(id) ?? null;
		this.pending.delete(id);

		return challenge;
	}

	public outgoingOf(playerId: string): PresenceChallenge | null {
		return [...this.pending.values()].find((challenge) => challenge.from === playerId) ?? null;
	}

	/** Every pending challenge the player sent or received. */
	public involving(playerId: string): PresenceChallenge[] {
		return [...this.pending.values()].filter(
			(challenge) => challenge.from === playerId || challenge.to === playerId,
		);
	}

	public coolDown(from: string, to: string, until: number): void {
		this.cooldownUntil.set(PresenceChallenges.pairKey(from, to), until);
	}

	public isCoolingDown(from: string, to: string, now: number): boolean {
		for (const [key, until] of this.cooldownUntil) {
			if (now >= until) {
				this.cooldownUntil.delete(key);
			}
		}

		return this.cooldownUntil.has(PresenceChallenges.pairKey(from, to));
	}

	private static pairKey(from: string, to: string): string {
		return JSON.stringify([from, to]);
	}
}
