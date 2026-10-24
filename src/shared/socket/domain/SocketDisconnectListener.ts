import { Logger } from "../../logger/domain/Logger";

/** Reacts to a socket closing before its room, if any, is looked up. */
export interface SocketDisconnectListener {
	onSocketClosed(socketId: string, logger: Logger): void;
}
