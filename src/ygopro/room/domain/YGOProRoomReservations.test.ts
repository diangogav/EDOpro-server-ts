import { ISocket } from "@shared/socket/domain/ISocket";

import { YGOProRoomMother } from "@test-support/mothers/room/YGOProRoomMother";

import { ChatColor, ErrorMessageType, YGOProStocChat } from "ygopro-msg-encode";

jest.mock("@ygopro/SimpleRoomMessageEmitter");

const makeSocket = (overrides: Partial<ISocket> = {}): ISocket =>
	({
		id: `s-${Math.random()}`,
		send: jest.fn(),
		close: jest.fn(),
		destroy: jest.fn(),
		onMessage: jest.fn(),
		removeAllListeners: jest.fn(),
		remoteAddress: "127.0.0.1",
		closed: false,
		...overrides,
	}) as unknown as ISocket;

describe("YGOProRoom.reservationAdmits", () => {
	describe("rooms without reservations (ordinary rooms)", () => {
		it("admits an anonymous socket", () => {
			const room = YGOProRoomMother.create();
			expect(room.reservationAdmits(makeSocket())).toBe(true);
		});

		it("admits a ticket-authenticated socket", () => {
			const room = YGOProRoomMother.create();
			expect(room.reservationAdmits(makeSocket({ resolvedUserId: "u-any" }))).toBe(true);
		});
	});

	describe("rooms with reservations (matchmaking rooms)", () => {
		it("admits each reserved user", () => {
			const room = YGOProRoomMother.create();
			room.reservedUserIds = ["u-a", "u-b"];

			expect(room.reservationAdmits(makeSocket({ resolvedUserId: "u-a" }))).toBe(true);
			expect(room.reservationAdmits(makeSocket({ resolvedUserId: "u-b" }))).toBe(true);
		});

		it("rejects a ticket-authenticated stranger", () => {
			const room = YGOProRoomMother.create();
			room.reservedUserIds = ["u-a", "u-b"];

			expect(room.reservationAdmits(makeSocket({ resolvedUserId: "u-intruder" }))).toBe(false);
		});

		it("rejects an anonymous socket (no resolved identity)", () => {
			const room = YGOProRoomMother.create();
			room.reservedUserIds = ["u-a", "u-b"];

			expect(room.reservationAdmits(makeSocket())).toBe(false);
		});

		it("admits an internal (bot) socket whose one-shot join token named THIS room", () => {
			const room = YGOProRoomMother.create({ id: 77 });
			room.reservedUserIds = ["u-human"];

			expect(room.reservationAdmits(makeSocket({ internalForRoomId: 77 }))).toBe(true);
		});

		it("rejects an internal (bot) socket whose token named a DIFFERENT room", () => {
			const room = YGOProRoomMother.create({ id: 77 });
			room.reservedUserIds = ["u-human"];

			expect(room.reservationAdmits(makeSocket({ internalForRoomId: 78 }))).toBe(false);
		});
	});
});

describe("YGOProRoom.rejectReservedJoin", () => {
	it("sends a red chat explaining the reservation, then the JOINERROR frame", () => {
		const room = YGOProRoomMother.create();
		const socket = makeSocket();

		room.rejectReservedJoin(socket);

		const sends = (socket.send as jest.Mock).mock.calls.map(([buf]) => buf as Buffer);
		const expectedChat = Buffer.from(
			new YGOProStocChat()
				.fromPartial({
					player_type: ChatColor.RED,
					msg: "This room is reserved for its matched players.",
				})
				.toFullPayload(),
		);
		expect(sends.some((buf) => buf.equals(expectedChat))).toBe(true);
		expect(room.messageSender.errorMessage).toHaveBeenCalledWith(ErrorMessageType.JOINERROR, 0);
	});

	it("closes the socket gracefully so the error frames flush before teardown", () => {
		const room = YGOProRoomMother.create();
		const socket = makeSocket();

		room.rejectReservedJoin(socket);

		expect(socket.close).toHaveBeenCalled();
		expect(socket.destroy).not.toHaveBeenCalled();
	});
});

describe("YGOProRoom.reservationAdmits — one seat per reserved identity", () => {
	// Minimal seated-player entry: reservationAdmits only reads the seat's
	// stamped userId and its socket's liveness, the same signal the reconnect
	// paths use (socket.closed).
	const seatPlayer = (
		room: ReturnType<typeof YGOProRoomMother.create>,
		userId: string,
		closed = false,
	): void => {
		room.players.push({ id: userId, socket: { closed } } as never);
	};

	it("rejects a reserved user whose seat is still held by a live socket (second concurrent join)", () => {
		const room = YGOProRoomMother.create();
		room.reservedUserIds = ["u-a", "u-b"];
		seatPlayer(room, "u-a");

		expect(room.reservationAdmits(makeSocket({ resolvedUserId: "u-a" }))).toBe(false);
	});

	it("still admits the opponent while the first player holds their own seat", () => {
		const room = YGOProRoomMother.create();
		room.reservedUserIds = ["u-a", "u-b"];
		seatPlayer(room, "u-a");

		expect(room.reservationAdmits(makeSocket({ resolvedUserId: "u-b" }))).toBe(true);
	});

	it("admits the reserved user again once their seat's socket is closed (crash recovery)", () => {
		const room = YGOProRoomMother.create();
		room.reservedUserIds = ["u-a", "u-b"];
		seatPlayer(room, "u-a", true);

		expect(room.reservationAdmits(makeSocket({ resolvedUserId: "u-a" }))).toBe(true);
	});

	it("rejects the human's second concurrent join in a bot-fallback room (single reserved id)", () => {
		const room = YGOProRoomMother.create();
		room.reservedUserIds = ["u-human"];
		seatPlayer(room, "u-human");

		expect(room.reservationAdmits(makeSocket({ resolvedUserId: "u-human" }))).toBe(false);
	});

	it("ignores guest seats (null id) when checking the double-seat guard", () => {
		const room = YGOProRoomMother.create();
		room.reservedUserIds = ["u-a", "u-b"];
		room.players.push({ id: null, socket: { closed: false } } as never);

		expect(room.reservationAdmits(makeSocket({ resolvedUserId: "u-a" }))).toBe(true);
	});
});
