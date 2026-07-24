import { randomInt } from "crypto";
import { EventEmitter } from "stream";

import { PlayerInfoMessage } from "@edopro/messages/client-to-server/PlayerInfoMessage";
import { Logger } from "@shared/logger/domain/Logger";

import { generateUniqueId } from "src/utils/generateUniqueId";

import { MatchmakingFormat } from "@ygopro/matchmaking/domain/QueueEntry";
import { YGOProMessageRepository } from "../../room/infrastructure/YGOProMessageRepository";
import { YGOProRoom } from "../../room/domain/YGOProRoom";
import YGOProRoomList from "../../room/infrastructure/YGOProRoomList";

/**
 * Per-format room command token. Governs the banlist/rule set applied to the room.
 *
 * WIRE-BUDGET CONSTRAINT: the full join string "<token>,mm<5>#{7}" must be ≤ 19
 * UTF-16 chars. Any token here must satisfy: token.length + 16 ≤ 19, i.e. ≤ 3 chars.
 * "to" (2) and "jtp" (3) both satisfy this; "jtp" is the 19-char boundary with
 * zero slack. See MatchmakingRoomFactory.test.ts.
 */
export const FORMAT_ROOM_TOKEN: Record<MatchmakingFormat, string> = {
	tcg: "to",
	jtp: "jtp",
};

export interface CreateMatchmakingRoomInput {
	/** Format determines the room command token (banlist/rule set). Defaults to "tcg"
	 * for backwards compatibility when callers do not supply it. */
	format?: MatchmakingFormat;
	/** true → ranked (Verified) human pair; false → unrated (Casual) bot game. */
	rankedOverride: boolean;
	logger: Logger;
	emitter: EventEmitter;
	/**
	 * Invoked with the freshly created room BEFORE it is returned. The composition
	 * root uses this to register the room with the empty-room reaper so a room that
	 * is never joined (rage-quit, ticket expiry, network drop) is torn down instead
	 * of leaking forever. Optional so tests can create rooms without a reaper.
	 */
	onRoomCreated?: (room: YGOProRoom) => void;
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
 * The per-format command token comes from FORMAT_ROOM_TOKEN and governs the
 * rule set + banlist (tcg → "to" → rule 1 + first TCG banlist; jtp → "jtp").
 * A unique "mm<base36>" token is appended purely to make the room name/join-
 * string unique; its "mm" prefix guarantees it never matches a rule mapping
 * validator (all rule tokens are exact strings or anchored regexes that never
 * start with "mm"), so the parser ignores it.
 *
 * CRITICAL — wire-field budget: the client encodes CTOS_JOIN_GAME { pass } as a
 * FIXED utf16[20] field (ygopro-msg-encode: BinaryField("utf16", 8, 20)). Any
 * join string longer than the field is silently truncated on encode, which
 * destroys the "#password" segment and makes the human's join fail the password
 * check. The full "<name>#<password>" string MUST therefore stay <= 19 chars
 * (19 is the safe ceiling: it leaves one wchar of margin for a terminator; 20
 * is the hard cap where the field is completely full with no terminator).
 *
 * Layout within the 19-char budget:
 *   "<token>," + "mm" + 5 base36 (7) + "#" (1) + 7 base36 (7)
 *   = token.length + 1 + 7 + 1 + 7 = token.length + 16.
 * The longest token is "jtp" (3), so the WORST CASE is jtp at exactly 19 chars —
 * ZERO slack. Growing any segment (token length, name entropy, or password
 * length) is forbidden unless another segment shrinks to keep the jtp join at
 * <= 19. See MatchmakingRoomFactory.test.ts for the per-format wire-budget guard.
 */
const NAME_ENTROPY_CHARS = 5;
const PASSWORD_CHARS = 7;

function randomBase36(length: number): string {
	let out = "";
	for (let i = 0; i < length; i++) {
		out += randomInt(36).toString(36);
	}

	return out;
}

export function createMatchmakingRoom(input: CreateMatchmakingRoomInput): MatchmakingRoomHandle {
	const token = FORMAT_ROOM_TOKEN[input.format ?? "tcg"];

	// "mm"-prefixed base36 suffix: collision-proof against rule tokens and unique
	// enough that a clash in YGOProRoomList is astronomically rare — but we still
	// regenerate on the off chance a live room already owns the name so both
	// matched players resolve to the SAME room via findByName.
	let unique = `mm${randomBase36(NAME_ENTROPY_CHARS)}`;
	while (YGOProRoomList.findByName(`${token},${unique}`)) {
		unique = `mm${randomBase36(NAME_ENTROPY_CHARS)}`;
	}

	const password = randomBase36(PASSWORD_CHARS);
	const command = `${token},${unique}#${password}`;

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
	room.isMatchmaking = true;
	room.waiting();

	// Register with the empty-room reaper (if wired) so an unjoined room does not
	// leak: nothing else reaps a matchmaking room that never sees a real socket.
	input.onRoomCreated?.(room);

	return { room, roomPassword: `${room.name}#${room.password}` };
}
