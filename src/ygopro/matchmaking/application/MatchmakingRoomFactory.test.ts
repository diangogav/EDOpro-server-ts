import { EventEmitter } from "stream";

import { RoomLeague } from "@shared/room/admission/domain/RoomLeague";

import { MATCHMAKING_FORMATS } from "../domain/QueueEntry";
import YGOProRoomList from "../../room/infrastructure/YGOProRoomList";
import {
	createMatchmakingRoom,
	FORMAT_ROOM_TOKEN,
	FORMAT_ROOM_TOKEN_MATCH,
} from "./MatchmakingRoomFactory";

const makeLogger = () =>
	({
		child: jest.fn().mockReturnThis(),
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(),
	}) as never;

const clearRooms = () => {
	const rooms = YGOProRoomList.getRooms();
	while (rooms.length) {
		YGOProRoomList.deleteRoom(rooms[0]);
	}
};

describe("createMatchmakingRoom", () => {
	beforeEach(clearRooms);
	afterEach(clearRooms);

	it("creates a ranked (Verified) TCG room and registers it in the room list", () => {
		const { room, roomPassword } = createMatchmakingRoom({
			rankedOverride: true,
			logger: makeLogger(),
			emitter: new EventEmitter(),
		});

		expect(room.league).toBe(RoomLeague.Verified);
		expect(room.ranked).toBe(true);
		// rule 5 = open pool, TCG banlist (from the "tt" token — toot alias):
		// the TCG format is banlist-defined, so OCG-only printings stay playable.
		expect(room.hostInfo.rule).toBe(5);
		expect(room.isMatchmaking).toBe(true);
		expect(YGOProRoomList.findById(room.id)).toBe(room);
	});

	it("creates an unrated (Casual) room for bot games when rankedOverride is false", () => {
		const { room } = createMatchmakingRoom({
			rankedOverride: false,
			logger: makeLogger(),
			emitter: new EventEmitter(),
		});

		expect(room.league).toBe(RoomLeague.Casual);
		expect(room.ranked).toBe(false);
	});

	it("creates a best-of-3 MATCH room for ranked human pairs (matchMode)", () => {
		const { room } = createMatchmakingRoom({
			rankedOverride: true,
			matchMode: true,
			logger: makeLogger(),
			emitter: new EventEmitter(),
		});

		expect(room.bestOf).toBe(3);
		expect(room.isMatch).toBe(true);
		// "tmr" = same rule set as "tt" (rule 5 + first TCG lflist) + best-of-3 MATCH.
		expect(room.name.startsWith("tmr,")).toBe(true);
		expect(room.hostInfo.rule).toBe(5);
	});

	it('uses the "jm" token for jtp MATCH rooms (jtp rules + best-of-3)', () => {
		const { room } = createMatchmakingRoom({
			format: "jtp",
			rankedOverride: true,
			matchMode: true,
			logger: makeLogger(),
			emitter: new EventEmitter(),
		});

		expect(room.bestOf).toBe(3);
		expect(room.isMatch).toBe(true);
		expect(room.name.startsWith("jm,")).toBe(true);
		expect(room.hostInfo.rule).toBe(5);
	});

	it("keeps rooms best-of-1 when matchMode is omitted (bot fallback — windbot cannot side-deck)", () => {
		const { room } = createMatchmakingRoom({
			rankedOverride: false,
			logger: makeLogger(),
			emitter: new EventEmitter(),
		});

		expect(room.bestOf).toBe(1);
		expect(room.isMatch).toBe(false);
		expect(room.name.startsWith("tt,")).toBe(true);
	});

	it("returns roomPassword as the exact command#password join string", () => {
		const { room, roomPassword } = createMatchmakingRoom({
			rankedOverride: true,
			logger: makeLogger(),
			emitter: new EventEmitter(),
		});

		// The join string the client sends in CTOS_JOIN_GAME { pass }:
		// "<room-name>#<password>", where room.name is the config segment.
		expect(roomPassword).toBe(`${room.name}#${room.password}`);
		// Both halves must be resolvable by TicketJoinStrategy:
		const [command, password] = roomPassword.split("#");
		expect(YGOProRoomList.findByName(command)).toBe(room);
		expect(room.password).toBe(password);
	});

	// The client encodes CTOS_JOIN_GAME { pass } as a FIXED utf16[20] field
	// (ygopro-msg-encode: BinaryField("utf16", 8, 20)). A join string longer
	// than the field is silently truncated on the wire, destroying the
	// password segment and breaking the human join. 19 is the safe ceiling
	// (leaves one wchar of margin for a terminator); 20 is the hard cap.
	//
	// This guard exercises the REAL generator for EVERY format (including "jtp",
	// the 19-char boundary case) over many iterations, so it catches any drift in
	// the actual token / entropy / password segment lengths — no modeled arithmetic.
	it.each(
		MATCHMAKING_FORMATS,
	)("produces a join string that fits the CTOS_JOIN_GAME pass field (<= 19 chars) for format %s", (format) => {
		for (let i = 0; i < 500; i++) {
			const { roomPassword } = createMatchmakingRoom({
				format,
				rankedOverride: true,
				logger: makeLogger(),
				emitter: new EventEmitter(),
			});

			expect(roomPassword.length).toBeLessThanOrEqual(19);
		}
	});

	// Same guard over the MATCH tokens. "tmr" (3 chars) fills the budget to the
	// 19-char total (token + 16-char "mm<5>#<7>" suffix), exactly like "jtp".
	it.each(
		MATCHMAKING_FORMATS,
	)("produces a join string that fits the pass field (<= 19 chars) for MATCH rooms, format %s", (format) => {
		for (let i = 0; i < 500; i++) {
			const { roomPassword } = createMatchmakingRoom({
				format,
				rankedOverride: true,
				matchMode: true,
				logger: makeLogger(),
				emitter: new EventEmitter(),
			});

			expect(roomPassword.length).toBeLessThanOrEqual(19);
		}
	});

	it("keeps a non-empty TCG name prefix and a non-empty password segment", () => {
		const { roomPassword } = createMatchmakingRoom({
			rankedOverride: true,
			logger: makeLogger(),
			emitter: new EventEmitter(),
		});

		const [name, password] = roomPassword.split("#");
		// The name must still start with the short toot alias so the room
		// resolves to rule 5 (open pool) + TCG banlist.
		expect(name.startsWith("tt,")).toBe(true);
		// A non-empty password keeps the room private (needpass: true) so random
		// players in the open list cannot join a matchmaking room.
		expect(password.length).toBeGreaterThan(0);
	});

	it("resolves both paired players to the SAME room via the identical join string", () => {
		// Matchmaking hands the SAME join string to both matched players. Each
		// sends it in CTOS_JOIN_GAME { pass }; both must land in this one room.
		const { room, roomPassword } = createMatchmakingRoom({
			rankedOverride: true,
			logger: makeLogger(),
			emitter: new EventEmitter(),
		});

		const joinStringPlayerA = roomPassword;
		const joinStringPlayerB = roomPassword;
		expect(joinStringPlayerA).toBe(joinStringPlayerB);

		const [nameA, passwordA] = joinStringPlayerA.split("#");
		const [nameB, passwordB] = joinStringPlayerB.split("#");

		expect(YGOProRoomList.findByName(nameA)).toBe(room);
		expect(YGOProRoomList.findByName(nameB)).toBe(room);
		expect(room.password).toBe(passwordA);
		expect(room.password).toBe(passwordB);
	});

	it("generates a unique room name/password per pair (no collision across calls)", () => {
		const a = createMatchmakingRoom({
			rankedOverride: true,
			logger: makeLogger(),
			emitter: new EventEmitter(),
		});
		const b = createMatchmakingRoom({
			rankedOverride: true,
			logger: makeLogger(),
			emitter: new EventEmitter(),
		});

		expect(a.roomPassword).not.toBe(b.roomPassword);
		expect(a.room.name).not.toBe(b.room.name);
	});

	it("builds the room without any client PlayerInfo wire bytes (additive path)", () => {
		// Must not throw despite no connected client / PlayerInfoMessage.
		expect(() =>
			createMatchmakingRoom({
				rankedOverride: true,
				logger: makeLogger(),
				emitter: new EventEmitter(),
			}),
		).not.toThrow();
	});
});

describe("FORMAT_ROOM_TOKEN", () => {
	it("has a token for every format in MATCHMAKING_FORMATS", () => {
		for (const fmt of MATCHMAKING_FORMATS) {
			const token = FORMAT_ROOM_TOKEN[fmt];
			expect(typeof token).toBe("string");
			expect(token.length).toBeGreaterThan(0);
		}
	});

	it('maps tcg to the "tt" token (toot alias: rule 5 + TCG lflist) and jtp to "jtp"', () => {
		expect(FORMAT_ROOM_TOKEN.tcg).toBe("tt");
		expect(FORMAT_ROOM_TOKEN.jtp).toBe("jtp");
	});
});

describe("FORMAT_ROOM_TOKEN_MATCH", () => {
	it("has a MATCH token for every format in MATCHMAKING_FORMATS", () => {
		for (const fmt of MATCHMAKING_FORMATS) {
			const token = FORMAT_ROOM_TOKEN_MATCH[fmt];
			expect(typeof token).toBe("string");
			expect(token.length).toBeGreaterThan(0);
			// Wire budget: token.length + 16 <= 19 (see the factory doc comment).
			expect(token.length).toBeLessThanOrEqual(3);
		}
	});

	it('maps tcg to "tmr" (tt rules + best-of-3) and jtp to "jm"', () => {
		expect(FORMAT_ROOM_TOKEN_MATCH.tcg).toBe("tmr");
		expect(FORMAT_ROOM_TOKEN_MATCH.jtp).toBe("jm");
	});
});
