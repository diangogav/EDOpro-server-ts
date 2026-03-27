

import { EventEmitter } from "stream";

import { PlayerInfoMessage } from "../../../../edopro/messages/client-to-server/PlayerInfoMessage";
import { Commands } from "../../../../edopro/messages/domain/Commands";
import { ClientMessage } from "../../../../edopro/messages/MessageProcessor";
import { SideDeckClientMessage } from "../../../../edopro/messages/server-to-client/game-messages/SideDeckClientMessage";
import { Room } from "../../../../edopro/room/domain/Room";
import { RoomState } from "../../../../edopro/room/domain/RoomState";
import { Logger } from "../../../../shared/logger/domain/Logger";
import { DuelStartClientMessage } from "../../../../shared/messages/server-to-client/DuelStartClientMessage";
import { ISocket } from "../../../../shared/socket/domain/ISocket";
import { MercuryClient } from "../../../client/domain/MercuryClient";
import { MercuryRoom } from "../MercuryRoom";
import { ErrorMessageType, NetPlayerType, OcgcoreCommonConstants, YGOProCtosUpdateDeck, YGOProStocChangeSide, YGOProStocDuelStart, YGOProStocErrorMsg, YGOProStocSelectTp, YGOProStocWaitingSide } from "ygopro-msg-encode";
import YGOProDeck from "ygopro-deck-encode";
import { checkChangeSide } from "src/mercury/utils/check-deck";

export class MercurySideDeckingState extends RoomState {
	constructor(eventEmitter: EventEmitter, private readonly logger: Logger) {
		super(eventEmitter);
		this.logger = logger.child({ file: "MercurySideDeckingState" });
		this.eventEmitter.on(
			"JOIN",
			(message: ClientMessage, room: MercuryRoom, socket: ISocket) =>
				void this.handleJoin.bind(this)(message, room, socket)
		);

		this.eventEmitter.on(
			Commands.UPDATE_DECK as unknown as string,
			(message: ClientMessage, room: MercuryRoom, client: MercuryClient) =>
				void this.handleUpdateDeck.bind(this)(message, room, client)
		);

		this.eventEmitter.on(
			Commands.READY as unknown as string,
			(message: ClientMessage, room: Room, client: MercuryClient) =>
				this.handleReady.bind(this)(message, room, client)
		);
	}

	private handleJoin(message: ClientMessage, room: MercuryRoom, socket: ISocket): void {
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
			spectator.sendMessageToClient(Buffer.from(new YGOProStocWaitingSide().toFullPayload()))

			return;
		}

		room.reconnect(playerAlreadyInRoom, socket);
		playerAlreadyInRoom.sendMessageToClient(Buffer.from(new YGOProStocDuelStart().toFullPayload()));
		if (!playerAlreadyInRoom.deck) {
			playerAlreadyInRoom.sendMessageToClient(Buffer.from(new YGOProStocChangeSide().toFullPayload()));
		}

	}

	private handleReady(_message: ClientMessage, room: MercuryRoom, player: MercuryClient): void {
		player.logger.info("MercurySideDeckingState: READY");
		if (!player.isReconnecting) {
			return;
		}

		player.socket.send(DuelStartClientMessage.create());

		const message = SideDeckClientMessage.create();
		player.socket.send(message);

		player.clearReconnecting();
	}

	private async handleUpdateDeck(message: ClientMessage, room: MercuryRoom, player: MercuryClient): Promise<void> {
		player.logger.info(
			`MercuryWaitingState UPDATE_DECK: ${message.data.toString("hex")}`,
		);

		if (player.position === NetPlayerType.OBSERVER) {
			return;
		}

		const updateDeckMessage = new YGOProCtosUpdateDeck().fromPayload(message.data)
		const deck = await this.buildDeck(updateDeckMessage, room);
		const isValid = checkChangeSide(player.deck!, deck);
		if (!isValid) {
			const message = new YGOProStocErrorMsg().fromPartial({
				msg: ErrorMessageType.SIDEERROR,
				code: 0,
			})
			player.sendMessageToClient(Buffer.from(message.toFullPayload()));
			return;
		}


		room.setDecksToPlayerUnsafe(player.position, deck);
		player.ready();
		player.sendMessageToClient(Buffer.from(new YGOProStocDuelStart().toFullPayload()));

		const allReady = room.clients.every((_client) => _client.isReady);
		if (!allReady) {
			return;
		}

		const selectTPMessage = new YGOProStocSelectTp();
		(room.clientWhoChoosesTurn as MercuryClient).sendMessageToClient(
			Buffer.from(selectTPMessage.toFullPayload()),
		);
		room.choosingOrder();
	}

	private async buildDeck(message: YGOProCtosUpdateDeck, room: MercuryRoom): Promise<YGOProDeck> {
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

}
