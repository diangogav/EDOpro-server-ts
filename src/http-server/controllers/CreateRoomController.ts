import { Request, Response } from "express";

import { BanListMemoryRepository } from "../../modules/ban-list/infrastructure/BanListMemoryRepository";
import { RoomCreator } from "../../modules/room/application/RoomCreator";
import { Logger } from "../../modules/shared/logger/domain/Logger";

export class CreateRoomRequest {
	name: string;
	bestOf: number;
	allowed: number;
	tournament: string;
	banlist: string;
}

export class CreateRoomController {
	constructor(private readonly logger: Logger) {}

	run(req: Request, res: Response): void {
		const payload = req.body as CreateRoomRequest;
		const roomCreator = new RoomCreator(this.logger, new BanListMemoryRepository());
		const response = roomCreator.create(payload);
		res.status(200).json(response);
	}
}
