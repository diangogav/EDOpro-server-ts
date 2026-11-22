import { randomUUID } from "node:crypto";
import { createServer, Server } from "http";
import { AddressInfo } from "net";
import { config } from "src/config";
import MercuryRoomList from "@ygopro/room/infrastructure/YGOProRoomList";
import LoggerFactory from "src/shared/logger/infrastructure/LoggerFactory";
import WebSocket, { WebSocketServer } from "ws";

import RoomList from "../edopro/room/infrastructure/RoomList";
import { PresenceMessage, PresenceTransport } from "../presence/application/PresenceHub";
import { WebSocketMessage } from "./WebSocketMessage";

/** Receives the lifecycle and text messages of every room-list socket. */
export interface PresenceConnections {
	connect(socketId: string): void;
	message(socketId: string, raw: string): Promise<void>;
	disconnect(socketId: string): void;
}

/** Sockets that stop answering pings are dropped after one missed beat. */
export const ROOM_LIST_HEARTBEAT_MS = 25_000;

/** Larger messages close the socket (code 1009); presence messages are well under it. */
export const ROOM_LIST_MAX_PAYLOAD_BYTES = 4096;

/**
 * The room-list WebSocket: every socket gets the room list on connect and
 * every room change after it (the web ranking reads only these). A socket can
 * also join the online list by talking to presence over the same connection.
 */
class WebSocketSingleton implements PresenceTransport {
	private static instance: WebSocketSingleton | null = null;
	private readonly server: Server;
	private readonly wss: WebSocketServer;
	private readonly sockets = new Map<string, WebSocket>();
	private readonly alive = new Map<string, boolean>();
	private readonly heartbeat: NodeJS.Timeout;
	private presence: PresenceConnections | null = null;

	private constructor(port: number) {
		const logger = LoggerFactory.getLogger();
		this.server = createServer();
		this.wss = new WebSocketServer({
			server: this.server,
			maxPayload: ROOM_LIST_MAX_PAYLOAD_BYTES,
		});
		this.wss.on("connection", (ws: WebSocket) => {
			const socketId = randomUUID();
			this.sockets.set(socketId, ws);
			this.alive.set(socketId, true);
			ws.on("pong", () => this.alive.set(socketId, true));
			ws.on("message", (data, isBinary) => {
				if (isBinary || !this.presence) {
					return;
				}
				this.presence.message(socketId, data.toString()).catch((error: unknown) => {
					logger.error(error instanceof Error ? error : String(error), { context: "presence" });
				});
			});
			ws.on("error", () => ws.terminate());
			ws.on("close", () => {
				this.sockets.delete(socketId);
				this.alive.delete(socketId);
				this.presence?.disconnect(socketId);
			});
			ws.send(
				JSON.stringify({
					action: "GET-ROOMS",
					data: [...RoomList.getRooms(), ...MercuryRoomList.getListedRooms()]
						.filter((item) => item.turn !== 0)
						.map((room) => room.toRealTimePresentation()),
				}),
			);
			this.presence?.connect(socketId);
		});
		this.heartbeat = setInterval(() => this.beat(), ROOM_LIST_HEARTBEAT_MS);
		this.heartbeat.unref();
		this.server.listen(port, () => {
			logger.info(`WebSocket server running on port ${this.port()}`);
		});
	}

	public static getInstance(): WebSocketSingleton {
		if (!WebSocketSingleton.instance) {
			WebSocketSingleton.instance = new WebSocketSingleton(config.servers.websocket.port);
		}

		return WebSocketSingleton.instance;
	}

	/** Starts the singleton on a free port for tests. */
	public static startForTests(): WebSocketSingleton {
		WebSocketSingleton.instance = new WebSocketSingleton(0);

		return WebSocketSingleton.instance;
	}

	public static async resetForTests(): Promise<void> {
		const instance = WebSocketSingleton.instance;
		WebSocketSingleton.instance = null;
		if (!instance) {
			return;
		}
		clearInterval(instance.heartbeat);
		for (const ws of instance.sockets.values()) {
			ws.terminate();
		}
		await new Promise((resolve) => instance.wss.close(resolve));
		await new Promise((resolve) => instance.server.close(resolve));
	}

	/** Resolves with the bound port once the server listens. */
	public async listening(): Promise<number> {
		if (!this.server.listening) {
			await new Promise((resolve) => this.server.once("listening", resolve));
		}

		return this.port();
	}

	/** Routes every socket's text messages and lifecycle to presence, including sockets already open. */
	public attachPresence(presence: PresenceConnections): void {
		this.presence = presence;
		for (const socketId of this.sockets.keys()) {
			presence.connect(socketId);
		}
	}

	public broadcast(message: WebSocketMessage): void {
		this.wss.clients.forEach((client) => {
			if (client.readyState === WebSocket.OPEN) {
				client.send(JSON.stringify(message));
			}
		});
	}

	public send(socketId: string, message: PresenceMessage): void {
		const ws = this.sockets.get(socketId);
		if (ws?.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify(message));
		}
	}

	public close(socketId: string): void {
		this.sockets.get(socketId)?.close(1008, "rate limit");
	}

	private beat(): void {
		for (const [socketId, ws] of this.sockets) {
			if (!this.alive.get(socketId)) {
				ws.terminate();
				continue;
			}
			this.alive.set(socketId, false);
			ws.ping();
		}
	}

	private port(): number {
		return (this.server.address() as AddressInfo | null)?.port ?? 0;
	}
}

export default WebSocketSingleton;
