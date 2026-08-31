import { EventEmitter } from "stream";

import { PlayerInfoMessage } from "@edopro/messages/client-to-server/PlayerInfoMessage";
import { RoomState } from "@edopro/room/domain/RoomState";
import { YGOProRoomState } from "../YGOProRoomState";

import { YGOProDeckCreator } from "@ygopro/deck/application/YGOProDeckCreator";
import { YGOProDeckValidator } from "@ygopro/deck/domain/YGOProDeckValidator";
import { DeckError } from "@shared/deck/domain/errors/DeckError";
import { encodeDeckErrorCode } from "@shared/deck/domain/errors/encodeDeckErrorCode";

import { Commands } from "@shared/messages/Commands";
import { ClientMessage } from "@shared/messages/MessageProcessor";
import { Logger } from "@shared/logger/domain/Logger";
import { ISocket } from "../../../../shared/socket/domain/ISocket";

import { YGOProClient } from "../../../client/domain/YGOProClient";
import { resolveJoinerIdentityWithTimeout } from "../resolveJoinerIdentityWithTimeout";
import { YGOProRoom } from "../YGOProRoom";
import { findMidDuelReconnectingPlayer } from "@shared/room/domain/findMidDuelReconnectingPlayer";
import { config } from "../../../../config";
import { ReconnectionTokenIssuer } from "@shared/room/application/reconnect/ReconnectionTokenIssuer";
import { ReconnectionAckMessage } from "@shared/messages/server-to-client/ReconnectionAckMessage";
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

export class YGOProSideDeckingState extends YGOProRoomState {
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
				void this.handleJoin.bind(this)(message, room, socket),
		);

		this.eventEmitter.on(
			Commands.UPDATE_DECK as unknown as string,
			(message: ClientMessage, room: YGOProRoom, client: YGOProClient) =>
				void this.handleUpdateDeck.bind(this)(message, room, client),
		);

		this.eventEmitter.on(
			"EXPRESS_RECONNECT",
			(message: ClientMessage, room: YGOProRoom, socket: ISocket) =>
				this.handleExpressReconnect.bind(this)(message, room, socket),
		);

		this.startTimeouts();
	}

	private handleExpressReconnect(message: ClientMessage, room: YGOProRoom, socket: ISocket): void {
		this.logger.info("EXPRESS_RECONNECT");
		const token = message.data.toString("utf8");

		const player = ReconnectionTokenIssuer.resolve(
			token,
			room.id,
			(client) => client instanceof YGOProClient,
		) as YGOProClient | null;
		if (!player) {
			this.logger.info(`EXPRESS_RECONNECT: no player for token ${token}`);
			socket.send(ReconnectionAckMessage.failure());
			socket.destroy();
			return;
		}

		socket.send(ReconnectionAckMessage.success());
		room.reconnect(player, socket);

		// Re-sync mirrors the name-match reconnect for this phase (handleJoin).
		player.sendMessageToClient(room.messageSender.duelStartMessage());
		if (!player.isReady) {
			player.sendMessageToClient(room.messageSender.changeSideMessage());
		}

		player.sendMessageToClient(ReconnectionTokenIssuer.rotate(player, room.id));
		player.clearReconnecting();
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
			`Side deck: ${SIDE_TIMEOUT_MINUTES} minutes to submit.`,
			ChatColor.YELLOW,
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

			// Broadcast only — a player-facing chat send here would race the
			// socket destroy below and may never reach the client.
			this.broadcastChat(
				`${player.name} was disconnected — side deck not submitted in time.`,
				ChatColor.RED,
			);
			player.destroy();
			return;
		}

		const nextRemain = remain - 1;
		this.playerRemainMinutes.set(player.position, nextRemain);

		// Only the last minute gets a warning — silent in between to avoid
		// spamming the player with a repeat every tick.
		if (nextRemain === 1) {
			this.sendChatToPlayer(player, "Side deck: 1 minute left.", ChatColor.YELLOW);
		}
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

	private async handleJoin(
		message: ClientMessage,
		room: YGOProRoom,
		socket: ISocket,
	): Promise<void> {
		this.logger.info("handleJoin");

		// Reservation gate: past WAITING, a reserved room keeps its seats closed
		// to third parties — the join string alone never buys a seat. The gate
		// admits watch-stamped sockets (spectate-only by construction) alongside
		// a reserved player's own reconnect (its ticket-resolved identity is in
		// the reservation set); both proceed below unchanged.
		if (!room.reservationAdmits(socket)) {
			room.rejectReservedJoin(socket);
			return;
		}

		const playerInfoMessage = new PlayerInfoMessage(message.previousMessage, message.data.length);
		// The identity resolution awaits the database, yielding the event loop,
		// so the eligibility check and the seat change must run as ONE exclusive
		// section — otherwise two concurrent joins could both observe the seat
		// as reclaimable before either takes it. Same lock (and same
		// hold-across-resolver idiom) as the WAITING admission.
		await room.mutex.runExclusive(async () => {
			// A ranked seat is bound to an account id, so the joiner's identity is
			// resolved BEFORE the reconnect decision — the display name alone never
			// identifies anyone. Casual rooms bind by address and liveness instead
			// and never consult the resolver.
			let joinerUserId: string | null = null;
			if (room.ranked) {
				try {
					joinerUserId = await resolveJoinerIdentityWithTimeout(room, socket, playerInfoMessage);
				} catch (error) {
					// Fail closed: with the resolver unreachable — erroring, or hung
					// past the bounded timeout — nobody's identity is proven, so no
					// seat may change hands. The joiner waits in the stands (a legit
					// player can simply rejoin once the resolver recovers) instead of
					// hanging with no response. This catch keeps the resolver failure
					// off the voided JOIN promise; a later synchronous throw inside
					// this exclusive section still surfaces to the global handler
					// (the process survives it and the mutex releases).
					this.logger.error(`resolveJoinerIdentity failed: ${String(error)}`);
					this.admitAsSpectator(room, socket, playerInfoMessage.name);
					return;
				}
			}
			// The shared seam honors the watch stamp: a "w,<roomId>" joiner asked to
			// spectate, never to take a seat, so a name match must not reconnect it.
			const playerAlreadyInRoom = findMidDuelReconnectingPlayer({
				players: room.players,
				name: playerInfoMessage.name,
				socket,
				roomId: room.id,
				ranked: room.ranked,
				joinerUserId,
			});

			if (!(playerAlreadyInRoom instanceof YGOProClient)) {
				this.admitAsSpectator(room, socket, playerInfoMessage.name);
				return;
			}

			room.reconnect(playerAlreadyInRoom, socket);
			playerAlreadyInRoom.sendMessageToClient(room.messageSender.duelStartMessage());
			if (!playerAlreadyInRoom.isReady) {
				playerAlreadyInRoom.sendMessageToClient(room.messageSender.changeSideMessage());
			}
			playerAlreadyInRoom.clearReconnecting();
		});
	}

	private admitAsSpectator(room: YGOProRoom, socket: ISocket, name: string): void {
		const spectator = room.createSpectatorUnsafe(socket, name);
		room.addSpectatorUnsafe(spectator);
		spectator.sendMessageToClient(Buffer.from(new YGOProStocDuelStart().toFullPayload()));
		spectator.sendMessageToClient(Buffer.from(new YGOProStocWaitingSide().toFullPayload()));
	}

	private async handleUpdateDeck(
		message: ClientMessage,
		room: YGOProRoom,
		player: YGOProClient,
	): Promise<void> {
		player.logger.info(`handleUpdateDeck: ${message.data.toString("hex")}`);

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

		room.setDecksToPlayerUnsafe(player.position, deck);
		player.ready();
		this.clearPlayerTimeout(player.position);
		player.sendMessageToClient(room.messageSender.duelStartMessage());

		const allReady = room.players.every((_client) => _client.isReady);
		if (!allReady) {
			return;
		}

		this.clearAllTimeouts();

		// KDE Tournament Policy §IV.F: after a drawn duel the loser-chooses rule
		// does not apply — a random method decides again, so re-enter RPS. The
		// missing-chooser fallback goes the same way: a random re-roll is always
		// a legal way to pick the deciding duelist, while throwing here would
		// strand the whole room after everyone already sided.
		const chooser = room.clientWhoChoosesTurn as YGOProClient | undefined;
		if (room.turnChoiceRequiresRps || !chooser) {
			room.turnChoiceRequiresRps = false;
			this.toRPS(room);
			room.rps();

			return;
		}

		chooser.sendMessageToClient(room.messageSender.selectTpMessage());

		room.choosingOrder();
	}
}
