import { EventEmitter } from "stream";

import genesys from "genesys.json";

import { UserAuth } from "@shared/user-auth/application/UserAuth";
import { UserProfile } from "@shared/user-profile/domain/UserProfile";

import { PlayerInfoMessage } from "@edopro/messages/client-to-server/PlayerInfoMessage";
import { RoomState } from "@edopro/room/domain/RoomState";

import { Commands } from "@shared/messages/Commands";
import { ClientMessage } from "@shared/messages/MessageProcessor";
import { YgoClient } from "@shared/client/domain/YgoClient";
import { Logger } from "@shared/logger/domain/Logger";
import { ISocket } from "@shared/socket/domain/ISocket";

import { MercuryClient } from "../../../client/domain/MercuryClient";
import { YGOProRoom } from "../YGOProRoom";

import {
	ErrorMessageType,
	NetPlayerType,
	OcgcoreCommonConstants,
	YGOProCtosUpdateDeck,
	YGOProStocDuelStart,
} from "ygopro-msg-encode";
import YGOProDeck from "ygopro-deck-encode";

export class MercuryWaitingState extends RoomState {
	private readonly genesysMap = new Map(
		genesys.map((item) => [item.code.toString(), item.points]),
	);

	constructor(
		private readonly userAuth: UserAuth,
		eventEmitter: EventEmitter,
		private readonly logger: Logger,
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
				void this.tryStartHandler.bind(this)(message, room, client),
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

	private tryStartHandler(
		_message: ClientMessage,
		room: YGOProRoom,
		client: MercuryClient,
	): void {
		this.logger.info("TRY_START");

		if (!client.host) {
			return;
		}

		if (!room.allPlayersReady) {
			return
		}


		for (const player of [...room.players, ...room.spectators]) {
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
		room.mutex.runExclusive(() => {
			player.logger.info(`handleToObserver: ${message.data.toString("hex")}`);

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
		room.mutex.runExclusive(() => {
			player.logger.info("WaitingState: TO_DUEL");
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

		if (!player.isSpectator) {
			return;
		}

		const updateDeckMessage = new YGOProCtosUpdateDeck().fromPayload(message.data)
		const deck = await this.buildDeck(updateDeckMessage, room);

		//TODO: Validate Deck

		room.mutex.runExclusive(() => {
			room.setDecksToPlayerUnsafe(player.position, deck);
		});


		// if (!room.isGenesys) {
		// 	return;
		// }
		// const parser = new UpdateDeckMessageParser(message.data);
		// const [mainDeck, sideDeck] = parser.getDeck();
		// const deck = [...mainDeck, ...sideDeck];
		// const isValid = await this.validateGenesysDeck(deck, client, room);
		// if (!isValid) {
		// 	client.sendToCore(Buffer.from([0x01, 0x00, Commands.NOT_READY]));
		// }
	}

	private async handleNotReady(
		message: ClientMessage,
		room: YGOProRoom,
		client: MercuryClient,
	) {
		room.mutex.runExclusive(() => {
			client.logger.info(`MercuryWaitingState NOT_READY: ${message.data.toString("hex")}`);

			room.notReadyUnsafe(client);
		});
	}

	private async buildDeck(message: YGOProCtosUpdateDeck, room: YGOProRoom): Promise<YGOProDeck> {
		const deck = new YGOProDeck({
			main: [],
			extra: [],
			side: message.deck.side
		})

		for (const cardId of message.deck.main) {
			const card = await room.getCard(cardId);
			if (card?.type && card?.type & OcgcoreCommonConstants.TYPES_EXTRA_DECK) {
				deck.extra.push(cardId);
			} else {
				deck.main.push(cardId);
			}
		}

		return deck;
	}

	// private async validateGenesysDeck(
	// 	deck: number[],
	// 	client: MercuryClient,
	// 	room: YGOProRoom,
	// ): Promise<boolean> {
	// 	let points = 0;
	// 	for (const code of deck) {
	// 		const card = await room.cardRepository.findByCode(code.toString());
	// 		if (!card) {
	// 			this.logger.info(`Card with code ${code} not found`);
	// 			this.sendSystemErrorMessage(`Card with code ${code} not found`, client);
	// 			continue;
	// 		}

	// 		if (card.type & (CardTypes.TYPE_PENDULUM | CardTypes.TYPE_LINK)) {
	// 			client.sendMessageToClient(
	// 				new BanListDeckError(Number(card.code)).buffer(),
	// 			);
	// 			this.sendSystemErrorMessage(
	// 				`Pendulum and link cards not allowed: ${card.code}`,
	// 				client,
	// 			);

	// 			return false;
	// 		}

	// 		if (card.variant === 8) {
	// 			client.sendMessageToClient(
	// 				new BanListDeckError(Number(card.code)).buffer(),
	// 			);
	// 			this.sendSystemErrorMessage(
	// 				`Unofficial cards not alloweds: ${card.code}`,
	// 				client,
	// 			);

	// 			return false;
	// 		}

	// 		const cardPoints =
	// 			this.genesysMap.get(card.code) ??
	// 			(card.alias ? this.genesysMap.get(card.alias) : 0) ??
	// 			0;

	// 		points = points + cardPoints;
	// 	}

	// 	if (points > room.hostInfo.max_deck_points) {
	// 		this.sendSystemErrorMessage(
	// 			`Deck points limit exceeded: ${points} of ${room.hostInfo.max_deck_points}`,
	// 			client,
	// 		);
	// 		client.sendMessageToClient(
	// 			new MainDeckLimitError(
	// 				points,
	// 				0,
	// 				room.hostInfo.max_deck_points,
	// 			).buffer(),
	// 		);

	// 		return false;
	// 	}

	// 	this.sendSystemMessage(
	// 		`Genesys deck valid: ${points} / ${room.hostInfo.max_deck_points}`,
	// 		client,
	// 	);

	// 	return true;
	// }
}
