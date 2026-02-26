import { Request, Response } from "express";
import { z } from "zod";

import { ServerMessageClientMessage } from "../../edopro/messages/server-to-client/ServerMessageClientMessage";
import RoomList from "../../edopro/room/infrastructure/RoomList";
import MercuryRoomList from "../../mercury/room/infrastructure/MercuryRoomList";
import { Logger } from "../../shared/logger/domain/Logger";

export const ServerMessageSchema = z.object({
  message: z.string().min(1).max(500),
  reason: z.string().min(1).max(50),
});

export type CreateMessageRequest = z.infer<typeof ServerMessageSchema>;

export class ServerMessagesController {
  constructor(private readonly logger: Logger) {}

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
    const rooms = [...RoomList.getRooms(), ...MercuryRoomList.getRooms()];
    for (const room of rooms) {
      const allClients = [...room.clients, ...room.spectators];
      for (const client of allClients) {
        const socket = client.socket;
        socket.send(
          ServerMessageClientMessage.create(
            `[${payload.reason}] ${payload.message}`,
          ),
        );
      }
    }
    response.status(200).json({ ...payload });
  }
}
