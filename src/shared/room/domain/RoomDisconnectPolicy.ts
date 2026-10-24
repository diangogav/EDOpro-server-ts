import { Logger } from "../../logger/domain/Logger";
import { ISocket } from "../../socket/domain/ISocket";
import { YgoRoom } from "./YgoRoom";

/** What one protocol does with its room when a socket in it disconnects. */
export interface RoomDisconnectPolicy {
	handles(room: YgoRoom): boolean;
	onDisconnect(room: YgoRoom, socket: ISocket, logger: Logger): void;
}
