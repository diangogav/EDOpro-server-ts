import { EventEmitter } from "stream";

import { PlayerInfoMessage } from "@edopro/messages/client-to-server/PlayerInfoMessage";

import { Commands } from "@shared/messages/Commands";
import { ClientMessage } from "@shared/messages/MessageProcessor";
import { YgoClient } from "@shared/client/domain/YgoClient";
import { Logger } from "@shared/logger/domain/Logger";
import { ISocket } from "@shared/socket/domain/ISocket";
import { ReconnectionTokenIssuer } from "@shared/room/application/reconnect/ReconnectionTokenIssuer";
import { isNameTaken } from "@shared/room/domain/isNameTaken";

import { YGOProClient } from "../../../client/domain/YGOProClient";
import { YGOProRoom } from "../YGOProRoom";
import { AdmitToRoom } from "@ygopro/room/admission/application/AdmitToRoom";

import {
	ChatColor,
	ErrorMessageType,
	YGOProCtosUpdateDeck,
	YGOProStocChat,
} from "ygopro-msg-encode";
import { YGOProDeckCreator } from "@ygopro/deck/application/YGOProDeckCreator";
import { YGOProDeckValidator } from "@ygopro/deck/domain/YGOProDeckValidator";
import { DeckError } from "@shared/deck/domain/errors/DeckError";
import { encodeDeckErrorCode } from "@shared/deck/domain/errors/encodeDeckErrorCode";
import { YGOProRoomState } from "../YGOProRoomState";
import MercuryBanListMemoryRepository from "@ygopro/ban-list/infrastructure/YGOProBanListMemoryRepository";
import { mercuryConfig } from "@ygopro/config";
import { YGOProJoinGameMessage } from "@ygopro/messages/YGOProJoinGameMessage";

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
				void this.handleUpdateDeck.bind(this)(message, room, client as YGOProClient),
		);
		this.eventEmitter.on(
			Commands.NOT_READY as unknown as string,
			(message: ClientMessage, room: YGOProRoom, client: YgoClient) =>
				void this.handleNotReady.bind(this)(message, room, client as YGOProClient),
		);
	}

	private async handleJoin(
		message: ClientMessage,
		room: YGOProRoom,
		socket: ISocket,
	): Promise<void> {
		this.logger.info(`handleJoin: ${message.data.toString("hex")}`);

		if (!this.rejectOnVersionMismatch(message.data, room, socket)) {
			return;
		}

		// Reservation gate before any admission work: a reserved room's join
		// string is not a key — only the stamped identities (or the bot's
		// token-marked socket) get past this door, not even as spectators.
		if (!room.reservationAdmits(socket)) {
			room.rejectReservedJoin(socket);
			return;
		}

		const playerInfoMessage = new PlayerInfoMessage(message.previousMessage, message.data.length);
		if (isNameTaken(room.players, playerInfoMessage.name)) {
			this.sendNameTakenError(room, playerInfoMessage.name, socket);
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

	/**
	 * Whether the joiner's client version matches the server's; rejects it if not.
	 *
	 * Returns a boolean instead of throwing (the shape the EDOPro base's
	 * `validateVersion` used). handleJoin is async and the "JOIN" listener voids its
	 * promise, so a throw here became an unhandled rejection: Node routes it to the
	 * global uncaughtException hook (src/shared/error-handler/error-handler.ts),
	 * which logs a routine client-version mismatch as "Excepción no capturada" — and
	 * because nothing after the throw ran, the rejected socket stayed open as a
	 * live-but-rejected connection. Encoding was never the problem here:
	 * VersionErrorClientMessage.create is byte-identical to the ygopro frame
	 * (its `decimalToBytesBuffer(0, 3)` already covers STOC_ErrorMsg's alignment
	 * padding). We go through the ygopro repository anyway, so the ygopro path owns
	 * its own wire format instead of borrowing EDOPro's.
	 */
	private rejectOnVersionMismatch(data: Buffer, room: YGOProRoom, socket: ISocket): boolean {
		const joinMessage = new YGOProJoinGameMessage(data);
		if (joinMessage.version === mercuryConfig.version) {
			return true;
		}

		socket.send(room.messageSender.errorMessage(ErrorMessageType.VERERROR, mercuryConfig.version));
		socket.close();

		return false;
	}

	/**
	 * Reject a joiner whose name is already seated.
	 *
	 * Must NOT reuse RoomState.sendExistingPlayerErrorMessage: that helper writes
	 * EDOPro-flavoured frames (a 0xF3 server-error frame the classic ygopro client
	 * does not know, plus an EDOPro-packed STOC_ERROR_MSG of size 6). ygopro drops
	 * STOC_ERROR_MSG when `len < 1 + sizeof(STOC_ErrorMsg)` — 9 bytes once the
	 * struct's alignment padding is counted — so the joiner got no error at all and
	 * sat on the connecting screen. Encode through the ygopro repository instead,
	 * mirroring YGOProRoom.admissionTarget's rejectAdmission path: a red STOC_CHAT
	 * explaining why, then the real JOINERROR, then a graceful close() so both
	 * frames flush before teardown (see SocketCloseOnError.test.ts).
	 */
	private sendNameTakenError(room: YGOProRoom, name: string, socket: ISocket): void {
		const chat = new YGOProStocChat().fromPartial({
			player_type: ChatColor.RED,
			msg: `A player named "${name}" is already in this room. Change your nickname and try again.`,
		});
		socket.send(Buffer.from(chat.toFullPayload()));
		socket.send(room.messageSender.errorMessage(ErrorMessageType.JOINERROR, 0));
		socket.close();
	}

	private handleTryStart(_message: ClientMessage, room: YGOProRoom, player: YGOProClient): void {
		player.logger.info("handleTryStart");

		if (!player.host) {
			return;
		}

		if (!room.allPlayersReady) {
			return;
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

	private handleToObserver(message: ClientMessage, room: YGOProRoom, player: YGOProClient): void {
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

	private handleToDuel(_message: ClientMessage, room: YGOProRoom, player: YGOProClient): void {
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
		player.logger.info(`handleUpdateDeck: ${message.data.toString("hex")}`);

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
			this.logger.warn(
				`Deck build error: type=0x${deckOrError.type.toString(16)}, code=${deckOrError.code}, rule=${room.hostInfo.rule}, pool=${room.cardPool}`,
			);
			room.notReadyUnsafe(player);
			player.sendMessageToClient(
				room.messageSender.errorMessage(
					ErrorMessageType.DECKERROR,
					encodeDeckErrorCode(deckOrError.type, deckOrError.code),
				),
			);
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
			this.logger.warn(
				`Deck validation error: type=0x${hasError.type.toString(16)}, code=${hasError.code}, cardOt=${failedCard?.variant ?? "N/A"}, rule=${room.hostInfo.rule}, pool=${room.cardPool}`,
			);
			room.notReadyUnsafe(player);
			player.sendMessageToClient(
				room.messageSender.errorMessage(
					ErrorMessageType.DECKERROR,
					encodeDeckErrorCode(hasError.type, hasError.code),
				),
			);
			return;
		}

		room.mutex.runExclusive(() => {
			room.setDecksToPlayerUnsafe(player.position, deck);
		});
	}

	private async handleNotReady(message: ClientMessage, room: YGOProRoom, player: YGOProClient) {
		player.logger.info(`handleNotReady: ${message.data.toString("hex")}`);

		room.mutex.runExclusive(() => {
			room.notReadyUnsafe(player);
		});
	}
}
