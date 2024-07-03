import { Request, Response } from "express";

import MercuryRoomList from "../../mercury/room/infrastructure/MercuryRoomList";
import { ServerMessageClientMessage } from "../../modules/messages/server-to-client/ServerMessageClientMessage";
import RoomList from "../../modules/room/infrastructure/RoomList";
import { Logger } from "../../modules/shared/logger/domain/Logger";

export class CreateMessageRequest {
	message: string;
	sender: string;
}

export class SendMessageToAllRooms {
	constructor(private readonly logger: Logger) {}

	// eslint-disable-next-line @typescript-eslint/require-await
	async run(req: Request, response: Response): Promise<void> {
		const payload = req.body as CreateMessageRequest;
		const rooms = [...RoomList.getRooms(), ...MercuryRoomList.getRooms()];
		for (const room of rooms) {
			const allClients = [...room.clients, ...room.spectators];
			for (const client of allClients) {
				const socket = client.socket;
				socket.send(ServerMessageClientMessage.create(payload.message));
			}
		}
		response.status(200).json({ ...payload });
	}
}
