/* eslint-disable @typescript-eslint/no-floating-promises */
import net from "net";

import { PlayerInfoMessage } from "../../../messages/client-to-server/PlayerInfoMessage";
import { ErrorMessages } from "../../../messages/server-to-client/error-messages/ErrorMessages";
import { ErrorClientMessage } from "../../../messages/server-to-client/ErrorClientMessage";
import { UserFinder } from "../../../user/application/UserFinder";
import { Room } from "../../domain/Room";
import { JoinHandler } from "./JoinHandler";

export class Auth implements JoinHandler {
	private nextHandler: JoinHandler | null = null;

	constructor(
		private readonly room: Room,
		private readonly userFinder: UserFinder,
		private readonly playerInfo: PlayerInfoMessage,
		private readonly socket: net.Socket
	) {}

	setNextHandler(handler: JoinHandler): JoinHandler {
		this.nextHandler = handler;

		return handler;
	}

	async tryToJoin(): Promise<ErrorClientMessage | null> {
		if (!this.room.ranked) {
			return this.nextHandler?.tryToJoin() ?? null;
		}

		const user = await this.userFinder.run(this.playerInfo);
		if (user instanceof Buffer) {
			this.socket.write(user);

			return ErrorClientMessage.create(ErrorMessages.JOINERROR);
		}

		if (this.nextHandler) {
			return this.nextHandler.tryToJoin();
		}

		return null;
	}
}
