import { EventEmitter } from "stream";

import { RoomLeague } from "@shared/room/admission/domain/RoomLeague";

import { ErrorMessageType } from "ygopro-msg-encode";

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
			reservedUserIds: ["u-a", "u-b"],
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
			reservedUserIds: ["u-a", "u-b"],
			rankedOverride: false,
			logger: makeLogger(),
			emitter: new EventEmitter(),
		});

		expect(room.league).toBe(RoomLeague.Casual);
		expect(room.ranked).toBe(false);
	});

	it("creates a best-of-3 MATCH room for ranked human pairs (matchMode)", () => {
		const { room } = createMatchmakingRoom({
			reservedUserIds: ["u-a", "u-b"],
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
			reservedUserIds: ["u-a", "u-b"],
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

	it('uses the "ed" token for edison single rooms (MR1 + edison banlist)', () => {
		const { room } = createMatchmakingRoom({
			reservedUserIds: ["u-a", "u-b"],
			format: "edison",
			rankedOverride: false,
			logger: makeLogger(),
			emitter: new EventEmitter(),
		});

		expect(room.name.startsWith("ed,")).toBe(true);
		// Edison is Master Rule 1 over the open pool — the banlist defines the format.
		expect(room.hostInfo.rule).toBe(5);
		expect(room.hostInfo.duel_rule).toBe(1);
		expect(room.bestOf).toBe(1);
	});

	it('uses the "edm" token for edison MATCH rooms (edison rules + best-of-3)', () => {
		const { room } = createMatchmakingRoom({
			reservedUserIds: ["u-a", "u-b"],
			format: "edison",
			rankedOverride: true,
			matchMode: true,
			logger: makeLogger(),
			emitter: new EventEmitter(),
		});

		expect(room.bestOf).toBe(3);
		expect(room.isMatch).toBe(true);
		expect(room.name.startsWith("edm,")).toBe(true);
		expect(room.hostInfo.duel_rule).toBe(1);
	});

	it("keeps rooms best-of-1 when matchMode is omitted (bot fallback — windbot cannot side-deck)", () => {
		const { room } = createMatchmakingRoom({
			reservedUserIds: ["u-a", "u-b"],
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
			reservedUserIds: ["u-a", "u-b"],
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
				reservedUserIds: ["u-a", "u-b"],
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
				reservedUserIds: ["u-a", "u-b"],
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
			reservedUserIds: ["u-a", "u-b"],
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
			reservedUserIds: ["u-a", "u-b"],
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
			reservedUserIds: ["u-a", "u-b"],
			rankedOverride: true,
			logger: makeLogger(),
			emitter: new EventEmitter(),
		});
		const b = createMatchmakingRoom({
			reservedUserIds: ["u-a", "u-b"],
			rankedOverride: true,
			logger: makeLogger(),
			emitter: new EventEmitter(),
		});

		expect(a.roomPassword).not.toBe(b.roomPassword);
		expect(a.room.name).not.toBe(b.room.name);
	});

	it("stamps the matched pair's userIds as the room's seat reservation", () => {
		const { room } = createMatchmakingRoom({
			rankedOverride: true,
			matchMode: true,
			reservedUserIds: ["u-a", "u-b"],
			logger: makeLogger(),
			emitter: new EventEmitter(),
		});

		expect(room.reservedUserIds).toEqual(["u-a", "u-b"]);
		expect(room.reservationAdmits({ resolvedUserId: "u-a" } as never)).toBe(true);
		expect(room.reservationAdmits({ resolvedUserId: "u-intruder" } as never)).toBe(false);
	});

	it("reserves only the human's userId for a bot-fallback room, keeping the bot's token path open", () => {
		const { room } = createMatchmakingRoom({
			rankedOverride: false,
			reservedUserIds: ["u-human"],
			logger: makeLogger(),
			emitter: new EventEmitter(),
		});

		expect(room.reservedUserIds).toEqual(["u-human"]);
		// The windbot authenticates with a one-shot room-bound token, not a user
		// ticket — its socket is marked internal and must stay admissible.
		expect(room.reservationAdmits({ internalForRoomId: room.id } as never)).toBe(true);
	});

	describe("reserved-room JOIN pipeline (real waiting state)", () => {
		// mercuryConfig.version = 4962, little-endian at offset 0 of CTOS_JOIN_GAME.
		const makeJoinMessage = () => {
			const data = Buffer.alloc(48);
			data.writeUInt16LE(4962, 0);
			// "Mallory" in UTF-16LE, no PIN separator.
			const previousMessage = Buffer.from("Mallory", "utf16le");
			return { data, previousMessage } as never;
		};

		const makeSocket = (resolvedUserId?: string) =>
			({
				id: "sock-stranger",
				resolvedUserId,
				remoteAddress: "10.0.0.9",
				closed: false,
				send: jest.fn(),
				close: jest.fn(),
				destroy: jest.fn(),
				onMessage: jest.fn(),
				removeAllListeners: jest.fn(),
			}) as never;

		const flush = () => new Promise((resolve) => setImmediate(resolve));

		it.each([
			["a ticketed stranger", "u-intruder"],
			["an anonymous socket", undefined],
		])("rejects %s presenting the exact join string, leaving the room untouched", async (_, userId) => {
			const { room } = createMatchmakingRoom({
				rankedOverride: true,
				matchMode: true,
				reservedUserIds: ["u-a", "u-b"],
				logger: makeLogger(),
				emitter: new EventEmitter(),
			});
			const socket = makeSocket(userId as string | undefined);

			room.emit("JOIN", makeJoinMessage(), socket);
			await flush();

			const sentBuffers = ((socket as { send: jest.Mock }).send as jest.Mock).mock.calls.map(
				([buf]) => buf as Buffer,
			);
			expect(sentBuffers).toContainEqual(
				room.messageSender.errorMessage(ErrorMessageType.JOINERROR, 0),
			);
			expect((socket as { close: jest.Mock }).close).toHaveBeenCalled();
			expect(room.playersCount).toBe(0);
			expect(room.spectators).toHaveLength(0);
			expect(YGOProRoomList.findById(room.id)).toBe(room);
		});

		it("rejects a reserved player's SECOND concurrent join, leaving their live seat intact", async () => {
			const { room } = createMatchmakingRoom({
				rankedOverride: true,
				matchMode: true,
				reservedUserIds: ["u-a", "u-b"],
				logger: makeLogger(),
				emitter: new EventEmitter(),
			});
			// Player A already holds a seat over a live socket.
			room.players.push({ id: "u-a", socket: { closed: false } } as never);

			// A second connection with the same reserved identity and a fresh
			// ticket (different wire name is irrelevant — the gate reads identity).
			const secondSocket = makeSocket("u-a");
			room.emit("JOIN", makeJoinMessage(), secondSocket);
			await flush();

			const sentBuffers = ((secondSocket as { send: jest.Mock }).send as jest.Mock).mock.calls.map(
				([buf]) => buf as Buffer,
			);
			expect(sentBuffers).toContainEqual(
				room.messageSender.errorMessage(ErrorMessageType.JOINERROR, 0),
			);
			expect((secondSocket as { close: jest.Mock }).close).toHaveBeenCalled();
			// The first seat is untouched and the opponent's seat stays free.
			expect(room.playersCount).toBe(1);
			expect(room.spectators).toHaveLength(0);
		});
	});

	describe("reservation is mandatory", () => {
		it("throws on an empty reservation list instead of creating an unguarded room", () => {
			expect(() =>
				createMatchmakingRoom({
					reservedUserIds: [],
					rankedOverride: true,
					logger: makeLogger(),
					emitter: new EventEmitter(),
				}),
			).toThrow();
			// Nothing half-created: the loud failure must not leak a room.
			expect(YGOProRoomList.getRooms()).toHaveLength(0);
		});

		it("still creates a ranked room for a two-id human pair", () => {
			const { room } = createMatchmakingRoom({
				reservedUserIds: ["u-a", "u-b"],
				rankedOverride: true,
				logger: makeLogger(),
				emitter: new EventEmitter(),
			});

			expect(room.reservedUserIds).toEqual(["u-a", "u-b"]);
		});

		it("still creates a bot-fallback room for a single reserved human", () => {
			const { room } = createMatchmakingRoom({
				reservedUserIds: ["u-human"],
				rankedOverride: false,
				logger: makeLogger(),
				emitter: new EventEmitter(),
			});

			expect(room.reservedUserIds).toEqual(["u-human"]);
		});
	});

	it("builds the room without any client PlayerInfo wire bytes (additive path)", () => {
		// Must not throw despite no connected client / PlayerInfoMessage.
		expect(() =>
			createMatchmakingRoom({
				reservedUserIds: ["u-a", "u-b"],
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
