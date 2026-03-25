import BanListMemoryRepository from "@edopro/ban-list/infrastructure/BanListMemoryRepository";
import { EventEmitter } from "events";
import { CoreMessages } from "src/edopro/messages/domain/CoreMessages";
import { container } from "src/shared/dependency-injection";
import { EventBus } from "src/shared/event-bus/EventBus";
import { GameOverDomainEvent } from "src/shared/room/domain/match/domain/domain-events/GameOverDomainEvent";
import WebSocketSingleton from "src/web-socket-server/WebSocketSingleton";

import { PlayerInfoMessage } from "../../../../edopro/messages/client-to-server/PlayerInfoMessage";
import { Commands } from "../../../../edopro/messages/domain/Commands";
import { ClientMessage } from "../../../../edopro/messages/MessageProcessor";
import { RoomState } from "../../../../edopro/room/domain/RoomState";
import { Logger } from "../../../../shared/logger/domain/Logger";
import { DuelState } from "../../../../shared/room/domain/YgoRoom";
import { ISocket } from "../../../../shared/socket/domain/ISocket";
import { MercuryClient } from "../../../client/domain/MercuryClient";
import { MercuryRoom } from "../MercuryRoom";

import {
	OcgcoreScriptConstants,
	YGOProMsgNewTurn,
	YGOProMsgStart,
	YGOProMsgWin,
	YGOProStocDuelStart,
	YGOProStocGameMsg,
} from "ygopro-msg-encode";
import { OCGCore } from "src/mercury/ocgcore-worker/ocgcore";

export class MercuryDuelingState extends RoomState {
	private readonly eventBus: EventBus;
	private readonly ocgCore: OCGCore;

	constructor(
		private readonly room: MercuryRoom,
		eventEmitter: EventEmitter,
		private readonly logger: Logger,
	) {
		super(eventEmitter);
		this.logger = logger.child({ file: "MercuryDuelingState" });
		this.ocgCore = new OCGCore(this.room, this.logger);
		this.handle();
		this.eventBus = container.get(EventBus);
		this.eventEmitter.on(
			"DUEL_END",
			(message: ClientMessage, room: MercuryRoom, client: MercuryClient) =>
				this.handleDuelEnd.bind(this)(message, room, client),
		);

		this.eventEmitter.on(
			"JOIN",
			(message: ClientMessage, room: MercuryRoom, socket: ISocket) =>
				void this.handleJoin.bind(this)(message, room, socket),
		);

		this.eventEmitter.on(
			"GAME_MSG",
			(message: ClientMessage, room: MercuryRoom, socket: ISocket) =>
				void this.handleGameMessage.bind(this)(message, room, socket),
		);

		this.eventEmitter.on(
			"FIELD_FINISH",
			(message: ClientMessage, room: MercuryRoom, socket: ISocket) =>
				void this.handleFieldFinish.bind(this)(message, room, socket),
		);

		this.eventEmitter.on(
			"TIME_LIMIT",
			(message: ClientMessage, room: MercuryRoom, socket: ISocket) =>
				void this.handleTimeLimit.bind(this)(message, room, socket),
		);

		this.eventEmitter.on(
			"CHANGE_SIDE",
			(message: ClientMessage, room: MercuryRoom, socket: ISocket) =>
				void this.handleChangeSide.bind(this)(message, room, socket),
		);

		this.eventEmitter.on(
			Commands.UPDATE_DECK as unknown as string,
			(message: ClientMessage, room: MercuryRoom, socket: ISocket) =>
				void this.handleUpdateDeck.bind(this)(message, room, socket),
		);

		this.eventEmitter.on(
			Commands.TIME_CONFIRM as unknown as string,
			(message: ClientMessage, room: MercuryRoom, socket: ISocket) =>
				void this.handleTimeConfirm.bind(this)(message, room, socket),
		);

		this.eventEmitter.on(
			Commands.RESPONSE as unknown as string,
			(message: ClientMessage, room: MercuryRoom, client: MercuryClient) =>
				void this.handleResponse.bind(this)(message, room, client),
		);
	}

	private async handle(): Promise<void> {
		this.logger.info("MercuryDuelingState:handle");
		this.room.generateDuelRecord();
		await this.ocgCore.init(this.room);

		this.ocgCore.messageMiddleware.on(YGOProMsgWin, (msg) => {
			console.log("Winner", msg.player);
			return msg;
		}, 100);

		const [
			player0DeckCount,
			player0ExtraCount,
			player1DeckCount,
			player1ExtraCount,
		] = await Promise.all([
			this.ocgCore.queryFieldCount({
				team: 0,
				location: OcgcoreScriptConstants.LOCATION_DECK,
			}),
			this.ocgCore.queryFieldCount({
				team: 0,
				location: OcgcoreScriptConstants.LOCATION_EXTRA,
			}),
			this.ocgCore.queryFieldCount({
				team: 1,
				location: OcgcoreScriptConstants.LOCATION_DECK,
			}),
			this.ocgCore.queryFieldCount({
				team: 1,
				location: OcgcoreScriptConstants.LOCATION_EXTRA,
			}),
		]);

		const createStartMsg = (playerType: number) =>
			new YGOProStocGameMsg().fromPartial({
				msg: new YGOProMsgStart().fromPartial({
					playerType,
					duelRule: this.room.hostInfo.duel_rule,
					startLp0: this.room.hostInfo.start_lp,
					startLp1: this.room.hostInfo.start_lp,
					player0: {
						deckCount: player0DeckCount,
						extraCount: player0ExtraCount,
					},
					player1: {
						deckCount: player1DeckCount,
						extraCount: player1ExtraCount,
					},
				}),
			});

		const team0Players = this.room.getTeamPlayers(0);
		const team1Players = this.room.getTeamPlayers(1);

		const team0StartMessage = createStartMsg(0);
		const team1StartMessage = createStartMsg(1);

		team0Players.forEach((_player) => {
			_player.sendMessageToClient(
				Buffer.from(team0StartMessage.toFullPayload()),
			);
		});

		team1Players.forEach((_player) => {
			_player.sendMessageToClient(
				Buffer.from(team1StartMessage.toFullPayload()),
			);
		});

		const watcherStartMessage = createStartMsg(this.room.isPositionSwapped ? 0x11 : 0x10);
		const spectators = this.room.spectators as MercuryClient[];
		spectators.forEach((spectator) => {
			spectator.sendMessageToClient(
				Buffer.from(watcherStartMessage.toFullPayload()),
			);
		});

		this.room.saveMessageToDuelRecord(watcherStartMessage.msg!);

		this.ocgCore.refreshZones({ player: 0, location: OcgcoreScriptConstants.LOCATION_EXTRA })
		this.ocgCore.refreshZones({ player: 1, location: OcgcoreScriptConstants.LOCATION_EXTRA })


		this.ocgCore.advance();
	}

	private handleDuelEnd(
		_message: ClientMessage,
		_room: MercuryRoom,
		player: MercuryClient,
	): void {
		player.logger.info("MercuryDuelingState: DUEL_END");
	}

	private handleJoin(
		message: ClientMessage,
		room: MercuryRoom,
		socket: ISocket,
	): void {
		this.logger.info("JOIN");
		const playerInfoMessage = new PlayerInfoMessage(message.previousMessage, message.data.length);
		const playerAlreadyInRoom = this.playerAlreadyInRoom(playerInfoMessage, room, socket);

		if (!(playerAlreadyInRoom instanceof MercuryClient)) {
			const spectator = room.createSpectatorUnsafe(socket, playerInfoMessage.name);
			room.addSpectatorUnsafe(spectator);
			spectator.sendMessageToClient(Buffer.from(new YGOProStocDuelStart().toFullPayload()));
			room.sendPreviousDuelsHistoricalMessages(spectator);
			room.sendCurrentDuelHistoricalMessages(spectator);
			return;
		}

		// MercuryReconnect.run(playerAlreadyInRoom, room, socket);
	}

	private handleGameMessage(
		message: ClientMessage,
		room: MercuryRoom,
		player: MercuryClient,
	): void {
		player.logger.info(
			`MercuryDuelingState: GAME_MSG: ${message.raw.toString("hex")}`,
		);
		if (player.isReconnecting) {
			return;
		}
		const coreMessageType = message.raw.readInt8(3);

		if (coreMessageType !== 1) {
			player.logger.debug(
				`last message ${player.name} ${message.raw.toString("hex")}`,
			);
			player.setLastMessage(message.raw);
		}

		if (player.position === 0) {
			this.processDuelMessage(coreMessageType, message.data, room);
		}

		if (coreMessageType === CoreMessages.MSG_WIN && !room.isMatchFinished()) {
			const winner = room.firstToPlay ^ message.raw.readInt8(4);

			room.duelWinner(winner);

			WebSocketSingleton.getInstance().broadcast({
				action: "UPDATE-ROOM",
				data: room.toRealTimePresentation(),
			});

			if (room.isMatchFinished()) {
				this.eventBus.publish(
					GameOverDomainEvent.DOMAIN_EVENT,
					new GameOverDomainEvent({
						bestOf: room.bestOf,
						players: room.matchPlayersHistory,
						date: new Date(),
						banListHash: room.edoBanListHash,
						ranked: room.ranked,
					}),
				);

				WebSocketSingleton.getInstance().broadcast({
					action: "REMOVE-ROOM",
					data: room.toRealTimePresentation(),
				});
			}
		}
	}

	private handleFieldFinish(
		_message: ClientMessage,
		_room: MercuryRoom,
		player: MercuryClient,
	): void {
		if (player.cache) {
			player.socket.send(player.cache);
			player.clearReconnecting();
		}
	}

	private handleUpdateDeck(
		_message: ClientMessage,
		_room: MercuryRoom,
		player: MercuryClient,
	): void {
		player.logger.info("MercuryDuelingState: UPDATE_DECK");
		player.sendToCore(Buffer.from([0x01, 0x00, 0x30]));
	}

	private handleTimeConfirm(
		_message: ClientMessage,
		_room: MercuryRoom,
		player: MercuryClient,
	): void {
		player.logger.info("MercuryDuelingState: TIME_CONFIRM");
	}

	private handleTimeLimit(
		_message: ClientMessage,
		_room: MercuryRoom,
		player: MercuryClient,
	): void {
		player.logger.info("MercuryDuelingState: TIME_LIMIT");
	}

	private handleChangeSide(
		_message: ClientMessage,
		room: MercuryRoom,
		player: MercuryClient,
	): void {
		player.logger.info("MercuryDuelingState: CHANGE_SIDE");

		if (room.duelState === DuelState.DUELING) {
			room.sideDecking();

			return;
		}
	}

	private handleResponse(
		message: ClientMessage,
		room: MercuryRoom,
		player: MercuryClient,
	): void {
		player.logger.info("MercuryDuelingState: handleResponse");

		// Validar que hay una respuesta esperada y el jugador es el correcto
		// if (
		// 	this.ocgCore.currentResponsePosition === null ||
		// 	player !== this.getResponsePlayer(room, player) ||
		// 	!this.ocgCore.hasOcgcore()
		// ) {
		// 	return;
		// }

		const responsePosition = this.ocgCore.currentResponsePosition;
		const responseBuffer = Buffer.from(message.data);

		// Guardar respuesta en el record (si existe)
		room.addResponse(responseBuffer);

		// Limpiar timer si hay límite de tiempo
		if (this.ocgCore.timeLimitEnabled) {
			this.ocgCore.clearResponseTimerState(true);
		}

		// Limpiar estado de respuesta
		this.ocgCore.clearResponseState();

		// Enviar respuesta al OCGCore y avanzar
		this.ocgCore
			.setResponse(responseBuffer)
			.then(() => {
				this.ocgCore.advance();
			})
			.catch((error) => {
				player.logger.error("Failed to set response in ocgcore", { error });
				room.setDuelFinished();
			});
	}

	private getResponsePlayer(
		room: MercuryRoom,
		_player: MercuryClient,
	): MercuryClient | null {
		// TODO: Retornar el jugador que debe responder según responsePosition
		// Por ahora retornamos el primer jugador
		const clients = room.clients as MercuryClient[];
		return clients.length > 0 ? clients[0] : null;
	}
}
