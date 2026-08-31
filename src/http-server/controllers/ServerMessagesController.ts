import { Request, Response } from "express";
import { z } from "zod";

import { ChatColor } from "ygopro-msg-encode";

import { createSystemChat } from "../../shared/room/domain/chat/SystemChat";
import RoomList from "../../edopro/room/infrastructure/RoomList";
import MercuryRoomList from "@ygopro/room/infrastructure/YGOProRoomList";

export const ServerMessageSchema = z.object({
	message: z.string().min(1).max(500),
	reason: z.string().min(1).max(50),
});

export type CreateMessageRequest = z.infer<typeof ServerMessageSchema>;

export class ServerMessagesController {
	async run(req: Request, response: Response): Promise<void> {
		const validation = ServerMessageSchema.safeParse(req.body);

		if (!validation.success) {
			response.status(400).json({
				success: false,
				errors: validation.error.issues,
			});
			return;
		}

		const payload = validation.data;
		const frame = createSystemChat(ChatColor.YELLOW, `[${payload.reason}] ${payload.message}`);
		const rooms = [...RoomList.getRooms(), ...MercuryRoomList.getRooms()];
		for (const room of rooms) {
			const allClients = [...room.players, ...room.spectators];
			for (const client of allClients) {
				client.socket.send(frame);
			}
		}
		response.status(200).json({ ...payload });
	}
}
