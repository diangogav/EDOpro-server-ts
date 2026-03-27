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
import { getMessageIdentifier } from "../../../utils/response-time-utils";

import {
	OcgcoreScriptConstants,
	YGOProCtosUpdateDeck,
	YGOProMsgNewTurn,
	YGOProMsgStart,
	YGOProMsgWin,
	YGOProStocChangeSide,
	YGOProStocDuelStart,
	YGOProStocGameMsg,
	YGOProStocHsPlayerChange,
	YGOProStocReplay,
	YGOProStocWaitingSide,
} from "ygopro-msg-encode";
import { OCGCore } from "src/mercury/ocgcore-worker/ocgcore";
import { deckEquals } from "src/mercury/utils/deck-equals";
import { Team } from "src/shared/room/Team";

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
		this.ocgCore.resetResponseRequestState();

		this.ocgCore.messageMiddleware.on(
			YGOProMsgWin,
			(msg) => {
				this.logger.info(`Winner: player=${msg.player}, type=${msg.type}`);
				// Process win condition - update room state
				this.handleWinCondition(msg);
				return msg;
			},
			100,
		);

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

		// Use ingame position (considering swap) to match srvpro2 behavior
		const player0Players = this.ocgCore.getPlayersAtIngamePosition(0);
		const player1Players = this.ocgCore.getPlayersAtIngamePosition(1);
		const player0StartMessage = createStartMsg(0);
		const player1StartMessage = createStartMsg(1);

		player0Players.forEach((_player) => {
			_player.sendMessageToClient(
				Buffer.from(player0StartMessage.toFullPayload()),
			);
		});

		player1Players.forEach((_player) => {
			_player.sendMessageToClient(
				Buffer.from(player1StartMessage.toFullPayload()),
			);
		});

		const watcherStartMessage = createStartMsg(
			this.room.isPositionSwapped ? 0x11 : 0x10,
		);
		const spectators = this.room.spectators as MercuryClient[];
		spectators.forEach((spectator) => {
			spectator.sendMessageToClient(
				Buffer.from(watcherStartMessage.toFullPayload()),
			);
		});

		this.room.saveMessageToDuelRecord(watcherStartMessage.msg!);

		this.ocgCore.refreshZones({
			player: 0,
			location: OcgcoreScriptConstants.LOCATION_EXTRA,
		});
		this.ocgCore.refreshZones({
			player: 1,
			location: OcgcoreScriptConstants.LOCATION_EXTRA,
		});

		this.logger.info("advance core")
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

		const playerInfoMessage = new PlayerInfoMessage(
			message.previousMessage,
			message.data.length,
		);
		const playerAlreadyInRoom = this.playerAlreadyInRoom(
			playerInfoMessage,
			room,
			socket,
		);

		if (!(playerAlreadyInRoom instanceof MercuryClient)) {
			const spectator = room.createSpectatorUnsafe(
				socket,
				playerInfoMessage.name,
			);
			room.addSpectatorUnsafe(spectator);
			spectator.sendMessageToClient(
				Buffer.from(new YGOProStocDuelStart().toFullPayload()),
			);
			room.sendPreviousDuelsHistoricalMessages(spectator);
			room.sendCurrentDuelHistoricalMessages(spectator);
			return;
		}

		this.room.reconnect(playerAlreadyInRoom, socket);
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

	private async handleUpdateDeck(
		message: ClientMessage,
		_room: MercuryRoom,
		player: MercuryClient,
	): Promise<void> {
		player.logger.info("MercuryDuelingState: UPDATE_DECK");
		if (!player.isReconnecting || !player.deck) {
			return;
		}

		const updateDeckMessage = new YGOProCtosUpdateDeck().fromPayload(
			message.data,
		);

		if (!deckEquals(updateDeckMessage.deck, player.deck)) {
			const status = (player.position << 4) | 0x0a;
			const playerChangeMessage = new YGOProStocHsPlayerChange().fromPartial({
				playerPosition: player.position,
				playerState: status,
			});
			player.sendMessageToClient(
				Buffer.from(playerChangeMessage.toFullPayload()),
			);
			return;
		}

		player.sendMessageToClient(
			Buffer.from(new YGOProStocDuelStart().toFullPayload()),
		);
		this.ocgCore.sendStartMessageForReconnect(player);
		this.ocgCore.sendTurnMessages(player);
		this.ocgCore.sendPhaseMessage(player);
		await this.ocgCore.sendRequestFieldMessage(player);
		await this.ocgCore.sendRefreshZonesMessages(player);
		await this.ocgCore.sendDeckReversedAndTopMessages(player);
		await this.ocgCore.sendReconnectTimeLimitAndResponseState(player);
		player.clearReconnecting();
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

	private async handleResponse(
		message: ClientMessage,
		room: MercuryRoom,
		player: MercuryClient,
	): Promise<void> {
		player.logger.info("MercuryDuelingState: handleResponse");

		if (
			this.ocgCore.currentResponsePosition === null ||
			player !== this.ocgCore.responsePlayer ||
			!this.ocgCore.hasOcgcore()
		) {
			return;
		}

		const responsePosition = this.ocgCore.currentResponsePosition;
		const responseRequestMsg = this.ocgCore.currentLastResponseRequestMsg;
		const responseBuffer = Buffer.from(message.data);

		// Save response to duel record
		room.addResponse(responseBuffer);

		// Handle time limit compensation
		if (this.ocgCore.timeLimitEnabled) {
			this.ocgCore.clearResponseTimerState(true);
			const msgType = this.ocgCore.isRetryingState
				? 0x02 // MSG_RETRY
				: responseRequestMsg
					? getMessageIdentifier(responseRequestMsg)
					: 0;
			this.ocgCore.increaseResponseTime(
				responsePosition,
				msgType,
				responseBuffer,
			);
		}

		// Clear response request state (NOT responsePosition)
		this.ocgCore.clearResponseRequestState();

		// Send response to OCGCore and advance
		try {
			await this.ocgCore.setResponse(responseBuffer);
		} catch (error) {
			player.logger.error("Failed to set response in ocgcore", { error });
			room.setDuelFinished();

			return;
		}

		await this.ocgCore.advance();
	}

	private async handleWinCondition(winMsg: YGOProMsgWin): Promise<void> {
		this.logger.info(
			`handleWinCondition: player=${winMsg.player}, type=${winMsg.type}`,
		);

		const winner = this.ocgCore.toIngamePosition(winMsg.player)

		if (this.room.isFinished()) {
			return;
		}

		this.room.finished();

		this.room.duelWinner(winner);

		const clients = [...this.room.clients, ...this.room.spectators];

		const winMessage = new YGOProStocGameMsg().fromPartial({
			msg: new YGOProMsgWin().fromPartial(winMsg),
		});
		clients.forEach((_client: MercuryClient) => {
			_client.sendMessageToClient(Buffer.from(winMessage.toFullPayload()));
		});

		this.room.clients.forEach((_client) => _client.notReady());

		this.room.sideDecking();

		if (!this.room.isMatchFinished()) {
			this.room.clients.forEach((_client: MercuryClient) => {
				_client.sendMessageToClient(Buffer.from(new YGOProStocChangeSide().toFullPayload()))
			});

			this.room.spectators.forEach((_client: MercuryClient) => {
				_client.sendMessageToClient(Buffer.from(new YGOProStocWaitingSide().toFullPayload()))
			});

			if (winner === Team.PLAYER) {
				const looser = this.room.clients.find(
					(_client: MercuryClient) => _client.position % this.room.team1 === Team.PLAYER && _client.team === Team.OPPONENT
				);
				if (looser && looser instanceof MercuryClient) {
					this.room.setClientWhoChoosesTurn(looser);
				}
			} else {
				const looser = this.room.clients.find(
					(_client: MercuryClient) => _client.position % this.room.team0 === Team.PLAYER && _client.team === Team.PLAYER
				);
				if (looser && looser instanceof MercuryClient) {
					this.room.setClientWhoChoosesTurn(looser);
				}
			}
		}
	}
}

