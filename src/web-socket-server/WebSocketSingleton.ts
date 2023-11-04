import { readFileSync } from "fs";
import https from "https";
import WebSocket, { WebSocketServer } from "ws";

import RoomList from "../modules/room/infrastructure/RoomList";
import { WebSocketMessage } from "./WebSocketMessage";

class WebSocketSingleton {
	// eslint-disable-next-line no-use-before-define
	private static instance: WebSocketSingleton | null = null;
	private readonly wss: WebSocketServer | null = null;

	private constructor(httpsServer: https.Server) {
		this.wss = new WebSocketServer({ server: httpsServer });
		this.wss.on("connection", (ws: WebSocket) => {
			ws.send(
				JSON.stringify({
					action: "GET-ROOMS",
					data: RoomList.getRooms().map((room) => room.toRealTimePresentation()),
				})
			);
		});
	}

	public static getInstance(httpsServer: https.Server): WebSocketSingleton {
		if (!WebSocketSingleton.instance) {
			console.log("WebSocket Server Up!");
			WebSocketSingleton.instance = new WebSocketSingleton(httpsServer);
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

// Crear el servidor HTTPS
const options = {
	cert: readFileSync(`./letsencrypt/live/server.evolutionygo.com/cert.pem`),
	key: readFileSync(`./letsencrypt/live/server.evolutionygo.com/privkey.pem`),
};

const server = https.createServer(options, (_req, _res) => {
	// Manejar solicitudes HTTP si es necesario
});

// Iniciar el servidor Express en el servidor HTTPS
server.listen(4000, () => {
	console.log("Server is running on port 4000");
	WebSocketSingleton.getInstance(server);
});
