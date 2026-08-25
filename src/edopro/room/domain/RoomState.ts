import { CoreMessages } from "src/edopro/messages/domain/CoreMessages";
import { ServerInfoMessage } from "src/edopro/messages/domain/ServerInfoMessage";
import { ErrorMessages } from "src/edopro/messages/server-to-client/error-messages/ErrorMessages";
import { ErrorClientMessage } from "src/edopro/messages/server-to-client/ErrorClientMessage";
import { ServerErrorClientMessage } from "src/edopro/messages/server-to-client/ServerErrorMessageClientMessage";
import { Team } from "src/shared/room/Team";
import {
	DuelEventContext,
	decodeDamageDealt,
	decodeLifeRecovered,
	decodeLpCostPaid,
	decodeTurnStarted,
} from "src/shared/room/domain/duel-events/DuelEventDecoders";
import { DuelEventDispatcher } from "src/shared/room/domain/duel-events/DuelEventDispatcher";
import { DuelEventPluginHub } from "src/shared/room/domain/duel-events/DuelEventPluginHub";
import WebSocketSingleton from "src/web-socket-server/WebSocketSingleton";
import { EventEmitter } from "stream";

import { YGOProPlayerChatMessage } from "@ygopro/messages/server-to-client/YGOProPlayerChatMessage";
import { YgoClient } from "../../../shared/client/domain/YgoClient";
import { YgoRoom } from "../../../shared/room/domain/YgoRoom";
import { ISocket } from "../../../shared/socket/domain/ISocket";
import { BufferToUTF16 } from "../../../utils/BufferToUTF16";
import { Client } from "../../client/domain/Client";
import { PlayerInfoMessage } from "../../messages/client-to-server/PlayerInfoMessage";
import { Commands } from "../../../shared/messages/Commands";
import { ClientMessage } from "../../../shared/messages/MessageProcessor";
import { PlayerMessageClientMessage } from "../../messages/server-to-client/PlayerMessageClientMessage";
import { ServerMessageClientMessage } from "../../messages/server-to-client/ServerMessageClientMessage";
import { SpectatorMessageClientMessage } from "../../messages/server-to-client/SpectatorMessageClientMessage";
import { RoomType } from "src/shared/room/domain/RoomType";
import { YGOProRoom } from "@ygopro/room/domain/YGOProRoom";
import { NetPlayerType, YGOProStocChat, YGOProStocSelectHand } from "ygopro-msg-encode";
import {
	EMOTE_COOLDOWN_MS,
	MAX_ID_LENGTH,
	buildStocEmoteFrame,
	isValidEmoteId,
} from "@ygopro/emote/emote-protocol";

export abstract class RoomState {
	protected readonly eventEmitter: EventEmitter;
	protected readonly duelEvents = new DuelEventDispatcher();

	constructor(eventEmitter: EventEmitter) {
		this.eventEmitter = eventEmitter;
		this.registerDuelEventSubscribers();
		// Plugin subscribers observe the same dispatched events through the
		// hub's bounded per-room queue; with no plugins registered this is a
		// no-op.
		DuelEventPluginHub.getInstance().attach(this.duelEvents);

		this.eventEmitter.on(
			Commands.CHAT as unknown as string,
			(message: ClientMessage, room: YgoRoom, client: Client) =>
				this.handleChat(message, room, client),
		);

		this.eventEmitter.on(
			Commands.EMOTE as unknown as string,
			(message: ClientMessage, room: YgoRoom, client: Client) =>
				this.handleEmote(message, room, client),
		);
	}

	removeAllListener(): void {
		this.eventEmitter.removeAllListeners();
	}

	protected sendExistingPlayerErrorMessage(
		playerInfoMessage: PlayerInfoMessage,
		socket: ISocket,
	): void {
		socket.send(
			ServerErrorClientMessage.create(
				`Already exists a player with the name :${playerInfoMessage.name}`,
			),
		);
		socket.send(ErrorClientMessage.create(ErrorMessages.JOIN_ERROR));
		socket.destroy();

		return;
	}

	protected sendWelcomeMessage(room: YgoRoom, socket: ISocket): void {
		if (room.ranked) {
			socket.send(
				YGOProPlayerChatMessage.create(
					`${ServerInfoMessage.WELCOME} - ${ServerInfoMessage.RANKED_ROOM_CREATION_SUCCESS} - ${ServerInfoMessage.GAIN_POINTS_CALL_TO_ACTION}`,
				),
			);
			return;
		}

		socket.send(
			YGOProPlayerChatMessage.create(
				`${ServerInfoMessage.WELCOME} - ${ServerInfoMessage.UN_RANKED_ROOM_CREATION_SUCCESS}`,
			),
		);
	}

	protected processDuelMessage(messageType: CoreMessages, data: Buffer, room: YgoRoom): void {
		// Decode the core message into a duel event and hand it to the
		// synchronous dispatcher; the room mutation and broadcast live in the
		// subscribers registered by registerDuelEventSubscribers.
		const ctx: DuelEventContext = {
			roomId: room.id,
			duelId: room.duelId,
			turn: room.turn,
			resolveTeam: (player: number) => room.firstToPlay ^ player,
		};

		if (messageType === CoreMessages.MSG_DAMAGE) {
			this.duelEvents.dispatch("duel.damage", decodeDamageDealt(data, ctx), room);
		}

		if (messageType === CoreMessages.MSG_RECOVER) {
			this.duelEvents.dispatch("duel.recover", decodeLifeRecovered(data, ctx), room);
		}

		if (messageType === CoreMessages.MSG_PAY_LPCOST) {
			this.duelEvents.dispatch("duel.lp-cost", decodeLpCostPaid(data, ctx), room);
		}

		if (messageType === CoreMessages.MSG_NEW_TURN) {
			// TurnStartedEvent.turn is the number of the turn that just started;
			// the room counter increments in the internal subscriber, after this
			// event is built.
			const turnStartCtx: DuelEventContext = { ...ctx, turn: room.turn + 1 };
			this.duelEvents.dispatch("duel.turn-start", decodeTurnStarted(data, turnStartCtx), room);
		}
	}

	// The ygopro pipeline overrides this with a no-op: it applies LP/turn
	// mutations in its ocgcore middleware, so its dispatcher carries plugin
	// delivery only.
	protected registerDuelEventSubscribers(): void {
		this.duelEvents.subscribe("duel.damage", (event, room) => {
			room.decreaseLps(event.team as Team, event.amount);
			this.broadcastDuelRoomUpdate(room);
		});

		this.duelEvents.subscribe("duel.recover", (event, room) => {
			room.increaseLps(event.team as Team, event.amount);
			this.broadcastDuelRoomUpdate(room);
		});

		this.duelEvents.subscribe("duel.lp-cost", (event, room) => {
			room.decreaseLps(event.team as Team, event.amount);
			this.broadcastDuelRoomUpdate(room);
		});

		this.duelEvents.subscribe("duel.turn-start", (_event, room) => {
			room.increaseTurn();
			this.broadcastDuelRoomUpdate(room);
		});
	}

	private broadcastDuelRoomUpdate(room: YgoRoom): void {
		WebSocketSingleton.getInstance().broadcast({
			action: "UPDATE-ROOM",
			data: room.toRealTimePresentation(),
		});
	}

	protected notifyDuelStart(room: YgoRoom): void {
		if (room.isFirstDuel()) {
			WebSocketSingleton.getInstance().broadcast({
				action: "ADD-ROOM",
				data: room.toRealTimePresentation(),
			});
		} else {
			WebSocketSingleton.getInstance().broadcast({
				action: "UPDATE-ROOM",
				data: room.toRealTimePresentation(),
			});
		}
	}

	private handleMercuryChat(message: ClientMessage, room: YGOProRoom, client: YgoClient): void {
		const playerType = client.isSpectator
			? NetPlayerType.OBSERVER
			: room.isPositionSwapped
				? client.position ^ 1
				: client.position;

		const content = BufferToUTF16(message.data, message.data.length);
		// STOC_CHAT (opcode 0x19) only carries player_type + msg — there is no name field,
		// and every spectator shares player_type=7, so the client cannot tell which spectator
		// spoke (it would fall back to a duelist's identity). Prefix the spectator's name into
		// the text so the client can attribute the message to the right person.
		const outgoing = client.isSpectator
			? `${client.name.replace(/\0/g, "").trim()}: ${content}`
			: content;
		const chatMessage = Buffer.from(
			new YGOProStocChat().fromPartial({ player_type: playerType, msg: outgoing }).toFullPayload(),
		);

		room.clients.forEach((_client: YgoClient) => {
			_client.socket.send(chatMessage);
		});
	}

	/**
	 * Relay an emote (custom CTOS 0xfc) to the whole room as STOC 0xfc. Mercury
	 * rooms only — the opcode is understood solely by this project's client, and
	 * a standard ygopro client would neither send nor decode it. Validates the
	 * id against the catalog and rate-limits per client before broadcasting.
	 */
	private handleEmote(message: ClientMessage, room: YgoRoom, client: YgoClient): void {
		if (room.roomType !== RoomType.MERCURY) return;

		// Only seated duelists may emote. Spectators watch and receive emotes but
		// cannot send them — reject here (the authoritative gate; the client also
		// hides the picker for spectators).
		if (client.isSpectator) return;

		// Byte-length pre-check before the utf-8 conversion, so a garbage frame
		// (megabytes of body) can't force a large string allocation just to fail.
		if (message.data.length === 0 || message.data.length > MAX_ID_LENGTH) return;

		const emoteId = message.data.toString("utf8");
		if (!isValidEmoteId(emoteId)) return;
		if (!client.tryEmote(Date.now(), EMOTE_COOLDOWN_MS)) return;

		// Seat resolution mirrors handleMercuryChat so the client maps the sender
		// to the correct HUD side (accounting for a swapped board).
		const ygoproRoom = room as YGOProRoom;
		const playerType = ygoproRoom.isPositionSwapped ? client.position ^ 1 : client.position;

		const frame = buildStocEmoteFrame(playerType, emoteId);
		room.clients.forEach((c: YgoClient) => {
			c.socket.send(frame);
		});
	}

	protected sendSystemErrorMessage(message: string, client: YgoClient): void {
		client.socket.send(YGOProPlayerChatMessage.create(message));
	}

	protected sendSystemMessage(message: string, client: YgoClient): void {
		client.socket.send(YGOProPlayerChatMessage.create(message));
	}

	private handleChat(message: ClientMessage, room: YgoRoom, client: YgoClient): void {
		const sanitized = BufferToUTF16(message.data, message.data.length);
		if (sanitized === ":score") {
			client.socket.send(YGOProPlayerChatMessage.create(room.score));

			return;
		}

		if (room.roomType === RoomType.MERCURY) {
			this.handleMercuryChat(message, room as YGOProRoom, client);
			return;
		}

		if (client.isSpectator) {
			const chatMessage = SpectatorMessageClientMessage.create(
				client.name.replace(/\0/g, "").trim(),
				message.data,
			);
			room.players.forEach((player: Client) => {
				player.socket.send(chatMessage);
			});

			room.spectators.forEach((spectator) => {
				spectator.socket.send(chatMessage);
			});

			return;
		}

		const playerMessage = PlayerMessageClientMessage.create(
			client.name.replace(/\0/g, "").trim(),
			message.data,
			client.team,
		);
		const opponentMessage = PlayerMessageClientMessage.create(
			client.name.replace(/\0/g, "").trim(),
			message.data,
			Number(!client.team),
		);

		room.players.forEach((player: YgoClient) => {
			const message = player.team === client.team ? playerMessage : opponentMessage;
			player.socket.send(message);
		});

		room.spectators.forEach((spectator) => {
			spectator.socket.send(opponentMessage);
		});
	}
}
