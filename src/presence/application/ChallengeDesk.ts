import { challengeIsRanked } from "@shared/challenge/domain/ChallengeRoom";
import { Logger } from "@shared/logger/domain/Logger";

import {
	CHALLENGE_DECLINE_COOLDOWN_MS,
	CHALLENGE_EXPIRY_MS,
	PresenceChallenge,
	PresenceChallenges,
} from "../domain/PresenceChallenges";
import { PRESENCE_FORMATS, PresenceFormat } from "../domain/PresenceFormat";
import { PresencePlayer, PresenceRegistry } from "../domain/PresenceRegistry";
import { PresenceStatus } from "../domain/PresenceStatus";
import type {
	AccountStatusProbe,
	ChallengeCloseCause,
	ChallengeCloseReason,
	ChallengeMatchmaking,
	ChallengeRoomIssuer,
	PresenceErrorCode,
	PresenceMessage,
} from "./PresenceHub";

/** Prefix of the join command an accepted challenge hands both players. */
const CHALLENGE_JOIN_PREFIX = "ch#";

export interface ChallengeDeskDeps {
	registry: PresenceRegistry;
	statusProbe: AccountStatusProbe;
	matchmaking: ChallengeMatchmaking;
	challengeRooms: ChallengeRoomIssuer;
	schedule: (callback: () => void, delayMs: number) => () => void;
	newChallengeId: () => string;
	now: () => number;
	logger: Logger;
	send: (socketId: string, message: PresenceMessage) => void;
	error: (socketId: string, code: PresenceErrorCode) => void;
}

/**
 * Direct challenges between players in the online list: sending, cancelling
 * and answering them, their 30 s expiry, the 2 min cooldown after a decline,
 * and, on accept, the room both players are sent to.
 */
export class ChallengeDesk {
	private readonly challenges = new PresenceChallenges();
	private readonly expiryTimers = new Map<string, () => void>();

	public constructor(private readonly deps: ChallengeDeskDeps) {}

	public challenge(socketId: string, data: Record<string, unknown>): void {
		const sender = this.deps.registry.playerOf(socketId);
		if (!sender) {
			this.deps.error(socketId, "not-joined");

			return;
		}
		if (typeof data.to !== "string" || typeof data.format !== "string") {
			this.deps.error(socketId, "invalid-challenge");

			return;
		}
		const target = this.deps.registry.find(data.to);
		const refusal = this.refusal(sender, target, data.format);
		if (refusal !== null || target === null) {
			this.deps.error(socketId, refusal ?? "unknown-target");

			return;
		}

		const format = data.format as PresenceFormat;
		const challenge: PresenceChallenge = {
			id: this.deps.newChallengeId(),
			from: sender.id,
			to: target.id,
			format,
			ranked: challengeIsRanked(format, sender.account && target.account),
		};
		this.challenges.add(challenge);
		this.expiryTimers.set(
			challenge.id,
			this.deps.schedule(() => this.close(challenge.id, "expired"), CHALLENGE_EXPIRY_MS),
		);
		this.sendToPlayer(sender.id, {
			action: "CHALLENGE-SENT",
			data: {
				challengeId: challenge.id,
				to: target.id,
				format,
				ranked: challenge.ranked,
				expiresInMs: CHALLENGE_EXPIRY_MS,
			},
		});
		this.sendToPlayer(target.id, {
			action: "CHALLENGE-RECEIVED",
			data: {
				challengeId: challenge.id,
				from: sender.id,
				format,
				ranked: challenge.ranked,
				expiresInMs: CHALLENGE_EXPIRY_MS,
			},
		});
	}

	public cancel(socketId: string): void {
		const sender = this.deps.registry.playerOf(socketId);
		if (!sender) {
			this.deps.error(socketId, "not-joined");

			return;
		}
		const pending = this.challenges.outgoingOf(sender.id);
		if (!pending) {
			this.deps.error(socketId, "unknown-challenge");

			return;
		}
		this.close(pending.id, "cancelled");
	}

	public answer(socketId: string, data: Record<string, unknown>): void {
		const player = this.deps.registry.playerOf(socketId);
		if (!player) {
			this.deps.error(socketId, "not-joined");

			return;
		}
		if (typeof data.challengeId !== "string" || typeof data.accept !== "boolean") {
			this.deps.error(socketId, "invalid-challenge");

			return;
		}
		const challenge = this.challenges.get(data.challengeId);
		if (!challenge || challenge.to !== player.id) {
			this.deps.error(socketId, "unknown-challenge");

			return;
		}

		if (data.accept) {
			this.accept(challenge);
		} else {
			this.challenges.coolDown(
				challenge.from,
				challenge.to,
				this.deps.now() + CHALLENGE_DECLINE_COOLDOWN_MS,
			);
			this.close(challenge.id, "declined");
		}
	}

	/** Closes every challenge of a player who left the list, telling only the other side. */
	public playerLeft(playerId: string): void {
		for (const challenge of this.challenges.involving(playerId)) {
			if (challenge.from === playerId) {
				this.close(challenge.id, "cancelled");
			} else {
				this.close(challenge.id, "failed", "left");
			}
		}
	}

	private refusal(
		sender: PresencePlayer,
		target: PresencePlayer | null,
		format: string,
	): PresenceErrorCode | null {
		if (!target) {
			return "unknown-target";
		}
		if (target.id === sender.id) {
			return "self-challenge";
		}
		if (this.statusOf(sender) === "in-duel") {
			return "sender-in-duel";
		}
		if (this.statusOf(target) === "in-duel") {
			return "target-in-duel";
		}
		if (target.muted) {
			return "target-muted";
		}
		const shared =
			(PRESENCE_FORMATS as readonly string[]).includes(format) &&
			sender.formats.includes(format as PresenceFormat) &&
			target.formats.includes(format as PresenceFormat);
		if (!shared) {
			return "format-not-shared";
		}
		if (this.challenges.outgoingOf(sender.id)) {
			return "challenge-pending";
		}
		if (this.challenges.isCoolingDown(sender.id, target.id, this.deps.now())) {
			return "challenge-cooldown";
		}

		return null;
	}

	/**
	 * Both players must still be free of a duel and of a match matchmaking
	 * already formed for them; then their accounts leave the queue and both
	 * get the join command of a room stored for them.
	 */
	private accept(challenge: PresenceChallenge): void {
		const players = [challenge.from, challenge.to]
			.map((id) => this.deps.registry.find(id))
			.filter((player): player is PresencePlayer => player !== null);
		if (players.length !== 2) {
			this.close(challenge.id, "failed", "left");

			return;
		}
		if (players.some((player) => this.statusOf(player) === "in-duel")) {
			this.close(challenge.id, "failed", "in-duel");

			return;
		}
		const userIds = players
			.map((player) => player.userId)
			.filter((userId): userId is string => userId !== null);
		if (userIds.some((userId) => this.deps.matchmaking.isMatched(userId))) {
			this.close(challenge.id, "failed", "matchmaking");

			return;
		}

		let code: string;
		try {
			code = this.deps.challengeRooms.issue({
				format: challenge.format,
				ranked: challenge.ranked,
				userIds: challenge.ranked ? userIds : [],
			}).code;
		} catch (error) {
			this.deps.logger.error("Challenge room could not be issued", {
				format: challenge.format,
				error: error instanceof Error ? error.message : String(error),
			});
			this.close(challenge.id, "failed", "unavailable");

			return;
		}

		for (const userId of userIds) {
			this.deps.matchmaking.removeUser(userId);
		}
		this.forget(challenge.id);
		for (const player of players) {
			for (const other of this.challenges.involving(player.id)) {
				this.close(other.id, "failed", "in-duel");
			}
		}
		for (const player of players) {
			this.sendToPlayer(player.id, {
				action: "CHALLENGE-START",
				data: {
					challengeId: challenge.id,
					command: `${CHALLENGE_JOIN_PREFIX}${code}`,
					format: challenge.format,
					ranked: challenge.ranked,
				},
			});
		}
	}

	private close(
		challengeId: string,
		reason: ChallengeCloseReason,
		cause?: ChallengeCloseCause,
	): void {
		const challenge = this.forget(challengeId);
		if (!challenge) {
			return;
		}
		const message: PresenceMessage = {
			action: "CHALLENGE-CLOSED",
			data: cause === undefined ? { challengeId, reason } : { challengeId, reason, cause },
		};
		this.sendToPlayer(challenge.from, message);
		this.sendToPlayer(challenge.to, message);
	}

	private forget(challengeId: string): PresenceChallenge | null {
		this.expiryTimers.get(challengeId)?.();
		this.expiryTimers.delete(challengeId);

		return this.challenges.remove(challengeId);
	}

	/** An account's status as the server sees it right now; a guest's as it reported it. */
	private statusOf(player: PresencePlayer): PresenceStatus {
		return player.userId === null ? player.status : this.deps.statusProbe.statusOf(player.userId);
	}

	private sendToPlayer(playerId: string, message: PresenceMessage): void {
		for (const socketId of this.deps.registry.socketIdsOf(playerId)) {
			this.deps.send(socketId, message);
		}
	}
}
