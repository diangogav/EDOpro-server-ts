import { container } from "@shared/dependency-injection";
import { EventBus } from "@shared/event-bus/EventBus";
import { Logger } from "@shared/logger/domain/Logger";
import { MatchLifecycleHooks } from "@shared/room/application/lifecycle/MatchLifecycleHooks";
import { MatchContext } from "@shared/room/domain/lifecycle/MatchLifecycleHook";
import { createRoomAnnounce } from "@shared/room/domain/lifecycle/RoomAnnounce";
import { GameOverDomainEvent } from "@shared/room/domain/match/domain/domain-events/GameOverDomainEvent";
import { Team } from "@shared/room/Team";
import { config } from "src/config";

import { YGOProRoom } from "../domain/YGOProRoom";
import { FinalizeYGOProRoom } from "./FinalizeYGOProRoom";

/**
 * End a match whose loser walked away, giving it the same result a played-out
 * match gets.
 *
 * A room only ever published its result from the duel end path, so a match that
 * died between duels — the opponent closing the tab during side decking — left
 * the survivor waiting on a room nobody would ever finish, and wrote no duel,
 * match or rating row at all. This is the missing terminal transition: decide
 * the score, run the ending hooks, publish the result, then tear the room down
 * through the canonical finalizer.
 */
export class EndMatchByAbandon {
	static async run(room: YGOProRoom, abandoningTeam: number, logger: Logger): Promise<void> {
		// Teardown is a single terminal transition, and a match that already has
		// a result is not ours to rewrite.
		if (room.finalizing || room.isMatchFinished()) {
			return;
		}

		const winnerTeam = abandoningTeam === Team.PLAYER ? Team.OPPONENT : Team.PLAYER;
		room.matchForfeit(winnerTeam);

		logger.info("Match ended by abandon", {
			roomId: room.id,
			matchId: room.matchId,
			abandoningTeam,
			winnerTeam,
		});

		// Ending hooks first: they read the decided match and must run before the
		// finalizer releases the per-match state they depend on.
		await container.get(MatchLifecycleHooks).runEnding(EndMatchByAbandon.endContext(room));
		EndMatchByAbandon.publishGameOver(room);
		FinalizeYGOProRoom.run(room);
	}

	private static endContext(room: YGOProRoom): MatchContext {
		return {
			roomId: room.id,
			matchId: room.matchId,
			ranked: room.ranked,
			banListName: room.banListName ?? "N/A",
			season: config.season,
			players: room.matchPlayersHistory.map((player) => ({
				id: player.id,
				team: player.team as Team,
				name: player.name,
				winner: player.winner,
			})),
			announce: createRoomAnnounce(room),
		};
	}

	private static publishGameOver(room: YGOProRoom): void {
		void container.get(EventBus).publish(
			GameOverDomainEvent.DOMAIN_EVENT,
			new GameOverDomainEvent({
				roomId: room.id,
				matchId: room.matchId,
				duelIds: [...room.duelIds],
				bestOf: room.bestOf,
				players: room.matchPlayersHistory,
				date: new Date(),
				banListHash: room.edoBanListHash,
				banListName: room.banListName ?? "N/A",
				ranked: room.ranked,
			}),
		);
	}
}
