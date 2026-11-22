import { randomUUID } from "node:crypto";

import RoomList from "@edopro/room/infrastructure/RoomList";
import { Logger } from "@shared/logger/domain/Logger";
import { DuelState, YgoRoom } from "@shared/room/domain/YgoRoom";
import { HandshakeTicketStore } from "@shared/ticket/domain/TicketRepository";
import { UserProfilePostgresRepository } from "@shared/user-profile/infrastructure/postgres/UserProfilePostgresRepository";
import { MatchmakingQueue } from "@ygopro/matchmaking/application/MatchmakingQueue";
import YGOProRoomList from "@ygopro/room/infrastructure/YGOProRoomList";
import {
	AccountStatusProbe,
	ChallengeMatchmaking,
	ChallengeRoomIssuer,
	PresenceHub,
} from "src/presence/application/PresenceHub";
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
						room.duelState !== DuelState.WAITING &&
						room.players.some((player) => player.id === userId && !player.socket.closed),
				);
			if (inDuel) {
				return "in-duel";
			}

			return sources.isSearching(userId) ? "searching" : "free";
		},
	};
}

interface SeatedRoom {
	readonly isMatchmaking: boolean;
	readonly players: readonly {
		readonly id: string | null;
		readonly socket: { readonly closed: boolean };
	}[];
}

/**
 * Matchmaking as a challenge sees it: an account is matched when the queue
 * formed or proposed a match for it, or when it already sits in a matchmaking
 * room that has not started yet.
 */
export function createChallengeMatchmaking(sources: {
	queue: () => Pick<MatchmakingQueue, "isUserMatched" | "removeUser"> | null;
	rooms: () => readonly SeatedRoom[];
}): ChallengeMatchmaking {
	return {
		isMatched(userId: string) {
			if (sources.queue()?.isUserMatched(userId)) {
				return true;
			}

			return sources
				.rooms()
				.some(
					(room) =>
						room.isMatchmaking &&
						room.players.some((player) => player.id === userId && !player.socket.closed),
				);
		},
		removeUser(userId: string) {
			sources.queue()?.removeUser(userId);
		},
	};
}

/**
 * Puts the online list on the room-list WebSocket. Call after the WebSocket
 * server and matchmaking are started.
 */
export function bootstrapPresence(
	logger: Logger,
	tickets: HandshakeTicketStore,
	challengeRooms: ChallengeRoomIssuer,
): PresenceHub {
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
		matchmaking: createChallengeMatchmaking({
			queue: () => (MatchmakingQueue.isInitialized() ? MatchmakingQueue.getInstance() : null),
			rooms: () => YGOProRoomList.getRooms(),
		}),
		challengeRooms,
		schedule: (callback, delayMs) => {
			const timer = setTimeout(callback, delayMs);
			timer.unref();

			return () => clearTimeout(timer);
		},
		newChallengeId: () => randomUUID(),
	});
	roomList.attachPresence(hub);
	setInterval(() => hub.refreshStatuses(), PRESENCE_STATUS_REFRESH_MS).unref();

	return hub;
}
