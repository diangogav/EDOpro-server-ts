import { PlayerInfoMessage } from "@edopro/messages/client-to-server/PlayerInfoMessage";
import { Seat } from "@shared/room/admission/domain/Seat";
import { ISocket } from "@shared/socket/domain/ISocket";

import { YGOProRoomMother } from "@test-support/mothers/room/YGOProRoomMother";

import { ChatColor, YGOProStocChat } from "ygopro-msg-encode";

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

const playerInfo = (name: string, password: string | null = null): PlayerInfoMessage =>
	({ name, password }) as unknown as PlayerInfoMessage;

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

	it("admitSpectator adds a spectator carrying its credential", async () => {
		const room = YGOProRoomMother.create();
		const target = room.admissionTarget(makeSocket(), playerInfo("P"));

		await target.admitSpectator({ kind: "external", userId: "u-9" });

		expect(room.spectators).toHaveLength(1);
		expect(room.spectators[0].credential).toEqual({ kind: "external", userId: "u-9" });
	});

	it("seatPlayer stores the credential on the player", async () => {
		const room = YGOProRoomMother.create();
		const target = room.admissionTarget(makeSocket(), playerInfo("P"));

		await target.seatPlayer({ kind: "verified", userId: "u-1" }, new Seat(0, 0));

		expect(room.players[0].credential).toEqual({ kind: "verified", userId: "u-1" });
	});

	it("rejectAdmission sends an error and closes the socket", () => {
		const room = YGOProRoomMother.create();
		const socket = makeSocket();
		const target = room.admissionTarget(socket, playerInfo("P"));

		target.rejectAdmission("ranked-requires-account");

		expect(socket.send).toHaveBeenCalled();
		expect(socket.close).toHaveBeenCalled();
	});

	it("rejectAdmission explains invalid credentials when the client supplied a PIN", () => {
		const room = YGOProRoomMother.create();
		const socket = makeSocket();
		// password present → the client tried to authenticate with a PIN that did
		// not resolve to a valid account, so it was turned away as a guest.
		const target = room.admissionTarget(socket, playerInfo("P", "1313"));

		target.rejectAdmission("ranked-requires-account");

		const expectedChat = Buffer.from(
			new YGOProStocChat()
				.fromPartial({ player_type: ChatColor.RED, msg: "Invalid username or password." })
				.toFullPayload(),
		);
		expect(socket.send).toHaveBeenNthCalledWith(1, expectedChat);
		expect(socket.close).toHaveBeenCalled();
	});

	it("rejectAdmission does NOT send a credentials message when no PIN was supplied", () => {
		const room = YGOProRoomMother.create();
		const socket = makeSocket();
		const target = room.admissionTarget(socket, playerInfo("P"));

		target.rejectAdmission("ranked-requires-account");

		// Only the generic JOINERROR — a genuine guest never sent credentials.
		expect(socket.send).toHaveBeenCalledTimes(1);
	});
});
