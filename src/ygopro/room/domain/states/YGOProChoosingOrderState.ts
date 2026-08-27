import EventEmitter from "events";

import { PlayerInfoMessage } from "../../../../edopro/messages/client-to-server/PlayerInfoMessage";
import { Commands } from "../../../../shared/messages/Commands";
import { ClientMessage } from "../../../../shared/messages/MessageProcessor";
import { YGOProRoomState } from "../YGOProRoomState";
import { Logger } from "../../../../shared/logger/domain/Logger";
import { ISocket } from "../../../../shared/socket/domain/ISocket";
import { YGOProClient } from "../../../client/domain/YGOProClient";
import { resolveJoinerIdentityWithTimeout } from "../resolveJoinerIdentityWithTimeout";
import { YGOProRoom } from "../YGOProRoom";
import { findMidDuelReconnectingPlayer } from "@shared/room/domain/findMidDuelReconnectingPlayer";
import { TurnPlayerResult, YGOProCtosTpResult, YGOProStocDuelStart } from "ygopro-msg-encode";
import { ReconnectionTokenIssuer } from "@shared/room/application/reconnect/ReconnectionTokenIssuer";
import { ReconnectionAckMessage } from "@shared/messages/server-to-client/ReconnectionAckMessage";

export class YGOProChoosingOrderState extends YGOProRoomState {
	constructor(
		eventEmitter: EventEmitter,
		private readonly logger: Logger,
	) {
		super(eventEmitter);

		this.logger = logger.child({ file: "YGOProChoosingOrderState" });

		this.eventEmitter.on(
			"JOIN",
			(message: ClientMessage, room: YGOProRoom, socket: ISocket) =>
				void this.handleJoin.bind(this)(message, room, socket),
		);
		this.eventEmitter.on(
			Commands.TURN_CHOICE as unknown as string,
			(message: ClientMessage, room: YGOProRoom, client: YGOProClient) =>
				this.handleTurnChoice.bind(this)(message, room, client),
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
		if (room.clientWhoChoosesTurn === player) {
			player.sendMessageToClient(room.messageSender.selectTpMessage());
		}

		player.sendMessageToClient(ReconnectionTokenIssuer.rotate(player, room.id));
		player.clearReconnecting();
	}

	private handleTurnChoice(message: ClientMessage, room: YGOProRoom, player: YGOProClient): void {
		player.logger.info("handleTurnChoice");

		const data = new YGOProCtosTpResult().fromPayload(message.data);
		const turn = data.res;

		room.setPositionSwapped((turn === TurnPlayerResult.FIRST) !== (player.team === 0));
		room.dueling();
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

			if (room.clientWhoChoosesTurn === playerAlreadyInRoom) {
				playerAlreadyInRoom.sendMessageToClient(room.messageSender.selectTpMessage());
			}
		});
	}

	private admitAsSpectator(room: YGOProRoom, socket: ISocket, name: string): void {
		const spectator = room.createSpectatorUnsafe(socket, name);
		room.addSpectatorUnsafe(spectator);
		spectator.sendMessageToClient(Buffer.from(new YGOProStocDuelStart().toFullPayload()));
		room.sendDeckCountMessage(spectator);
	}
}
