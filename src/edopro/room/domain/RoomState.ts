import { CoreMessages } from "src/edopro/messages/domain/CoreMessages";
import { ServerInfoMessage } from "src/edopro/messages/domain/ServerInfoMessage";
import { ErrorMessages } from "src/edopro/messages/server-to-client/error-messages/ErrorMessages";
import { ErrorClientMessage } from "src/edopro/messages/server-to-client/ErrorClientMessage";
import { ServerErrorClientMessage } from "src/edopro/messages/server-to-client/ServerErrorMessageClientMessage";
import { config } from "src/config";
import { Team } from "src/shared/room/Team";
import WebSocketSingleton from "src/web-socket-server/WebSocketSingleton";
import { EventEmitter } from "stream";

import { mercuryConfig } from "../../../mercury/config";
import { MercuryJoinGameMessage } from "../../../mercury/messages/MercuryJoinGameMessage";
import { MercuryPlayerChatMessage } from "../../../mercury/messages/server-to-client/MercuryPlayerChatMessage";
import { YgoClient } from "../../../shared/client/domain/YgoClient";
import { YgoRoom } from "../../../shared/room/domain/YgoRoom";
import { ISocket } from "../../../shared/socket/domain/ISocket";
import { BufferToUTF16 } from "../../../utils/BufferToUTF16";
import { Client } from "../../client/domain/Client";
import { PlayerInfoMessage } from "../../messages/client-to-server/PlayerInfoMessage";
import { Commands } from "../../messages/domain/Commands";
import { ClientMessage } from "../../messages/MessageProcessor";
import { PlayerMessageClientMessage } from "../../messages/server-to-client/PlayerMessageClientMessage";
import { ServerMessageClientMessage } from "../../messages/server-to-client/ServerMessageClientMessage";
import { SpectatorMessageClientMessage } from "../../messages/server-to-client/SpectatorMessageClientMessage";
import { VersionErrorClientMessage } from "../../messages/server-to-client/VersionErrorClientMessage";
import { RoomType } from "src/shared/room/domain/RoomType";

const ASSISTANT_NAME = "Evo IA";
const DEBUG_EVO_IA = process.env.DEBUG_EVO_IA === "true";

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
				`Already exists a player with the name :${playerInfoMessage.name}`
			)
		);
		socket.send(ErrorClientMessage.create(ErrorMessages.JOIN_ERROR));
		socket.destroy();

		return;
	}

	protected sendWelcomeMessage(room: YgoRoom, socket: ISocket): void {
		if (room.ranked) {
			socket.send(MercuryPlayerChatMessage.create(
				`${ServerInfoMessage.WELCOME} - ${ServerInfoMessage.RANKED_ROOM_CREATION_SUCCESS} - ${ServerInfoMessage.GAIN_POINTS_CALL_TO_ACTION}`
			));
			return;
		}

		socket.send(MercuryPlayerChatMessage.create(
			`${ServerInfoMessage.WELCOME} - ${ServerInfoMessage.UN_RANKED_ROOM_CREATION_SUCCESS}`
		));
	}

	protected processDuelMessage(messageType: CoreMessages, data: Buffer, room: YgoRoom): void {
		if (messageType === CoreMessages.MSG_DAMAGE) {
			const rawTeam = data.readUint8(1);
			const damagedTeam = (room.firstToPlay ^ data.readUint8(1)) as Team;
			const attackingTeam =
				damagedTeam === Team.PLAYER ? Team.OPPONENT : Team.PLAYER;
			const damage = data.readUint32LE(2);
			this.debugEvoIa("damage:received", {
				roomId: room.id,
				firstToPlay: room.firstToPlay,
				rawTeam,
				damagedTeam,
				attackingTeam,
				damage,
				data: data.toString("hex"),
			});
			room.decreaseLps(damagedTeam, damage);
			const damagedMessage = room.evaluateDamageMessage(damagedTeam, damage);
			this.debugEvoIa("damage:damaged-message", {
				roomId: room.id,
				team: damagedTeam,
				message: damagedMessage,
				lps: room.getLps(damagedTeam),
			});
			this.notifyTeamMessage(
				damagedTeam,
				damagedMessage,
				room
			);
			const advantageMessage = room.evaluateAdvantageMessageForDamagingOpponent(
				attackingTeam,
				damage
			);
			this.debugEvoIa("damage:attacking-message", {
				roomId: room.id,
				team: attackingTeam,
				message: advantageMessage,
				lps: room.getLps(attackingTeam),
			});
			this.notifyTeamMessage(
				attackingTeam,
				advantageMessage,
				room
			);
			WebSocketSingleton.getInstance().broadcast({
				action: "UPDATE-ROOM",
				data: room.toRealTimePresentation(),
			});
		}

		if (messageType === CoreMessages.MSG_RECOVER) {
			const team = room.firstToPlay ^ data.readUint8(1);
			const health = data.readUint32LE(2);
			room.increaseLps(team as Team, health);
			this.notifyTeamMessage(team as Team, room.evaluateRecoveryMessage(team as Team), room);
			WebSocketSingleton.getInstance().broadcast({
				action: "UPDATE-ROOM",
				data: room.toRealTimePresentation(),
			});
		}

		if (messageType === CoreMessages.MSG_PAY_LPCOST) {
			const team = room.firstToPlay ^ data.readUint8(1);
			const cost = data.readUint32LE(2);
			room.decreaseLps(team as Team, cost);
			this.notifyTeamMessage(team as Team, room.evaluateLpCostMessage(team as Team), room);
			WebSocketSingleton.getInstance().broadcast({
				action: "UPDATE-ROOM",
				data: room.toRealTimePresentation(),
			});
		}

		if (messageType === CoreMessages.MSG_NEW_TURN) {
			room.increaseTurn();
			room.evaluateTurnMessages().forEach(({ team, message }) => {
				this.notifyTeamMessage(team, message, room);
			});
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

	protected sendSystemErrorMessage(message: string, client: YgoClient): void {
		client.socket.send(MercuryPlayerChatMessage.create(message));
	}

	protected sendSystemMessage(message: string, client: YgoClient): void {
		client.socket.send(MercuryPlayerChatMessage.create(message));
	}

	protected notifyTeamMessage(team: Team, message: string | null, room: YgoRoom): void {
		if (!config.features.evoIa.enabled || !message) {
			return;
		}

		const recipients = room.clients
			.filter((player) => player.team === team)
			.map((player) => player.name);

		this.debugEvoIa("notify", {
			roomId: room.id,
			team,
			message,
			recipients,
		});

		const assistantMessage = MercuryPlayerChatMessage.create(
			`[${ASSISTANT_NAME}] ${message}`
		);

		room.clients
			.filter((player) => player.team === team)
			.forEach((player) => {
				player.socket.send(assistantMessage);
			});
	}

	private debugEvoIa(event: string, payload: Record<string, unknown>): void {
		if (!DEBUG_EVO_IA) {
			return;
		}

		console.debug(`[${ASSISTANT_NAME} Debug] ${event}`, payload);
		console.info(`[${ASSISTANT_NAME} Info] ${event}`, payload);
	}

	private handleChat(message: ClientMessage, room: YgoRoom, client: YgoClient): void {
		const sanitized = BufferToUTF16(message.data, message.data.length);
		if (sanitized === ":score") {
			client.socket.send(MercuryPlayerChatMessage.create(room.score));

			return;
		}

		if (sanitized === ":spec") {
			client.socket.send(
				MercuryPlayerChatMessage.create(`Spectators: ${room.spectators.length}`)
			);

			return;
		}

		if (room.roomType === RoomType.MERCURY) {
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
