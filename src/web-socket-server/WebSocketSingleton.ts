/* eslint-disable no-use-before-define */
import { readFileSync } from "fs";
import { createServer } from "https";
import path from "path";
import MercuryRoomList from "src/mercury/room/infrastructure/MercuryRoomList";
import LoggerFactory from "src/shared/logger/infrastructure/LoggerFactory";
import WebSocket, { WebSocketServer } from "ws";

import RoomList from "../edopro/room/infrastructure/RoomList";
import { WebSocketMessage } from "./WebSocketMessage";

class WebSocketSingleton {
	private static instance: WebSocketSingleton | null = null;
	private readonly wss: WebSocketServer | null = null;

	private constructor(port: number) {
		const logger = LoggerFactory.getLogger();
		const server = this.buildServer();
		this.wss = new WebSocketServer({ server });
		this.wss.on("connection", (ws: WebSocket) => {
			ws.send(
				JSON.stringify({
					action: "GET-ROOMS",
					data: [...RoomList.getRooms(), ...MercuryRoomList.getRooms()]
						.filter((item) => item.turn !== 0)
						.map((room) => room.toRealTimePresentation()),
				})
			);
		});
		server.listen(port, () => {
			logger.info(`WebSocket server running on port ${port}`);
		});
	}

	public static getInstance(): WebSocketSingleton {
		if (!WebSocketSingleton.instance) {
			WebSocketSingleton.instance = new WebSocketSingleton(4000);
		}

		return WebSocketSingleton.instance;
	}

	public broadcast(message: WebSocketMessage): void {
		if (this.wss) {
			this.wss.clients.forEach((client) => {
				if (client.readyState === WebSocket.OPEN) {
					client.send(JSON.stringify(message));
				}
			});
		}
	}

	private buildServer() {
		const root = path.resolve(__dirname, "../../");
		const cert = readFileSync(`${root}/certs/cert.pem`);
		const key = readFileSync(`${root}/certs/key.pem`);

		return createServer({ cert, key });
	}
}

export default WebSocketSingleton;
