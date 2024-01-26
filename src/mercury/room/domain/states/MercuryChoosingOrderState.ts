/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import EventEmitter from "events";

import { CoreMessages } from "../../../../modules/messages/domain/CoreMessages";
import { ClientMessage } from "../../../../modules/messages/MessageProcessor";
import { RoomState } from "../../../../modules/room/domain/RoomState";
import { Logger } from "../../../../modules/shared/logger/domain/Logger";
import { MercuryClient } from "../../../client/domain/MercuryClient";
import { MercuryRoom } from "../MercuryRoom";

export class MercuryChoosingOrderState extends RoomState {
	constructor(eventEmitter: EventEmitter, private readonly logger: Logger) {
		super(eventEmitter);
		this.eventEmitter.on(
			"GAME_MSG",
			(message: ClientMessage, room: MercuryRoom, client: MercuryClient) =>
				this.startHandler.bind(this)(message, room, client)
		);
	}

	private startHandler(message: ClientMessage, _room: MercuryRoom, _player: MercuryClient): void {
		this.logger.info("MERCURY: GAME_MSG");
		const gameMessage = message.data[0];
		if (gameMessage === CoreMessages.MSG_START) {
			this.logger.info("MERCURY CORE: MSG_START");
		}
	}
}
