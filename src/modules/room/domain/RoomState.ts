import { CoreMessages } from "@modules/messages/domain/CoreMessages";
import { ServerInfoMessage } from "@modules/messages/domain/ServerInfoMessage";
import { ErrorMessages } from "@modules/messages/server-to-client/error-messages/ErrorMessages";
import { ErrorClientMessage } from "@modules/messages/server-to-client/ErrorClientMessage";
import { ServerErrorClientMessage } from "@modules/messages/server-to-client/ServerErrorMessageClientMessage";
import { Team } from "@modules/shared/room/Team";
import WebSocketSingleton from "src/web-socket-server/WebSocketSingleton";
import { EventEmitter } from "stream";

import { mercuryConfig } from "../../../mercury/config";
import { MercuryJoinGameMessage } from "../../../mercury/messages/MercuryJoinGameMessage";
import { BufferToUTF16 } from "../../../utils/BufferToUTF16";
import { Client } from "../../client/domain/Client";
import { PlayerInfoMessage } from "../../messages/client-to-server/PlayerInfoMessage";
import { Commands } from "../../messages/domain/Commands";
import { ClientMessage } from "../../messages/MessageProcessor";
import { PlayerMessageClientMessage } from "../../messages/server-to-client/PlayerMessageClientMessage";
import { ServerMessageClientMessage } from "../../messages/server-to-client/ServerMessageClientMessage";
import { SpectatorMessageClientMessage } from "../../messages/server-to-client/SpectatorMessageClientMessage";
import { VersionErrorClientMessage } from "../../messages/server-to-client/VersionErrorClientMessage";
import { YgoClient } from "../../shared/client/domain/YgoClient";
import { YgoRoom } from "../../shared/room/domain/YgoRoom";
import { ISocket } from "../../shared/socket/domain/ISocket";
import { MercuryPlayerChatMessage } from "./../../../mercury/messages/server-to-client/MercuryPlayerChatMessage";

export abstract class RoomState {
	protected readonly eventEmitter: EventEmitter;

	constructor(eventEmitter: EventEmitter) {
		this.eventEmitter = eventEmitter;

		this.eventEmitter.on(
			Commands.CHAT as unknown as string,
			(message: ClientMessage, room: YgoRoom, client: Client) =>
				this.handleChat(message, room, client)
		);
	}

	removeAllListener(): void {
		this.eventEmitter.removeAllListeners();
	}

	protected playerAlreadyInRoom(
		playerInfoMessage: PlayerInfoMessage,
		room: YgoRoom,
		socket: ISocket
	): YgoClient | null {
		if (!room.ranked) {
			const player = room.clients.find((client) => {
				return (
					client.socket.remoteAddress === socket.remoteAddress &&
					client.socket.closed &&
					playerInfoMessage.name === client.name
				);
			});

			if (!player) {
				return null;
			}

			return player;
		}

		const player = room.clients.find((client) => {
			return playerInfoMessage.name === client.name;
		});

		if (!player) {
			return null;
		}

		return player;
	}

	protected validateVersion(message: Buffer, socket: ISocket): void {
		const joinMessage = new MercuryJoinGameMessage(message);

		if (joinMessage.version !== mercuryConfig.version) {
			socket.send(VersionErrorClientMessage.create(mercuryConfig.version));

			throw new Error("Version mismatch");
		}
	}

	protected sendExistingPlayerErrorMessage(
		playerInfoMessage: PlayerInfoMessage,
		socket: ISocket
	): void {
		socket.send(
			ServerErrorClientMessage.create(
				`Ya existe un jugador con el nombre :${playerInfoMessage.name}`
			)
		);
		socket.send(ErrorClientMessage.create(ErrorMessages.JOIN_ERROR));
		socket.destroy();

		return;
	}

	protected sendInfoMessage(room: YgoRoom, socket: ISocket): void {
		if (room.ranked) {
			socket.send(ServerMessageClientMessage.create(ServerInfoMessage.WELCOME));
			socket.send(MercuryPlayerChatMessage.create(ServerInfoMessage.WELCOME));
			socket.send(
				ServerMessageClientMessage.create(ServerInfoMessage.RANKED_ROOM_CREATION_SUCCESS)
			);
			socket.send(MercuryPlayerChatMessage.create(ServerInfoMessage.RANKED_ROOM_CREATION_SUCCESS));

			socket.send(ServerMessageClientMessage.create(ServerInfoMessage.GAIN_POINTS_CALL_TO_ACTION));
			socket.send(MercuryPlayerChatMessage.create(ServerInfoMessage.GAIN_POINTS_CALL_TO_ACTION));

			return;
		}

		socket.send(ServerMessageClientMessage.create(ServerInfoMessage.WELCOME));
		socket.send(MercuryPlayerChatMessage.create(ServerInfoMessage.WELCOME));

		socket.send(
			ServerMessageClientMessage.create(ServerInfoMessage.UN_RANKED_ROOM_CREATION_SUCCESS)
		);
		socket.send(MercuryPlayerChatMessage.create(ServerInfoMessage.UN_RANKED_ROOM_CREATION_SUCCESS));

		socket.send(ServerMessageClientMessage.create(ServerInfoMessage.NOT_GAIN_POINTS));
		socket.send(MercuryPlayerChatMessage.create(ServerInfoMessage.NOT_GAIN_POINTS));
	}

	protected processDuelMessage(messageType: CoreMessages, data: Buffer, room: YgoRoom): void {
		if (messageType === CoreMessages.MSG_DAMAGE) {
			const team = room.firstToPlay ^ data.readUint8(1);
			const damage = data.readUint32LE(2);
			room.decreaseLps(team as Team, damage);
			WebSocketSingleton.getInstance().broadcast({
				action: "UPDATE-ROOM",
				data: room.toRealTimePresentation(),
			});
		}

		if (messageType === CoreMessages.MSG_RECOVER) {
			const team = room.firstToPlay ^ data.readUint8(1);
			const health = data.readUint32LE(2);
			room.increaseLps(team as Team, health);
			WebSocketSingleton.getInstance().broadcast({
				action: "UPDATE-ROOM",
				data: room.toRealTimePresentation(),
			});
		}

		if (messageType === CoreMessages.MSG_PAY_LPCOST) {
			const team = room.firstToPlay ^ data.readUint8(1);
			const cost = data.readUint32LE(2);
			room.decreaseLps(team as Team, cost);
			WebSocketSingleton.getInstance().broadcast({
				action: "UPDATE-ROOM",
				data: room.toRealTimePresentation(),
			});
		}

		if (messageType === CoreMessages.MSG_NEW_TURN) {
			room.increaseTurn();
			WebSocketSingleton.getInstance().broadcast({
				action: "UPDATE-ROOM",
				data: room.toRealTimePresentation(),
			});
		}
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

	private handleChat(message: ClientMessage, room: YgoRoom, client: YgoClient): void {
		const sanitized = BufferToUTF16(message.data, message.data.length);
		if (sanitized === ":score") {
			client.socket.send(ServerMessageClientMessage.create(room.score));
			client.socket.send(MercuryPlayerChatMessage.create(room.score));

			return;
		}

		if (client.isSpectator) {
			const chatMessage = SpectatorMessageClientMessage.create(
				client.name.replace(/\0/g, "").trim(),
				message.data
			);
			room.clients.forEach((player: Client) => {
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
			client.team
		);
		const opponentMessage = PlayerMessageClientMessage.create(
			client.name.replace(/\0/g, "").trim(),
			message.data,
			Number(!client.team)
		);

		room.clients.forEach((player: YgoClient) => {
			const message = player.team === client.team ? playerMessage : opponentMessage;
			player.socket.send(message);
		});

		room.spectators.forEach((spectator) => {
			spectator.socket.send(opponentMessage);
		});
	}
}
