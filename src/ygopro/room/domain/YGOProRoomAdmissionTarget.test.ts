import { PlayerInfoMessage } from "@edopro/messages/client-to-server/PlayerInfoMessage";
import { Seat } from "@shared/room/admission/domain/Seat";
import { ISocket } from "@shared/socket/domain/ISocket";

import { YGOProRoomMother } from "@test-support/mothers/room/YGOProRoomMother";

jest.mock("@ygopro/SimpleRoomMessageEmitter");

const makeSocket = (): ISocket =>
	({
		id: `s-${Math.random()}`,
		send: jest.fn(),
		close: jest.fn(),
		destroy: jest.fn(),
		onMessage: jest.fn(),
		removeAllListeners: jest.fn(),
		remoteAddress: "127.0.0.1",
		closed: false,
	}) as unknown as ISocket;

const playerInfo = (name: string): PlayerInfoMessage =>
	({ name, password: null }) as unknown as PlayerInfoMessage;

describe("YGOProRoom.admissionTarget", () => {
	it("exposes the room's league", () => {
		const room = YGOProRoomMother.create();
		const target = room.admissionTarget(makeSocket(), playerInfo("P"));
		expect(target.league).toBe(room.league);
	});

	it("freeSeat returns a Seat while the room has space", () => {
		const room = YGOProRoomMother.create();
		const target = room.admissionTarget(makeSocket(), playerInfo("P"));
		expect(target.freeSeat()).toBeInstanceOf(Seat);
	});

	it("seatPlayer adds a player carrying the credential's userId", async () => {
		const room = YGOProRoomMother.create();
		const target = room.admissionTarget(makeSocket(), playerInfo("P"));

		await target.seatPlayer({ kind: "verified", userId: "u-1" }, new Seat(0, 0));

		expect(room.players).toHaveLength(1);
		expect(room.players[0].id).toBe("u-1");
	});

	it("seatPlayer uses a null id for a guest", async () => {
		const room = YGOProRoomMother.create();
		const target = room.admissionTarget(makeSocket(), playerInfo("P"));

		await target.seatPlayer({ kind: "guest", name: "P" }, new Seat(0, 0));

		expect(room.players[0].id).toBeNull();
	});

	it("admitSpectator adds a spectator", async () => {
		const room = YGOProRoomMother.create();
		const target = room.admissionTarget(makeSocket(), playerInfo("P"));

		await target.admitSpectator();

		expect(room.spectators).toHaveLength(1);
	});

	it("rejectAdmission sends an error and closes the socket", () => {
		const room = YGOProRoomMother.create();
		const socket = makeSocket();
		const target = room.admissionTarget(socket, playerInfo("P"));

		target.rejectAdmission("ranked-requires-account");

		expect(socket.send).toHaveBeenCalled();
		expect(socket.close).toHaveBeenCalled();
	});
});
