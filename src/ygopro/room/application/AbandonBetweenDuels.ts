import { Logger } from "@shared/logger/domain/Logger";
import { MatchAbandonClientMessage } from "@shared/messages/server-to-client/MatchAbandonClientMessage";
import { Team } from "@shared/room/Team";
import { YGOProClient } from "@ygopro/client/domain/YGOProClient";

import { YGOProRoom } from "../domain/YGOProRoom";
import { EndMatchByAbandon } from "./EndMatchByAbandon";
import { FinalizeYGOProRoom } from "./FinalizeYGOProRoom";

export const ABANDON_GRACE_MS = 60_000;

/**
 * Settle a match whose player walked away between duels.
 *
 * Every phase between duels waits on both players, so a leaver used to strand
 * the opponent on a room nobody would ever finish. The leaver gets a grace
 * window to reconnect; after it (or at once, on a surrender) the match is
 * either cancelled — no duel was played, so there is nothing honest to award
 * and awarding a full match would let an alt account farm rating — or awarded
 * to the team that stayed.
 */
export class AbandonBetweenDuels {
	private static readonly graceTimers = new WeakMap<YGOProRoom, Map<number, NodeJS.Timeout>>();

	/** Start the grace window for a player whose socket closed. Returns whether
	 * the leave was ours to handle. */
	static playerLeft(room: YGOProRoom, player: YGOProClient, logger: Logger): boolean {
		if (player.isSpectator || !room.isBetweenDuels()) {
			return false;
		}

		AbandonBetweenDuels.clearGrace(room, player.position);

		const graceMs = AbandonBetweenDuels.remainingGraceMs(player);
		const notice = MatchAbandonClientMessage.opponentDisconnected(Math.ceil(graceMs / 1000));
		AbandonBetweenDuels.opponentsOf(room, player.team).forEach((client) =>
			client.sendMessageToClient(notice),
		);

		const timer = setTimeout(() => {
			AbandonBetweenDuels.timersOf(room).delete(player.position);
			// A reconnect swaps in a fresh socket, so an open one means they came
			// back. A later phase means they came back and the match moved on: a
			// mid-duel drop is not ours to settle.
			if (room.finalizing || !player.socket.closed || !room.isBetweenDuels()) {
				return;
			}
			void AbandonBetweenDuels.resolve(room, player.team, logger);
		}, graceMs);
		AbandonBetweenDuels.timersOf(room).set(player.position, timer);

		logger.info("Player left between duels", {
			roomId: room.id,
			position: player.position,
			duelState: room.duelState,
		});

		return true;
	}

	/**
	 * The window runs from the leaver's last sign of life, not from the moment the
	 * server noticed the drop: a half-open connection can take a while to be
	 * detected, and that latency must not stretch the opponent's wait.
	 * Only WebSocket silence means anything: heartbeat pongs keep it fresh. A TCP
	 * client may be alive but quiet for minutes (keepalive replies never reach the
	 * socket), so it always gets the full window.
	 */
	private static remainingGraceMs(player: YGOProClient): number {
		const lastInboundAt = player.socket.lastInboundAt;
		if (player.socket.transport !== "ws" || lastInboundAt === undefined) {
			return ABANDON_GRACE_MS;
		}
		const silentMs = Date.now() - lastInboundAt;

		return Math.min(ABANDON_GRACE_MS, Math.max(0, ABANDON_GRACE_MS - silentMs));
	}

	/** Settle the match now: the abandoning team leaves it for good. */
	static async resolve(room: YGOProRoom, abandoningTeam: number, logger: Logger): Promise<void> {
		AbandonBetweenDuels.clearAllGrace(room);

		if (room.finalizing || room.isMatchFinished() || !room.isBetweenDuels()) {
			return;
		}

		const stayers = AbandonBetweenDuels.opponentsOf(room, abandoningTeam);

		if (!room.hasPlayedAnyDuel()) {
			logger.info("Match cancelled by abandon", { roomId: room.id, abandoningTeam });
			const cancelled = MatchAbandonClientMessage.matchCancelled();
			stayers.forEach((client) => client.sendMessageToClient(cancelled));
			FinalizeYGOProRoom.run(room);

			return;
		}

		const won = MatchAbandonClientMessage.matchWon();
		stayers.forEach((client) => client.sendMessageToClient(won));
		try {
			await EndMatchByAbandon.run(room, abandoningTeam, logger);
		} catch (error) {
			// Callers fire and forget, so a failure here would otherwise strand the
			// stayer on a room nobody closes. The result may be lost; the room is not.
			logger.error("Ending the abandoned match failed", {
				roomId: room.id,
				error: String(error),
			});
			FinalizeYGOProRoom.run(room);
		}
	}

	private static opponentsOf(room: YGOProRoom, team: number): YGOProClient[] {
		const otherTeam = team === Team.PLAYER ? Team.OPPONENT : Team.PLAYER;

		return room.getTeamPlayers(otherTeam);
	}

	private static timersOf(room: YGOProRoom): Map<number, NodeJS.Timeout> {
		let timers = AbandonBetweenDuels.graceTimers.get(room);
		if (!timers) {
			timers = new Map();
			AbandonBetweenDuels.graceTimers.set(room, timers);
		}

		return timers;
	}

	private static clearGrace(room: YGOProRoom, position: number): void {
		const timers = AbandonBetweenDuels.timersOf(room);
		clearTimeout(timers.get(position));
		timers.delete(position);
	}

	private static clearAllGrace(room: YGOProRoom): void {
		const timers = AbandonBetweenDuels.timersOf(room);
		timers.forEach((timer) => clearTimeout(timer));
		timers.clear();
	}
}
