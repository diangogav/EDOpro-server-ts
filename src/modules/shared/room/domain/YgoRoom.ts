import { EventEmitter } from "stream";

import { YGOClientSocket } from "../../../../socket-server/HostServer";

export abstract class YgoRoom {
	protected emitter: EventEmitter;

	emit(event: string, message: unknown, socket: YGOClientSocket): void {
		this.emitter.emit(event, message, this, socket);
	}
}
