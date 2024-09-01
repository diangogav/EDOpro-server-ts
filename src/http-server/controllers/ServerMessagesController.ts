import { Request, Response } from "express";

import { ServerMessageClientMessage } from "../../edopro/messages/server-to-client/ServerMessageClientMessage";
import RoomList from "../../edopro/room/infrastructure/RoomList";
import MercuryRoomList from "../../mercury/room/infrastructure/MercuryRoomList";
import { Logger } from "../../shared/logger/domain/Logger";

export class CreateMessageRequest {
	message: string;
	reason: string;
}

export class ServerMessagesController {
	constructor(private readonly logger: Logger) {}

	// eslint-disable-next-line @typescript-eslint/require-await
	async run(req: Request, response: Response): Promise<void> {
		const payload = req.body as CreateMessageRequest;
		const rooms = [...RoomList.getRooms(), ...MercuryRoomList.getRooms()];
		for (const room of rooms) {
			const allClients = [...room.clients, ...room.spectators];
			for (const client of allClients) {
				const socket = client.socket;
				socket.send(ServerMessageClientMessage.create(`[${payload.reason}] ${payload.message}`));
			}
		}
		response.status(200).json({ ...payload });
	}
}
