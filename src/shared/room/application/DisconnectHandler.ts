import { Logger } from "@shared/logger/domain/Logger";

import { ISocket } from "../../socket/domain/ISocket";
import { SocketDisconnectListener } from "../../socket/domain/SocketDisconnectListener";
import { RoomDisconnectPolicy } from "../domain/RoomDisconnectPolicy";
import { RoomFinder } from "./RoomFinder";

/** A caller that has no logger to inject (e.g. an existing test constructing
 * this handler directly) still gets safe, silent behavior. */
const NOOP_LOGGER: Logger = {
	debug: () => undefined,
	error: () => undefined,
	info: () => undefined,
	warn: () => undefined,
	child: () => NOOP_LOGGER,
};

/**
 * Runs every listener first (a socket can be closed with no room at all), then
 * hands the socket's room to the first protocol policy that handles it.
 */
export class DisconnectHandler {
	constructor(
		private readonly socket: ISocket,
		private readonly roomFinder: RoomFinder,
		private readonly policies: RoomDisconnectPolicy[],
		private readonly listeners: SocketDisconnectListener[],
		private readonly logger: Logger = NOOP_LOGGER,
	) {}

	run(): void {
		if (!this.socket.id) {
			return;
		}

		for (const listener of this.listeners) {
			listener.onSocketClosed(this.socket.id, this.logger);
		}

		const room = this.roomFinder.run(this.socket.id);
		if (!room) {
			return;
		}

		this.policies
			.find((policy) => policy.handles(room))
			?.onDisconnect(room, this.socket, this.logger);
	}
}
