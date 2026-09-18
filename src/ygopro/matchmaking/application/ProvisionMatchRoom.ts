import { EventEmitter } from "stream";

import { Logger } from "@shared/logger/domain/Logger";
import { RoomIdGenerator } from "@ygopro/room/domain/RoomIdGenerator";

import { Match } from "../domain/Match";
import { MatchHandler } from "../domain/MatchHandler";
import { Participant } from "../domain/Participant";
import { MatchmakingFormat } from "../domain/QueueEntry";
import { createMatchmakingRoom, MatchmakingRoomHandle } from "./MatchmakingRoomFactory";

/**
 * Narrow re-queue capability `ProvisionMatchRoom` needs on a failure path.
 * Typed separately from `MatchmakingPool` so this class stays testable
 * without constructing the whole pool.
 */
export interface MatchRequeuePool {
	add(participant: Participant): void;
}

export interface ProvisionMatchRoomDeps {
	readonly logger: Logger;
	readonly roomIdGenerator: RoomIdGenerator;
	readonly pool: MatchRequeuePool;
	/** Fires the windbot join for a bot-fallback match (fire-and-forget). */
	readonly spawnBot: (roomId: number, format: MatchmakingFormat) => void;
	/** Registers the freshly created room with the empty-room reaper. */
	readonly onRoomCreated?: (room: MatchmakingRoomHandle["room"]) => void;
}

/**
 * `MatchHandler` implementation: turns a formed `Match` into a real room.
 *
 * Order matters (D19): every participant receives `MATCHMAKING_FOUND` before
 * any socket participant is admitted, so a client always learns a room is
 * coming before room traffic can arrive. A socket participant missing its
 * captured `CTOS_PLAYER_INFO` is rejected before any room is created — no
 * partial room is ever left behind. Any other failure is caught here, logged,
 * and every participant is handed back to the pool so a retry can happen on
 * the next tick; the pool itself already removed them before calling this.
 */
export class ProvisionMatchRoom implements MatchHandler {
	public constructor(private readonly deps: ProvisionMatchRoomDeps) {}

	public handle(match: Match): void {
		const missing = match.participants.filter(
			(participant) => participant.presence === "socket" && !participant.admission,
		);

		if (missing.length > 0) {
			this.rejectMissingPlayerInfo(match, missing);

			return;
		}

		try {
			this.provisionRoom(match);
		} catch (error) {
			this.deps.logger.error("matchmaking.provision_failed", {
				matchId: match.id,
				error: error instanceof Error ? error.message : String(error),
			});
			for (const participant of match.participants) {
				this.deps.pool.add(participant);
			}
		}
	}

	private rejectMissingPlayerInfo(match: Match, missing: readonly Participant[]): void {
		for (const participant of missing) {
			participant.channel.close("missing_player_info");
		}
		for (const participant of match.participants) {
			if (missing.includes(participant)) continue;
			this.deps.pool.add(participant);
		}
		this.deps.logger.warn("matchmaking.provision_failed", {
			matchId: match.id,
			reason: "missing_player_info",
		});
	}

	private provisionRoom(match: Match): void {
		this.deps.logger.info("matchmaking.match_found", {
			matchId: match.id,
			format: match.format,
			mode: match.mode,
			rated: match.rated,
			opponentType: match.opponentKind,
		});

		const isHumanMatch = match.opponentKind === "human";
		const reservedUserIds = match.participants.map((participant) => participant.userId);

		const { room, roomPassword } = createMatchmakingRoom({
			format: match.format,
			matchMode: isHumanMatch,
			rankedOverride: isHumanMatch,
			reservedUserIds,
			roomIdGenerator: this.deps.roomIdGenerator,
			logger: this.deps.logger,
			emitter: new EventEmitter(),
			onRoomCreated: this.deps.onRoomCreated,
		});

		for (const participant of match.participants) {
			const opponent = match.participants.find((candidate) => candidate.id !== participant.id);
			participant.channel.found({
				matchId: match.id,
				roomId: room.id,
				roomPassword,
				opponentType: match.opponentKind,
				rated: match.rated,
				opponentName: opponent?.displayName ?? null,
			});
		}

		for (const participant of match.participants) {
			if (!participant.admission) continue;
			room.emit("MATCH_ADMIT", participant.admission.playerInfo, participant.admission.socket);
		}

		if (match.opponentKind === "bot") {
			this.deps.spawnBot(room.id, match.format);
		}

		this.deps.logger.info("matchmaking.room_provisioned", { matchId: match.id, roomId: room.id });
	}
}
