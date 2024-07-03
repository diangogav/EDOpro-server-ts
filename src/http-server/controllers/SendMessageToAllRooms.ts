import { Request, Response } from "express";

import MercuryRoomList from "../../mercury/room/infrastructure/MercuryRoomList";
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
		const rooms = RoomList.getRooms().map((room) => room.toPresentation());
		const mercuryRooms = MercuryRoomList.getRooms().map((room) => room.toPresentation());
		const allRooms = [...mercuryRooms, ...rooms];
		// TODO: Implement the logic to send a message to all rooms
		// Find the socket by room id, this can be done by a method that receives the room id and returns the socket or a methos that retunrs a room list with the socket
		response.status(200).json({ rooms: allRooms, ...payload });
	}
}
