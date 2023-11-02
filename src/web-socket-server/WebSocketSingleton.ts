/* eslint-disable no-use-before-define */
import WebSocket, { WebSocketServer } from "ws";

class WebSocketSingleton {
	private static instance: WebSocketSingleton | null = null;
	private readonly wss: WebSocketServer | null = null;

	private constructor(port: number) {
		this.wss = new WebSocketServer({ port });
	}

	public static getInstance(): WebSocketSingleton {
		if (!WebSocketSingleton.instance) {
			WebSocketSingleton.instance = new WebSocketSingleton(4000);
		}

		return WebSocketSingleton.instance;
	}

	public broadcast(message: string): void {
		if (this.wss) {
			this.wss.clients.forEach((client) => {
				if (client.readyState === WebSocket.OPEN) {
					client.send(message);
				}
			});
		}
	}
}

export default WebSocketSingleton;
