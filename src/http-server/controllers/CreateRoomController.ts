import { Request, Response } from "express";

import { RoomCreator } from "../../edopro/room/application/RoomCreator";
import { Logger } from "../../shared/logger/domain/Logger";

export class CreateRoomRequest {
	name: string;
	mode: number;
	bestOf: number;
	rule: number;
	banlist: string;
	teamQuantity: number;
	isRanked: boolean;
	tournament: string;
}

export class CreateRoomController {
	constructor(private readonly logger: Logger) {}

	run(req: Request, res: Response): void {
		const payload = req.body as CreateRoomRequest;
		const roomCreator = new RoomCreator(this.logger);
		const response = roomCreator.create(payload);
		res.status(200).json(response);
	}
}
