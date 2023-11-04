/* eslint-disable no-use-before-define */
import { readFileSync } from "fs";
import { createServer } from "https";
import path from "path";
import WebSocket, { WebSocketServer } from "ws";

import RoomList from "../modules/room/infrastructure/RoomList";
import { WebSocketMessage } from "./WebSocketMessage";

class WebSocketSingleton {
	private static instance: WebSocketSingleton | null = null;
	private readonly wss: WebSocketServer | null = null;

	private constructor(port: number) {
		const root = path.resolve(__dirname, "../../");
		const server = createServer({
			cert: readFileSync(`${root}/letsencrypt/live/server.evolutionygo.com/cert.pem`),
			key: readFileSync(`${root}/letsencrypt/live/server.evolutionygo.com/privkey.pem`),
		});

		this.wss = new WebSocketServer({ server });
		this.wss.on("connection", (ws: WebSocket) => {
			ws.send(
				JSON.stringify({
					action: "GET-ROOMS",
					data: RoomList.getRooms().map((room) => room.toRealTimePresentation()),
				})
			);
		});
		server.listen(port);
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
}

export default WebSocketSingleton;
