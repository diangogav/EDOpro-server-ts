import { EventEmitter } from "stream";

import { PlayerInfoMessage } from "@edopro/messages/client-to-server/PlayerInfoMessage";
import { RoomState } from "@edopro/room/domain/RoomState";

import { YGOProDeckCreator } from "@ygopro/deck/application/YGOProDeckCreator";
import { YGOProDeckValidator } from "@ygopro/deck/domain/YGOProDeckValidator";
import { DeckError } from "@shared/deck/domain/errors/DeckError";

import { Commands } from "@shared/messages/Commands";
import { ClientMessage } from "@shared/messages/MessageProcessor";
import { Logger } from "@shared/logger/domain/Logger";
import { ISocket } from "../../../../shared/socket/domain/ISocket";

import { YGOProClient } from "../../../client/domain/YGOProClient";
import { YGOProRoom } from "../YGOProRoom";
import { config } from "../../../../config";
import {
	ChatColor,
	ErrorMessageType,
	YGOProCtosUpdateDeck,
	YGOProStocChat,
	YGOProStocDuelStart,
	YGOProStocWaitingSide,
} from "ygopro-msg-encode";

const SIDE_TIMEOUT_MINUTES = config.sideTimeoutMinutes;
const TICK_INTERVAL_MS = 60_000;

export class YGOProSideDeckingState extends RoomState {
	private readonly playerTimers = new Map<number, NodeJS.Timeout>();
	private readonly playerRemainMinutes = new Map<number, number>();

	constructor(
		eventEmitter: EventEmitter,
		private readonly logger: Logger,
		private readonly deckCreator: YGOProDeckCreator,
		private readonly deckValidator: YGOProDeckValidator,
		private readonly room: YGOProRoom,
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
			(message: ClientMessage, room: YGOProRoom, client: YGOProClient) =>
				void this.handleUpdateDeck.bind(this)(message, room, client)
		);

		this.startTimeouts();
	}

	private startTimeouts(): void {
		if (SIDE_TIMEOUT_MINUTES <= 0) {
			return;
		}

		for (const player of this.room.players as YGOProClient[]) {
			this.startPlayerTimeout(player);
		}
	}

	private startPlayerTimeout(player: YGOProClient): void {
		this.playerRemainMinutes.set(player.position, SIDE_TIMEOUT_MINUTES);

		this.sendChatToPlayer(
			player,
			`You have ${SIDE_TIMEOUT_MINUTES} minute(s) to submit your side deck.`,
			ChatColor.BABYBLUE,
		);

		const timer = setInterval(() => {
			this.tickPlayerTimeout(player);
		}, TICK_INTERVAL_MS);

		this.playerTimers.set(player.position, timer);
	}

	private tickPlayerTimeout(player: YGOProClient): void {
		const remain = this.playerRemainMinutes.get(player.position);
		if (remain === undefined) {
			this.clearPlayerTimeout(player.position);
			return;
		}

		if (remain <= 1) {
			this.clearPlayerTimeout(player.position);
			this.logger.info("Side deck timeout", { player: player.name, position: player.position });

			this.broadcastChat(
				`${player.name} has been disconnected for not submitting a side deck in time.`,
				ChatColor.BABYBLUE,
			);
			this.sendChatToPlayer(player, "Time is up! You have been disconnected.", ChatColor.RED);
			player.destroy();
			return;
		}

		const nextRemain = remain - 1;
		this.playerRemainMinutes.set(player.position, nextRemain);

		this.sendChatToPlayer(
			player,
			`${nextRemain} minute(s) remaining to submit your side deck.`,
			ChatColor.BABYBLUE,
		);
	}

	private clearPlayerTimeout(position: number): void {
		const timer = this.playerTimers.get(position);
		if (timer) {
			clearInterval(timer);
			this.playerTimers.delete(position);
		}
		this.playerRemainMinutes.delete(position);
	}

	private clearAllTimeouts(): void {
		for (const [position] of this.playerTimers) {
			this.clearPlayerTimeout(position);
		}
	}

	override removeAllListener(): void {
		this.clearAllTimeouts();
		super.removeAllListener();
	}

	private sendChatToPlayer(player: YGOProClient, msg: string, color: ChatColor): void {
		const chatMsg = new YGOProStocChat().fromPartial({
			player_type: color,
			msg,
		});
		player.sendMessageToClient(Buffer.from(chatMsg.toFullPayload()));
	}

	private broadcastChat(msg: string, color: ChatColor): void {
		const chatMsg = new YGOProStocChat().fromPartial({
			player_type: color,
			msg,
		});
		const buffer = Buffer.from(chatMsg.toFullPayload());
		for (const client of this.room.clients as YGOProClient[]) {
			client.sendMessageToClient(buffer);
		}
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

		if (!(playerAlreadyInRoom instanceof YGOProClient)) {
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

	private async handleUpdateDeck(message: ClientMessage, room: YGOProRoom, player: YGOProClient): Promise<void> {
		player.logger.info(
			`handleUpdateDeck: ${message.data.toString("hex")}`,
		);

		if (player.isSpectator) {
			return;
		}

		const updateDeckMessage = new YGOProCtosUpdateDeck().fromPayload(message.data);
		if (!player.deck.isSideDeckValid(updateDeckMessage.deck.main, updateDeckMessage.deck.side)) {
			player.sendMessageToClient(room.messageSender.errorMessage(ErrorMessageType.SIDEERROR, 0));
			return;
		}

		const deckOrError = await this.deckCreator.build({
			main: updateDeckMessage.deck.main,
			side: updateDeckMessage.deck.side,
			banListHash: room.banListHash,
		});

		if (deckOrError instanceof DeckError) {
			this.logger.warn(`Deck build error: type ${deckOrError.type}, code ${deckOrError.code}`);
			room.notReadyUnsafe(player);
			player.sendMessageToClient(room.messageSender.errorMessage(ErrorMessageType.DECKERROR, deckOrError.type));
			return;
		}

		const deck = deckOrError;
		const hasError = room.shouldValidateDeck() && this.deckValidator.validate(deck);
		if (hasError) {
			this.logger.warn(`Deck has an error: type ${hasError.type}, code ${hasError.code}`);
			room.notReadyUnsafe(player);
			player.sendMessageToClient(room.messageSender.errorMessage(ErrorMessageType.DECKERROR, hasError.type));
			return;
		}

		room.setDecksToPlayerUnsafe(player.position, deck);
		player.ready();
		this.clearPlayerTimeout(player.position);
		player.sendMessageToClient(room.messageSender.duelStartMessage());

		const allReady = room.players.every((_client) => _client.isReady);
		if (!allReady) {
			return;
		}

		this.clearAllTimeouts();
		(room.clientWhoChoosesTurn as YGOProClient).sendMessageToClient(room.messageSender.selectTpMessage());

		room.choosingOrder();
	}
}
