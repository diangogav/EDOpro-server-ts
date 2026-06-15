import { EventEmitter } from "stream";

import { PlayerInfoMessage } from "@edopro/messages/client-to-server/PlayerInfoMessage";

import { Commands } from "@shared/messages/Commands";
import { ClientMessage } from "@shared/messages/MessageProcessor";
import { YgoClient } from "@shared/client/domain/YgoClient";
import { Logger } from "@shared/logger/domain/Logger";
import { ISocket } from "@shared/socket/domain/ISocket";
import { ReconnectionTokenIssuer } from "@shared/room/application/reconnect/ReconnectionTokenIssuer";

import { YGOProClient } from "../../../client/domain/YGOProClient";
import { YGOProRoom } from "../YGOProRoom";
import { AdmitToRoom } from "@ygopro/room/admission/application/AdmitToRoom";

import {
	ErrorMessageType,
	YGOProCtosUpdateDeck,
} from "ygopro-msg-encode";
import { YGOProDeckCreator } from "@ygopro/deck/application/YGOProDeckCreator";
import { YGOProDeckValidator } from "@ygopro/deck/domain/YGOProDeckValidator";
import { DeckError } from "@shared/deck/domain/errors/DeckError";
import { encodeDeckErrorCode } from "@shared/deck/domain/errors/encodeDeckErrorCode";
import { YGOProRoomState } from "../YGOProRoomState";
import MercuryBanListMemoryRepository from "@ygopro/ban-list/infrastructure/YGOProBanListMemoryRepository";

export class YGOProWaitingState extends YGOProRoomState {
	constructor(
		private readonly admitToRoom: AdmitToRoom,
		eventEmitter: EventEmitter,
		private readonly logger: Logger,
		private readonly deckCreator: YGOProDeckCreator,
		private readonly deckValidator: YGOProDeckValidator,
	) {
		super(eventEmitter);
		this.logger = logger.child({ file: "MercuryWaitingState" });
		this.eventEmitter.on(
			"JOIN",
			(message: ClientMessage, room: YGOProRoom, socket: ISocket) =>
				void this.handleJoin.bind(this)(message, room, socket),
		);
		this.eventEmitter.on(
			Commands.TRY_START as unknown as string,
			(message: ClientMessage, room: YGOProRoom, client: YGOProClient) =>
				void this.handleTryStart.bind(this)(message, room, client),
		);
		this.eventEmitter.on(
			Commands.OBSERVER as unknown as string,
			(message: ClientMessage, room: YGOProRoom, client: YgoClient) =>
				void this.handleToObserver.bind(this)(message, room, client),
		);
		this.eventEmitter.on(
			Commands.TO_DUEL as unknown as string,
			(message: ClientMessage, room: YGOProRoom, client: YgoClient) =>
				void this.handleToDuel.bind(this)(message, room, client),
		);
		this.eventEmitter.on(
			Commands.UPDATE_DECK as unknown as string,
			(message: ClientMessage, room: YGOProRoom, client: YgoClient) =>
				void this.handleUpdateDeck.bind(this)(
					message,
					room,
					client as YGOProClient,
				),
		);
		this.eventEmitter.on(
			Commands.NOT_READY as unknown as string,
			(message: ClientMessage, room: YGOProRoom, client: YgoClient) =>
				void this.handleNotReady.bind(this)(
					message,
					room,
					client as YGOProClient,
				),
		);
	}

	private async handleJoin(
		message: ClientMessage,
		room: YGOProRoom,
		socket: ISocket,
	): Promise<void> {
		this.logger.info(`handleJoin: ${message.data.toString("hex")}`);

		this.validateVersion(message.data, socket);

		const playerInfoMessage = new PlayerInfoMessage(
			message.previousMessage,
			message.data.length,
		);
		if (this.playerAlreadyInRoom(playerInfoMessage, room, socket)) {
			this.sendExistingPlayerErrorMessage(playerInfoMessage, socket);
			return;
		}

		await room.mutex.runExclusive(async () => {
			await this.admitToRoom.run(
				socket,
				playerInfoMessage,
				room.admissionTarget(socket, playerInfoMessage),
			);
		});
	}

	private handleTryStart(
		_message: ClientMessage,
		room: YGOProRoom,
		player: YGOProClient,
	): void {
		player.logger.info("handleTryStart");

		if (!player.host) {
			return;
		}

		if (!room.allPlayersReady) {
			return
		}


		for (const player of room.clients) {
			(player as YGOProClient).sendMessageToClient(room.messageSender.duelStartMessage());
			room.sendDeckCountMessage(player as YGOProClient);
		}

		// Issue a per-player reconnection token at match start so every duel phase
		// (RPS, choosing order, dueling, side-decking) supports token reconnect.
		// WindBot rooms (noReconnect) are skipped — bots never reconnect.
		if (!room.noReconnect) {
			for (const player of room.players as YGOProClient[]) {
				player.sendMessageToClient(ReconnectionTokenIssuer.issue(player, room.id));
			}
		}

		this.toRPS(room);
		room.createMatch();
		room.rps();
	}

	private handleToObserver(
		message: ClientMessage,
		room: YGOProRoom,
		player: YGOProClient,
	): void {
		player.logger.info(`handleToObserver: ${message.data.toString("hex")}`);

		room.mutex.runExclusive(() => {
			if (player.isSpectator) {
				return;
			}

			if (!player.host) {
				room.playerToSpectatorUnsafe(player);
			}
		});
	}

	private handleToDuel(
		_message: ClientMessage,
		room: YGOProRoom,
		player: YGOProClient,
	): void {
		player.logger.info("handleToDuel");

		room.mutex.runExclusive(() => {
			if (player.isSpectator) {
				// Taking a seat always passes admission: a spectator may only sit if
				// the room's league accepts how it authenticated. A wrong-league
				// spectator stays in the stands (closes the escalation through the
				// stands door, mirroring the JOIN door).
				const credential = player.credential ?? { kind: "guest" as const, name: player.name };
				if (!room.league.admitsAsPlayer(credential)) {
					return;
				}
				room.spectatorToPlayerUnsafe(player);

				return;
			}

			room.movePlayerToAnotherCellUnsafe(player);
		});
	}

	private async handleUpdateDeck(
		message: ClientMessage,
		room: YGOProRoom,
		player: YGOProClient,
	): Promise<void> {
		player.logger.info(
			`handleUpdateDeck: ${message.data.toString("hex")}`,
		);

		const updateDeckMessage = new YGOProCtosUpdateDeck().fromPayload(message.data);
		if (player.isSpectator) {
			return;
		}

		const deckOrError = await this.deckCreator.build({
			main: updateDeckMessage.deck.main,
			side: updateDeckMessage.deck.side,
			banListHash: room.banListHash,
		});

		if (deckOrError instanceof DeckError) {
			this.logger.warn(`Deck build error: type=0x${deckOrError.type.toString(16)}, code=${deckOrError.code}, rule=${room.hostInfo.rule}, extendedPool=${room.useExtendedCardPool}`);
			room.notReadyUnsafe(player);
			player.sendMessageToClient(room.messageSender.errorMessage(ErrorMessageType.DECKERROR, encodeDeckErrorCode(deckOrError.type, deckOrError.code)));
			return;
		}

		const deck = deckOrError;

		if (player.isInternal) {
			room.mutex.runExclusive(() => {
				room.setDecksToPlayerUnsafe(player.position, deck);
			});
			return;
		}

		const hasError = room.shouldValidateDeck() && this.deckValidator.validate(deck);
		if (hasError) {
			const failedCard = deck.allCards.find((c) => Number(c.code) === hasError.code);
			this.logger.warn(`Deck validation error: type=0x${hasError.type.toString(16)}, code=${hasError.code}, cardOt=${failedCard?.variant ?? "N/A"}, rule=${room.hostInfo.rule}, extendedPool=${room.useExtendedCardPool}`);
			room.notReadyUnsafe(player);
			player.sendMessageToClient(room.messageSender.errorMessage(ErrorMessageType.DECKERROR, encodeDeckErrorCode(hasError.type, hasError.code)));
			return;
		}

		room.mutex.runExclusive(() => {
			room.setDecksToPlayerUnsafe(player.position, deck);
		});
	}

	private async handleNotReady(
		message: ClientMessage,
		room: YGOProRoom,
		player: YGOProClient,
	) {
		player.logger.info(`handleNotReady: ${message.data.toString("hex")}`);

		room.mutex.runExclusive(() => {

			room.notReadyUnsafe(player);
		});
	}
}
