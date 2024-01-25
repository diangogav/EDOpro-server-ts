/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import EventEmitter from "events";

import { ClientMessage } from "../../../../modules/messages/MessageProcessor";
import { RoomState } from "../../../../modules/room/domain/RoomState";
import { Logger } from "../../../../modules/shared/logger/domain/Logger";
import { MercuryClient } from "../../../client/domain/MercuryClient";
import { MercuryRoom } from "../MercuryRoom";

export class MercuryRockPaperScissorState extends RoomState {
	constructor(eventEmitter: EventEmitter, private readonly logger: Logger) {
		super(eventEmitter);
		this.eventEmitter.on(
			"SELECT_TP",
			(message: ClientMessage, room: MercuryRoom, client: MercuryClient) =>
				this.handle.bind(this)(message, room, client)
		);
	}

	private handle(message: ClientMessage, room: MercuryRoom, _player: MercuryClient): void {
		this.logger.info("MERCURY: SELECT_TP");
	}
}
