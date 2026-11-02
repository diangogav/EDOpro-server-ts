import { CoreMessages } from "src/edopro/messages/domain/CoreMessages";
import { ErrorMessages } from "src/edopro/messages/server-to-client/error-messages/ErrorMessages";
import { ErrorClientMessage } from "src/edopro/messages/server-to-client/ErrorClientMessage";
import { Team } from "src/shared/room/Team";
import {
	DuelEventContext,
	decodeDamageDealt,
	decodeLifeRecovered,
	decodeLpCostPaid,
	decodeTurnStarted,
} from "src/shared/room/domain/duel-events/DuelEventDecoders";
import { ChatColor } from "ygopro-msg-encode";

import { PlayerInfoMessage } from "@shared/messages/client-to-server/PlayerInfoMessage";
import { YgoClient } from "../../../shared/client/domain/YgoClient";
import { ClientMessage } from "../../../shared/messages/MessageProcessor";
import { createSystemChat } from "../../../shared/room/domain/chat/SystemChat";
import { RoomState } from "../../../shared/room/domain/RoomState";
import { YgoRoom } from "../../../shared/room/domain/YgoRoom";
import { ISocket } from "../../../shared/socket/domain/ISocket";
import { Client } from "../../client/domain/Client";
import { PlayerMessageClientMessage } from "../../messages/server-to-client/PlayerMessageClientMessage";
import { SpectatorMessageClientMessage } from "../../messages/server-to-client/SpectatorMessageClientMessage";

/**
 * Base of every EDOPro room state: decodes the C++ core's duel messages,
 * applies their LP and turn changes, and relays chat as EDOPro 0xF3 frames.
 */
export abstract class EdoproRoomState extends RoomState {
	protected sendExistingPlayerErrorMessage(
		playerInfoMessage: PlayerInfoMessage,
		socket: ISocket,
	): void {
		socket.send(
			createSystemChat(
				ChatColor.RED,
				`Nickname '${playerInfoMessage.name}' is already in use — choose another.`,
			),
		);
		socket.send(ErrorClientMessage.create(ErrorMessages.JOIN_ERROR));
		socket.destroy();

		return;
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

	protected override registerDuelEventSubscribers(): void {
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

	protected relayChat(message: ClientMessage, room: YgoRoom, client: YgoClient): void {
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
