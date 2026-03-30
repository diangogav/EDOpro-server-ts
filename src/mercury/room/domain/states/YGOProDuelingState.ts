import { EventEmitter } from "events";

import { PlayerInfoMessage } from "@edopro/messages/client-to-server/PlayerInfoMessage";
import { RoomState } from "@edopro/room/domain/RoomState";

import { OCGCore } from "@ygopro/ocgcore-worker/ocgcore";

import { container } from "@shared/dependency-injection";
import { EventBus } from "@shared/event-bus/EventBus";
import { Commands } from "@shared/messages/Commands";
import { ClientMessage } from "@shared/messages/MessageProcessor";
import { Logger } from "@shared/logger/domain/Logger";
import { ISocket } from "@shared/socket/domain/ISocket";
import { Team } from "@shared/room/Team";

import { MercuryClient } from "../../../client/domain/MercuryClient";
import { YGOProRoom } from "../YGOProRoom";
import { getMessageIdentifier } from "../../../utils/response-time-utils";

import {
	OcgcoreScriptConstants,
	YGOProCtosUpdateDeck,
	YGOProMsgStart,
	YGOProMsgWin,
	YGOProStocChangeSide,
	YGOProStocDuelStart,
	YGOProStocGameMsg,
	YGOProStocWaitingSide,
} from "ygopro-msg-encode";

export class YGOProDuelingState extends RoomState {
	private readonly eventBus: EventBus;
	private readonly ocgCore: OCGCore;

	constructor(
		private readonly room: YGOProRoom,
		eventEmitter: EventEmitter,
		private readonly logger: Logger,
	) {
		super(eventEmitter);
		this.logger = logger.child({ file: "MercuryDuelingState" });
		this.ocgCore = new OCGCore(this.room, this.logger);
		this.handle();
		this.eventBus = container.get(EventBus);

		this.eventEmitter.on(
			"JOIN",
			(message: ClientMessage, room: YGOProRoom, socket: ISocket) =>
				void this.handleJoin.bind(this)(message, room, socket),
		);

		this.eventEmitter.on(
			Commands.UPDATE_DECK as unknown as string,
			(message: ClientMessage, room: YGOProRoom, socket: ISocket) =>
				void this.handleUpdateDeck.bind(this)(message, room, socket),
		);

		this.eventEmitter.on(
			Commands.RESPONSE as unknown as string,
			(message: ClientMessage, room: YGOProRoom, client: MercuryClient) =>
				void this.handleResponse.bind(this)(message, room, client),
		);
	}

	private async handle(): Promise<void> {
		this.logger.info("handle");

		const duelRecord = await this.ocgCore.init();
		this.room.addDuelRecord(duelRecord);
		this.ocgCore.resetResponseRequestState();

		this.ocgCore.messageMiddleware.on(
			YGOProMsgWin,
			(msg) => {
				this.logger.info(`Winner: player=${msg.player}, type=${msg.type}`);
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
				team: Team.PLAYER,
				location: OcgcoreScriptConstants.LOCATION_DECK,
			}),
			this.ocgCore.queryFieldCount({
				team: Team.PLAYER,
				location: OcgcoreScriptConstants.LOCATION_EXTRA,
			}),
			this.ocgCore.queryFieldCount({
				team: Team.OPPONENT,
				location: OcgcoreScriptConstants.LOCATION_DECK,
			}),
			this.ocgCore.queryFieldCount({
				team: Team.OPPONENT,
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

		const player0Players = this.ocgCore.getPlayersAtIngamePosition(Team.PLAYER);
		const player1Players = this.ocgCore.getPlayersAtIngamePosition(Team.OPPONENT);
		const player0StartMessage = createStartMsg(Team.PLAYER);
		const player1StartMessage = createStartMsg(Team.OPPONENT);

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
			player: Team.PLAYER,
			location: OcgcoreScriptConstants.LOCATION_EXTRA,
		});
		this.ocgCore.refreshZones({
			player: Team.OPPONENT,
			location: OcgcoreScriptConstants.LOCATION_EXTRA,
		});

		this.ocgCore.advance();
	}

	private handleJoin(
		message: ClientMessage,
		room: YGOProRoom,
		socket: ISocket,
	): void {
		this.logger.info("handleJoin");

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

	private async handleUpdateDeck(
		message: ClientMessage,
		_room: YGOProRoom,
		player: MercuryClient,
	): Promise<void> {
		player.logger.info("handleUpdateDeck");
		if (!player.isReconnecting || !player.deck) {
			return;
		}

		const updateDeckMessage = new YGOProCtosUpdateDeck().fromPayload(
			message.data,
		);

		const completeIncomingDeck = [...updateDeckMessage.deck.main, ...updateDeckMessage.deck.side];
		const completeCurrentDeck = [
			...player.deck.main,
			...player.deck.side,
			...player.deck.extra,
		].map((item) => Number(item.code));

		if (completeCurrentDeck.length !== completeIncomingDeck.length) {
			const status = (player.position << 4) | 0x0a;
			player.sendMessageToClient(this.room.messageSender.playerChangeMessage(player.position, status));
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

	private async handleResponse(
		message: ClientMessage,
		room: YGOProRoom,
		player: MercuryClient,
	): Promise<void> {
		player.logger.info("handleResponse");

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

		const clients = [...this.room.players, ...this.room.spectators];

		const winMessage = new YGOProStocGameMsg().fromPartial({
			msg: new YGOProMsgWin().fromPartial(winMsg),
		});
		clients.forEach((_client: MercuryClient) => {
			_client.sendMessageToClient(Buffer.from(winMessage.toFullPayload()));
		});

		this.room.players.forEach((_client) => _client.notReady());

		this.room.sideDecking();

		if (!this.room.isMatchFinished()) {
			this.room.players.forEach((_client: MercuryClient) => {
				_client.sendMessageToClient(Buffer.from(new YGOProStocChangeSide().toFullPayload()))
			});

			this.room.spectators.forEach((_client: MercuryClient) => {
				_client.sendMessageToClient(Buffer.from(new YGOProStocWaitingSide().toFullPayload()))
			});

			if (winner === Team.PLAYER) {
				const looser = this.room.players.find(
					(_client: MercuryClient) => _client.position % this.room.team1 === Team.PLAYER && _client.team === Team.OPPONENT
				);
				if (looser && looser instanceof MercuryClient) {
					this.room.setClientWhoChoosesTurn(looser);
				}
			} else {
				const looser = this.room.players.find(
					(_client: MercuryClient) => _client.position % this.room.team0 === Team.PLAYER && _client.team === Team.PLAYER
				);
				if (looser && looser instanceof MercuryClient) {
					this.room.setClientWhoChoosesTurn(looser);
				}
			}
		}
	}
}

