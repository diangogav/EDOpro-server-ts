import EventEmitter from "events";

import { PlayerInfoMessage } from "../../../../edopro/messages/client-to-server/PlayerInfoMessage";
import { Commands } from "../../../../shared/messages/Commands";
import { ClientMessage } from "../../../../shared/messages/MessageProcessor";
import { Logger } from "../../../../shared/logger/domain/Logger";
import { ISocket } from "../../../../shared/socket/domain/ISocket";
import { YGOProClient } from "../../../client/domain/YGOProClient";
import { resolveJoinerIdentityWithTimeout } from "../resolveJoinerIdentityWithTimeout";
import { YGOProRoom } from "../YGOProRoom";
import { findMidDuelReconnectingPlayer } from "@shared/room/domain/findMidDuelReconnectingPlayer";
import { YGOProCtosHandResult } from "ygopro-msg-encode";
import { Team } from "@shared/room/Team";
import { YGOProRoomState } from "../YGOProRoomState";
import { ReconnectionTokenIssuer } from "@shared/room/application/reconnect/ReconnectionTokenIssuer";
import { ReconnectionAckMessage } from "@shared/messages/server-to-client/ReconnectionAckMessage";

export class YGOProRockPaperScissorState extends YGOProRoomState {
	private handResult = [0, 0];

	constructor(
		eventEmitter: EventEmitter,
		private readonly logger: Logger,
	) {
		super(eventEmitter);
		this.logger = logger.child({ file: "YGOProRockPaperScissorState" });
		this.eventEmitter.on(
			Commands.RPS_CHOICE as unknown as string,
			(message: ClientMessage, room: YGOProRoom, client: YGOProClient) =>
				this.handleRPSChoice.bind(this)(message, room, client),
		);
		this.eventEmitter.on(
			"JOIN",
			(message: ClientMessage, room: YGOProRoom, socket: ISocket) =>
				void this.handleJoin.bind(this)(message, room, socket),
		);
		this.eventEmitter.on(
			"EXPRESS_RECONNECT",
			(message: ClientMessage, room: YGOProRoom, socket: ISocket) =>
				this.handleExpressReconnect.bind(this)(message, room, socket),
		);
	}

	private handleExpressReconnect(message: ClientMessage, room: YGOProRoom, socket: ISocket): void {
		this.logger.info("EXPRESS_RECONNECT");
		const token = message.data.toString("utf8");

		const player = ReconnectionTokenIssuer.resolve(
			token,
			room.id,
			(client) => client instanceof YGOProClient,
		) as YGOProClient | null;
		if (!player) {
			this.logger.info(`EXPRESS_RECONNECT: no player for token ${token}`);
			socket.send(ReconnectionAckMessage.failure());
			socket.destroy();
			return;
		}

		socket.send(ReconnectionAckMessage.success());
		room.reconnect(player, socket);

		// Re-sync mirrors the name-match reconnect for this phase (handleJoin).
		player.sendMessageToClient(room.messageSender.duelStartMessage());
		room.sendDeckCountMessage(player);
		const hasSelected = this.handResult[player.team] !== 0;
		if (player.isCaptain && !hasSelected) {
			player.sendMessageToClient(room.messageSender.selectHandMessage());
		}

		player.sendMessageToClient(ReconnectionTokenIssuer.rotate(player, room.id));
		player.clearReconnecting();
	}

	private async handleJoin(
		message: ClientMessage,
		room: YGOProRoom,
		socket: ISocket,
	): Promise<void> {
		this.logger.info("handleJoin");

		// Reservation gate: past WAITING, a reserved room keeps its seats closed
		// to third parties — the join string alone never buys a seat. The gate
		// admits watch-stamped sockets (spectate-only by construction) alongside
		// a reserved player's own reconnect (its ticket-resolved identity is in
		// the reservation set); both proceed below unchanged.
		if (!room.reservationAdmits(socket)) {
			room.rejectReservedJoin(socket);
			return;
		}

		const playerInfoMessage = new PlayerInfoMessage(message.previousMessage, message.data.length);
		// The identity resolution awaits the database, yielding the event loop,
		// so the eligibility check and the seat change must run as ONE exclusive
		// section — otherwise two concurrent joins could both observe the seat
		// as reclaimable before either takes it. Same lock (and same
		// hold-across-resolver idiom) as the WAITING admission.
		await room.mutex.runExclusive(async () => {
			// A ranked seat is bound to an account id, so the joiner's identity is
			// resolved BEFORE the reconnect decision — the display name alone never
			// identifies anyone. Casual rooms bind by address and liveness instead
			// and never consult the resolver.
			let joinerUserId: string | null = null;
			if (room.ranked) {
				try {
					joinerUserId = await resolveJoinerIdentityWithTimeout(room, socket, playerInfoMessage);
				} catch (error) {
					// Fail closed: with the resolver unreachable — erroring, or hung
					// past the bounded timeout — nobody's identity is proven, so no
					// seat may change hands. The joiner waits in the stands (a legit
					// player can simply rejoin once the resolver recovers) instead of
					// hanging with no response. This catch keeps the resolver failure
					// off the voided JOIN promise; a later synchronous throw inside
					// this exclusive section still surfaces to the global handler
					// (the process survives it and the mutex releases).
					this.logger.error(`resolveJoinerIdentity failed: ${String(error)}`);
					this.admitAsSpectator(room, socket, playerInfoMessage.name);
					return;
				}
			}
			// The shared seam honors the watch stamp: a "w,<roomId>" joiner asked to
			// spectate, never to take a seat, so a name match must not reconnect it.
			const playerAlreadyInRoom = findMidDuelReconnectingPlayer({
				players: room.players,
				name: playerInfoMessage.name,
				socket,
				roomId: room.id,
				ranked: room.ranked,
				joinerUserId,
			});

			if (!(playerAlreadyInRoom instanceof YGOProClient)) {
				this.admitAsSpectator(room, socket, playerInfoMessage.name);
				return;
			}

			room.reconnect(playerAlreadyInRoom, socket);

			playerAlreadyInRoom.sendMessageToClient(room.messageSender.duelStartMessage());

			room.sendDeckCountMessage(playerAlreadyInRoom);

			const hasSelected = this.handResult[playerAlreadyInRoom.team] !== 0;
			if (playerAlreadyInRoom.isCaptain && !hasSelected) {
				playerAlreadyInRoom.sendMessageToClient(room.messageSender.selectHandMessage());
			}
		});
	}

	private admitAsSpectator(room: YGOProRoom, socket: ISocket, name: string): void {
		const spectator = room.createSpectatorUnsafe(socket, name);
		room.addSpectatorUnsafe(spectator);
		spectator.sendMessageToClient(room.messageSender.duelStartMessage());
		room.sendDeckCountMessage(spectator);
	}

	private handleRPSChoice(message: ClientMessage, room: YGOProRoom, player: YGOProClient): void {
		player.logger.info(`handleRPSChoice: ${message.raw.toString("hex")}`);

		if (!player.isCaptain) {
			return;
		}

		const data = new YGOProCtosHandResult().fromPayload(message.data);

		// if (data.res < HandResult.ROCK || data.res > HandResult.PAPER) {
		// 	return;
		// }

		const team = player.team;
		if (team < Team.PLAYER || team > Team.OPPONENT) {
			return;
		}

		this.handResult[team] = data.res;

		if (!this.handResult[Team.PLAYER] || !this.handResult[Team.OPPONENT]) {
			return;
		}

		const team0Result = room.messageSender.handResultMessage(
			this.handResult[Team.PLAYER],
			this.handResult[Team.OPPONENT],
		);
		room.getTeamPlayers(Team.PLAYER).forEach((_player) => _player.sendMessageToClient(team0Result));
		room.spectators.forEach((spectator: YGOProClient) =>
			spectator.sendMessageToClient(team0Result),
		);

		const team1Result = room.messageSender.handResultMessage(
			this.handResult[Team.OPPONENT],
			this.handResult[Team.PLAYER],
		);
		room
			.getTeamPlayers(Team.OPPONENT)
			.forEach((_player) => _player.sendMessageToClient(team1Result));

		if (this.handResult[Team.PLAYER] === this.handResult[Team.OPPONENT]) {
			this.handResult = [0, 0];
			this.toRPS(room);
			return;
		}

		const winner = this.getRPSWinner();
		const winnerPlayer = room.getTeamPlayers(winner)[0];
		if (!winnerPlayer) {
			return;
		}

		this.handResult = [0, 0];
		winnerPlayer.sendMessageToClient(room.messageSender.selectTpMessage());

		room.setClientWhoChoosesTurn(winnerPlayer);
		room.choosingOrder();
	}

	private getRPSWinner(): number {
		if (
			(this.handResult[Team.PLAYER] === 1 && this.handResult[Team.OPPONENT] === 2) ||
			(this.handResult[Team.PLAYER] === 2 && this.handResult[Team.OPPONENT] === 3) ||
			(this.handResult[Team.PLAYER] === 3 && this.handResult[Team.OPPONENT] === 1)
		) {
			return Team.OPPONENT;
		} else {
			return Team.PLAYER;
		}
	}
}
