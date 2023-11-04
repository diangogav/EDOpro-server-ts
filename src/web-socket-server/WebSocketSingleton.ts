/* eslint-disable no-use-before-define */
import WebSocket, { WebSocketServer } from "ws";

import RoomList from "../modules/room/infrastructure/RoomList";
import { WebSocketMessage } from "./WebSocketMessage";

class WebSocketSingleton {
	private static instance: WebSocketSingleton | null = null;
	private readonly wss: WebSocketServer | null = null;

	private constructor(port: number) {
		this.wss = new WebSocketServer({ port });
		this.wss.on("connection", (ws: WebSocket) => {
			ws.send(
				JSON.stringify({
					action: "GET-ROOMS",
					data: RoomList.getRooms().map((room) => room.toRealTimePresentation()),
				})
			);
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
}

export default WebSocketSingleton;