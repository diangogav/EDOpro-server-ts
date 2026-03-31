import { EventEmitter } from "stream";

import { UserAuth } from "@shared/user-auth/application/UserAuth";
import { UserProfile } from "@shared/user-profile/domain/UserProfile";

import { PlayerInfoMessage } from "@edopro/messages/client-to-server/PlayerInfoMessage";

import { Commands } from "@shared/messages/Commands";
import { ClientMessage } from "@shared/messages/MessageProcessor";
import { YgoClient } from "@shared/client/domain/YgoClient";
import { Logger } from "@shared/logger/domain/Logger";
import { ISocket } from "@shared/socket/domain/ISocket";

import { MercuryClient } from "../../../client/domain/MercuryClient";
import { YGOProRoom } from "../YGOProRoom";

import {
	ErrorMessageType,
	YGOProCtosUpdateDeck,
} from "ygopro-msg-encode";
import { YGOProDeckCreator } from "@ygopro/deck/application/YGOProDeckCreator";
import { MercuryDeckValidator } from "@ygopro/deck/domain/MercuryDeckValidator";
import { YGOProRoomState } from "../YGOProRoomState";

export class YGOProWaitingState extends YGOProRoomState {
	constructor(
		private readonly userAuth: UserAuth,
		eventEmitter: EventEmitter,
		private readonly logger: Logger,
		private readonly deckCreator: YGOProDeckCreator,
		private readonly deckValidator: MercuryDeckValidator,
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
			(message: ClientMessage, room: YGOProRoom, client: MercuryClient) =>
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
					client as MercuryClient,
				),
		);
		this.eventEmitter.on(
			Commands.NOT_READY as unknown as string,
			(message: ClientMessage, room: YGOProRoom, client: YgoClient) =>
				void this.handleNotReady.bind(this)(
					message,
					room,
					client as MercuryClient,
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
			const place = room.calculatePlaceUnsafe();

			if (!place) {
				const spectator = room.createSpectatorUnsafe(socket, playerInfoMessage.name);
				room.addSpectatorUnsafe(spectator);

				return;
			}

			let userId: string | null = null;

			if (room.ranked) {
				const user = await this.userAuth.run(playerInfoMessage);
				if (!(user instanceof UserProfile)) {
					socket.send(room.messageSender.errorMessage(ErrorMessageType.JOINERROR));

					return null;
				}
				userId = user.id;
			}

			const player = room.createPlayerUnsafe(socket, playerInfoMessage.name, userId);
			if (!player) {
				const spectator = room.createSpectatorUnsafe(socket, playerInfoMessage.name);
				room.addSpectatorUnsafe(spectator);

				return;
			}

			room.addPlayerUnsafe(player);
		})
	}

	private handleTryStart(
		_message: ClientMessage,
		room: YGOProRoom,
		player: MercuryClient,
	): void {
		player.logger.info("handleTryStart");

		if (!player.host) {
			return;
		}

		if (!room.allPlayersReady) {
			return
		}


		for (const player of room.clients) {
			(player as MercuryClient).sendMessageToClient(room.messageSender.duelStartMessage());
			room.sendDeckCountMessage(player as MercuryClient);
		}

		this.toRPS(room);
		room.createMatch();
		room.rps();
	}

	private handleToObserver(
		message: ClientMessage,
		room: YGOProRoom,
		player: MercuryClient,
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
		player: MercuryClient,
	): void {
		player.logger.info("handleToDuel");

		room.mutex.runExclusive(() => {
			if (player.isSpectator) {
				room.spectatorToPlayerUnsafe(player);

				return;
			}

			room.movePlayerToAnotherCellUnsafe(player);
		});
	}

	private async handleUpdateDeck(
		message: ClientMessage,
		room: YGOProRoom,
		player: MercuryClient,
	): Promise<void> {
		player.logger.info(
			`handleUpdateDeck: ${message.data.toString("hex")}`,
		);

		const updateDeckMessage = new YGOProCtosUpdateDeck().fromPayload(message.data);
		if (player.isSpectator) {
			return;
		}

		const deck = await this.deckCreator.build({
			main: updateDeckMessage.deck.main,
			side: updateDeckMessage.deck.side,
			banListHash: room.banListHash,
		});

		const hasError = room.shouldValidateDeck() && this.deckValidator.validate(deck);
		if (hasError) {
			this.logger.warn(`Deck has an error: type ${hasError.type}, code ${hasError.code}`);
			room.notReadyUnsafe(player);
			room.messageSender.errorMessage(ErrorMessageType.DECKERROR, hasError.type);
			return;
		}

		room.mutex.runExclusive(() => {
			room.setDecksToPlayerUnsafe(player.position, deck);
		});
	}

	private async handleNotReady(
		message: ClientMessage,
		room: YGOProRoom,
		player: MercuryClient,
	) {
		player.logger.info(`handleNotReady: ${message.data.toString("hex")}`);

		room.mutex.runExclusive(() => {

			room.notReadyUnsafe(player);
		});
	}
}
