import { EdoproDisconnectPolicy } from "@edopro/room/application/EdoproDisconnectPolicy";
import { Logger } from "@shared/logger/domain/Logger";
import { DisconnectHandler } from "@shared/room/application/DisconnectHandler";
import { RoomFinder } from "@shared/room/application/RoomFinder";
import { ISocket } from "@shared/socket/domain/ISocket";
import { MatchmakingDisconnectListener } from "@ygopro/matchmaking/application/MatchmakingDisconnectListener";
import { YGOProDisconnectPolicy } from "@ygopro/room/application/YGOProDisconnectPolicy";

const policies = [new EdoproDisconnectPolicy(), new YGOProDisconnectPolicy()];
const listeners = [new MatchmakingDisconnectListener()];

/** Disconnect handling for a socket of either protocol: matchmaking dequeue first, then the room's policy. */
export function createDisconnectHandler(
	socket: ISocket,
	roomFinder: RoomFinder,
	logger?: Logger,
): DisconnectHandler {
	return new DisconnectHandler(socket, roomFinder, policies, listeners, logger);
}
