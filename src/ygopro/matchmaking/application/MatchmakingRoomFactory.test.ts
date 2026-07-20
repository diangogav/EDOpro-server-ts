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
