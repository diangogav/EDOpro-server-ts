import { EventEmitter } from "stream";

import { RoomLeague } from "@shared/room/admission/domain/RoomLeague";

import YGOProRoomList from "../../room/infrastructure/YGOProRoomList";
import { createMatchmakingRoom } from "./MatchmakingRoomFactory";

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
		// rule 1 = strict TCG (from the "to" token)
		expect(room.hostInfo.rule).toBe(1);
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

	it("produces a join string that fits the CTOS_JOIN_GAME pass field (<= 19 chars)", () => {
		// The client encodes CTOS_JOIN_GAME { pass } as a FIXED utf16[20] field
		// (ygopro-msg-encode: BinaryField("utf16", 8, 20)). A join string longer
		// than the field is silently truncated on the wire, destroying the
		// password segment and breaking the human join. 19 is the safe ceiling
		// (leaves one wchar of margin for a terminator); 20 is the hard cap.
		for (let i = 0; i < 200; i++) {
			const { roomPassword } = createMatchmakingRoom({
				rankedOverride: true,
				logger: makeLogger(),
				emitter: new EventEmitter(),
			});

			expect(roomPassword.length).toBeLessThanOrEqual(19);
			expect(roomPassword.length).toBeLessThanOrEqual(20);
		}
	});

	it("keeps a non-empty TCG name prefix and a non-empty password segment", () => {
		const { roomPassword } = createMatchmakingRoom({
			rankedOverride: true,
			logger: makeLogger(),
			emitter: new EventEmitter(),
		});

		const [name, password] = roomPassword.split("#");
		// The name must still start with the shortest TCG-only token so the room
		// resolves to rule 1 + TCG banlist.
		expect(name.startsWith("to,")).toBe(true);
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
