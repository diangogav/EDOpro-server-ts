import { randomUUID } from "node:crypto";

import RoomList from "@edopro/room/infrastructure/RoomList";
import { Logger } from "@shared/logger/domain/Logger";
import { YgoRoom } from "@shared/room/domain/YgoRoom";
import { HandshakeTicketStore } from "@shared/ticket/domain/TicketRepository";
import { UserProfilePostgresRepository } from "@shared/user-profile/infrastructure/postgres/UserProfilePostgresRepository";
import { MatchmakingQueue } from "@ygopro/matchmaking/application/MatchmakingQueue";
import YGOProRoomList from "@ygopro/room/infrastructure/YGOProRoomList";
import { AccountStatusProbe, PresenceHub } from "src/presence/application/PresenceHub";
import WebSocketSingleton from "src/web-socket-server/WebSocketSingleton";

/** How often account statuses are re-read from the rooms and the matchmaking queue. */
export const PRESENCE_STATUS_REFRESH_MS = 2_000;

export function createAccountStatusProbe(sources: {
	rooms: () => readonly YgoRoom[];
	isSearching: (userId: string) => boolean;
}): AccountStatusProbe {
	return {
		statusOf(userId: string) {
			const inDuel = sources
				.rooms()
				.some(
					(room) =>
						room.turn > 0 &&
						room.players.some((player) => player.id === userId && !player.socket.closed),
				);
			if (inDuel) {
				return "in-duel";
			}

			return sources.isSearching(userId) ? "searching" : "free";
		},
	};
}

/**
 * Puts the online list on the room-list WebSocket. Call after the WebSocket
 * server and matchmaking are started.
 */
export function bootstrapPresence(logger: Logger, tickets: HandshakeTicketStore): PresenceHub {
	const profiles = new UserProfilePostgresRepository();
	const roomList = WebSocketSingleton.getInstance();
	const hub = new PresenceHub({
		transport: roomList,
		tickets,
		accounts: {
			findUsername: async (userId) => (await profiles.findById(userId))?.username ?? null,
			isBanned: (userId) => profiles.isBanned(userId),
		},
		statusProbe: createAccountStatusProbe({
			rooms: () => [...YGOProRoomList.getRooms(), ...RoomList.getRooms()],
			isSearching: (userId) => {
				if (!MatchmakingQueue.isInitialized()) {
					return false;
				}
				const queue = MatchmakingQueue.getInstance();

				return queue.isUserQueued(userId) || queue.getPool().isUserSearching(userId);
			},
		}),
		logger,
		newGuestId: () => randomUUID(),
		now: () => Date.now(),
	});
	roomList.attachPresence(hub);
	setInterval(() => hub.refreshStatuses(), PRESENCE_STATUS_REFRESH_MS).unref();

	return hub;
}
