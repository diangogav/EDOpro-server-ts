import { EventEmitter } from "stream";

import { YGOClientSocket } from "../../../socket-server/HostServer";
import { Client } from "../../client/domain/Client";
import { PlayerInfoMessage } from "../../messages/client-to-server/PlayerInfoMessage";
import { Commands } from "../../messages/domain/Commands";
import { ClientMessage } from "../../messages/MessageProcessor";
import { PlayerMessageClientMessage } from "../../messages/server-to-client/PlayerMessageClientMessage";
import { SpectatorMessageClientMessage } from "../../messages/server-to-client/SpectatorMessageClientMessage";
import { Room } from "./Room";

export abstract class RoomState {
	protected readonly eventEmitter: EventEmitter;

	constructor(eventEmitter: EventEmitter) {
		this.eventEmitter = eventEmitter;

		this.eventEmitter.on(
			Commands.CHAT as unknown as string,
			(message: ClientMessage, room: Room, client: Client) => this.handleChat(message, room, client)
		);
	}

	removeAllListener(): void {
		this.eventEmitter.removeAllListeners();
	}

	protected playerAlreadyInRoom(
		playerInfoMessage: PlayerInfoMessage,
		room: Room,
		socket: YGOClientSocket
	): Client | null {
		const player = room.clients.find((client) => {
			return (
				client.socket.remoteAddress === socket.remoteAddress &&
				playerInfoMessage.name === client.name
			);
		});

		return player ?? null;
	}

	private handleChat(message: ClientMessage, room: Room, client: Client): void {
		if (client.isSpectator) {
			const chatMessage = SpectatorMessageClientMessage.create(
				client.name.replace(/\0/g, "").trim(),
				message.data
			);
			room.clients.forEach((player) => {
				player.sendMessage(chatMessage);
			});

			room.spectators.forEach((spectator) => {
				spectator.sendMessage(chatMessage);
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

		room.clients.forEach((player) => {
			const message = player.team === client.team ? playerMessage : opponentMessage;
			player.sendMessage(message);
		});

		room.spectators.forEach((spectator) => {
			spectator.sendMessage(opponentMessage);
		});
	}
}
