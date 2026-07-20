import { randomUUID } from "crypto";
import { EventEmitter } from "stream";

import { PlayerInfoMessage } from "@edopro/messages/client-to-server/PlayerInfoMessage";
import { Logger } from "@shared/logger/domain/Logger";

import { generateUniqueId } from "src/utils/generateUniqueId";

import { YGOProMessageRepository } from "../../room/infrastructure/YGOProMessageRepository";
import { YGOProRoom } from "../../room/domain/YGOProRoom";
import YGOProRoomList from "../../room/infrastructure/YGOProRoomList";

export interface CreateMatchmakingRoomInput {
	/** true → ranked (Verified) human pair; false → unrated (Casual) bot game. */
	rankedOverride: boolean;
	logger: Logger;
	emitter: EventEmitter;
}

export interface MatchmakingRoomHandle {
	room: YGOProRoom;
	/**
	 * The EXACT string a client must send in CTOS_JOIN_GAME { pass } to land in
	 * this room: "<room-name>#<password>". Both paired players send this same
	 * string; TicketJoinStrategy resolves it to this room by name + password.
	 */
	roomPassword: string;
}

/**
 * Additive room-creation seam for matchmaking (RISK-1).
 *
 * The normal ticket path builds a room from a client's CTOS_JOIN_GAME wire bytes
 * (a PlayerInfoMessage). Matchmaking pairs players BEFORE either connects, so no
 * such wire message exists yet. This factory reuses the SAME YGOProRoom.create()
 * path with a synthetic, empty PlayerInfoMessage — the host's name/PIN are never
 * read for a matchmaking room (league is decided by rankedOverride, not the PIN,
 * and the seat name comes from each player's own join later). The existing
 * create() path is left untouched.
 *
 * Command token "to" → rule 1 + first TCG banlist (strict TCG). A unique
 * "mm-<uuid>" token is appended purely to make the room name/join-string unique;
 * it matches no rule mapping, so the parser ignores it.
 */
export function createMatchmakingRoom(input: CreateMatchmakingRoomInput): MatchmakingRoomHandle {
	const unique = randomUUID().replace(/-/g, "").slice(0, 12);
	const password = randomUUID().replace(/-/g, "").slice(0, 16);
	const command = `to,mm-${unique}#${password}`;

	// Empty buffer → name "", password null. Never surfaced to a client because
	// nobody has joined this room yet; each real player supplies their own name.
	const syntheticPlayerInfo = new PlayerInfoMessage(Buffer.alloc(0), 0);

	const room = YGOProRoom.create(
		generateUniqueId(),
		command,
		input.logger,
		input.emitter,
		syntheticPlayerInfo,
		// No creating socket — the room exists independently of any connection.
		`matchmaking-${unique}`,
		new YGOProMessageRepository(),
		input.rankedOverride,
	);

	YGOProRoomList.addRoom(room);
	room.waiting();

	return { room, roomPassword: `${room.name}#${room.password}` };
}
