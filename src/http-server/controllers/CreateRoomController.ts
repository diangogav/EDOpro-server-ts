import { Request, Response } from "express";
import { z } from "zod";

import { RoomCreator } from "../../edopro/room/application/RoomCreator";
import { Logger } from "../../shared/logger/domain/Logger";

export const CreateRoomSchema = z.object({
  name: z.string().min(1).max(30),
  mode: z.number().int().min(0).max(2).optional(),
  bestOf: z.number().int().min(1).max(5).optional(),
  rule: z.number().int().min(0).max(5).optional(),
  banlist: z.string().min(1),
  teamQuantity: z.number().int().min(1).max(2).optional(),
  isRanked: z.boolean().optional(),
  tournament: z.string().optional(),
});

export type CreateRoomRequest = z.infer<typeof CreateRoomSchema>;

export class CreateRoomController {
  constructor(private readonly logger: Logger) {}

  run(req: Request, res: Response): void {
    const validation = CreateRoomSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        success: false,
        errors: validation.error.issues,
      });
      return;
    }

    const payload = validation.data;
    const roomCreator = new RoomCreator(this.logger);
    const response = roomCreator.create(payload);
    res.status(200).json(response);
  }
}
