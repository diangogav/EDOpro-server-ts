

import { EventEmitter } from "stream";

import { PlayerInfoMessage } from "@edopro/messages/client-to-server/PlayerInfoMessage";
import { RoomState } from "@edopro/room/domain/RoomState";

import { YGOProDeckCreator } from "@ygopro/deck/application/YGOProDeckCreator";
import { MercuryDeckValidator } from "@ygopro/deck/domain/MercuryDeckValidator";

import { Commands } from "@shared/messages/Commands";
import { ClientMessage } from "@shared/messages/MessageProcessor";
import { Logger } from "@shared/logger/domain/Logger";
import { ISocket } from "../../../../shared/socket/domain/ISocket";

import { MercuryClient } from "../../../client/domain/MercuryClient";
import { YGOProRoom } from "../YGOProRoom";
import { ErrorMessageType, YGOProCtosUpdateDeck, YGOProStocDuelStart, YGOProStocWaitingSide } from "ygopro-msg-encode";

export class YGOProSideDeckingState extends RoomState {
	constructor(
		eventEmitter: EventEmitter,
		private readonly logger: Logger,
		private readonly deckCreator: YGOProDeckCreator,
		private readonly deckValidator: MercuryDeckValidator,
	) {
		super(eventEmitter);
		this.logger = logger.child({ file: "MercurySideDeckingState" });
		this.eventEmitter.on(
			"JOIN",
			(message: ClientMessage, room: YGOProRoom, socket: ISocket) =>
				void this.handleJoin.bind(this)(message, room, socket)
		);

		this.eventEmitter.on(
			Commands.UPDATE_DECK as unknown as string,
			(message: ClientMessage, room: YGOProRoom, client: MercuryClient) =>
				void this.handleUpdateDeck.bind(this)(message, room, client)
		);
	}

	private handleJoin(message: ClientMessage, room: YGOProRoom, socket: ISocket): void {
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
			spectator.sendMessageToClient(Buffer.from(new YGOProStocWaitingSide().toFullPayload()))

			return;
		}

		room.reconnect(playerAlreadyInRoom, socket);
		playerAlreadyInRoom.sendMessageToClient(room.messageSender.duelStartMessage());
		if (!playerAlreadyInRoom.isReady) {
			playerAlreadyInRoom.sendMessageToClient(room.messageSender.changeSideMessage());
		}
		playerAlreadyInRoom.clearReconnecting();
	}

	private async handleUpdateDeck(message: ClientMessage, room: YGOProRoom, player: MercuryClient): Promise<void> {
		player.logger.info(
			`handleUpdateDeck: ${message.data.toString("hex")}`,
		);

		if (player.isSpectator) {
			return;
		}

		const updateDeckMessage = new YGOProCtosUpdateDeck().fromPayload(message.data);
		if (!player.deck.isSideDeckValid(updateDeckMessage.deck.main, updateDeckMessage.deck.side)) {
			room.messageSender.errorMessage(ErrorMessageType.SIDEERROR, 0);
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

		room.setDecksToPlayerUnsafe(player.position, deck);
		player.ready();
		player.sendMessageToClient(room.messageSender.duelStartMessage());

		const allReady = room.players.every((_client) => _client.isReady);
		if (!allReady) {
			return;
		}

		(room.clientWhoChoosesTurn as MercuryClient).sendMessageToClient(room.messageSender.selectTpMessage());

		room.choosingOrder();
	}
}
