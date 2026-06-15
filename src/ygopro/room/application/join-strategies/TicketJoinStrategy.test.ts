import { EventEmitter } from "stream";

import { JoinContext } from "./JoinStrategy";
import { TicketJoinStrategy } from "./TicketJoinStrategy";
import { JoinStrategyRegistry } from "./JoinStrategyRegistry";
import YGOProRoomList from "../../infrastructure/YGOProRoomList";

// ---- helpers ----

const makeLogger = () => ({
	child: jest.fn().mockReturnThis(),
	info: jest.fn(),
	warn: jest.fn(),
	error: jest.fn(),
	debug: jest.fn(),
});

const makeSocket = (resolvedUserId?: string) => ({
	id: "sock-1",
	resolvedUserId,
	destroy: jest.fn(),
	send: jest.fn(),
});

const makeMessageRepository = () => ({
	errorMessage: jest.fn().mockReturnValue(Buffer.alloc(0)),
});

const makeClientMessage = (): { data: Buffer; previousMessage: Buffer } => ({
	data: Buffer.alloc(0),
	previousMessage: Buffer.alloc(0),
});

const makeCtx = (overrides: Partial<JoinContext> = {}): JoinContext =>
	({
		rawPass: "TESTROOM",
		command: "TESTROOM",
		password: "",
		playerInfo: {
			name: "TicketPlayer",
			password: null,
			previousMessage: Buffer.alloc(0),
		},
		socket: makeSocket("some-user-id"),
		socketId: "sock-1",
		eventEmitter: new EventEmitter(),
		messageRepository: makeMessageRepository(),
		logger: makeLogger(),
		message: makeClientMessage(),
		...overrides,
	} as unknown as JoinContext);

// ---- tests ----

describe("TicketJoinStrategy", () => {
	let strategy: TicketJoinStrategy;

	beforeEach(() => {
		strategy = new TicketJoinStrategy();
		// Clear room list between tests
		const rooms = YGOProRoomList.getRooms();
		while (rooms.length) {
			YGOProRoomList.deleteRoom(rooms[0]);
		}
	});

	afterEach(() => {
		JoinStrategyRegistry.reset();
	});

	describe("matches()", () => {
		it("returns true when socket has resolvedUserId set", () => {
			const ctx = makeCtx({ socket: makeSocket("user-abc") as never });
			expect(strategy.matches(ctx)).toBe(true);
		});

		it("returns false when socket has no resolvedUserId", () => {
			const ctx = makeCtx({ socket: makeSocket(undefined) as never });
			expect(strategy.matches(ctx)).toBe(false);
		});

		it("returns false when socket resolvedUserId is empty string", () => {
			const ctx = makeCtx({ socket: makeSocket("") as never });
			expect(strategy.matches(ctx)).toBe(false);
		});
	});

	describe("handle()", () => {
		it("creates a ranked room (ranked=true) for a socket with resolvedUserId", async () => {
			const emitter = new EventEmitter();
			const waitingSpy = jest
				.spyOn(
					(await import("../../domain/YGOProRoom")).YGOProRoom.prototype,
					"waiting",
				)
				.mockImplementation(() => undefined);
			const emitSpy = jest
				.spyOn(
					(await import("../../domain/YGOProRoom")).YGOProRoom.prototype,
					"emit",
				)
				.mockImplementation(() => undefined);

			const ctx = makeCtx({
				socket: makeSocket("ticket-user") as never,
				eventEmitter: emitter,
			});

			await strategy.handle(ctx);

			const room = YGOProRoomList.findByName("TESTROOM");
			expect(room).not.toBeNull();
			expect(room?.ranked).toBe(true);

			waitingSpy.mockRestore();
			emitSpy.mockRestore();
		});

		it("emits JOIN on the room", async () => {
			const emitter = new EventEmitter();
			const waitingSpy = jest
				.spyOn(
					(await import("../../domain/YGOProRoom")).YGOProRoom.prototype,
					"waiting",
				)
				.mockImplementation(() => undefined);
			const emitSpy = jest
				.spyOn(
					(await import("../../domain/YGOProRoom")).YGOProRoom.prototype,
					"emit",
				)
				.mockImplementation(() => undefined);

			const ctx = makeCtx({
				socket: makeSocket("ticket-user") as never,
				eventEmitter: emitter,
			});

			await strategy.handle(ctx);

			expect(emitSpy).toHaveBeenCalledWith("JOIN", expect.anything(), ctx.socket);

			waitingSpy.mockRestore();
			emitSpy.mockRestore();
		});

		it("joins an existing room when the room password matches (both empty)", async () => {
			// Pre-create a ranked room
			const emitter = new EventEmitter();
			const { YGOProRoom } = await import("../../domain/YGOProRoom");
			const { MessageRepositoryMock } = await import(
				"@test-support/mocks/MessageRepositoryMock"
			);
			const { LoggerMock } = await import("@test-support/mocks/logger/LoggerMock");
			const { PlayerInfoMessageMother } = await import(
				"@test-support/mothers/PlayerInfoMessageMother"
			);

			const existingRoom = YGOProRoom.create(
				7777,
				"TESTROOM",
				new LoggerMock(),
				new EventEmitter(),
				PlayerInfoMessageMother.create(),
				"sock-orig",
				new MessageRepositoryMock(),
				true,
			);
			YGOProRoomList.addRoom(existingRoom);
			const emitSpy = jest.spyOn(existingRoom, "emit").mockImplementation(() => undefined);

			const ctx = makeCtx({
				socket: makeSocket("ticket-user") as never,
				eventEmitter: emitter,
			});

			await strategy.handle(ctx);

			expect(emitSpy).toHaveBeenCalledWith("JOIN", expect.anything(), ctx.socket);
		});

		it("rejects the join when the existing room password does NOT match", async () => {
			const { YGOProRoom } = await import("../../domain/YGOProRoom");
			const { MessageRepositoryMock } = await import(
				"@test-support/mocks/MessageRepositoryMock"
			);
			const { LoggerMock } = await import("@test-support/mocks/logger/LoggerMock");
			const { PlayerInfoMessageMother } = await import(
				"@test-support/mothers/PlayerInfoMessageMother"
			);

			const existingRoom = YGOProRoom.create(
				7777,
				"TESTROOM#secret",
				new LoggerMock(),
				new EventEmitter(),
				PlayerInfoMessageMother.create(),
				"sock-orig",
				new MessageRepositoryMock(),
				true,
			);
			YGOProRoomList.addRoom(existingRoom);
			const emitSpy = jest.spyOn(existingRoom, "emit").mockImplementation(() => undefined);

			const socket = makeSocket("ticket-user");
			const ctx = makeCtx({
				socket: socket as never,
				command: "TESTROOM",
				password: "",
				rawPass: "TESTROOM",
			});

			await strategy.handle(ctx);

			expect(socket.destroy).toHaveBeenCalled();
			expect(emitSpy).not.toHaveBeenCalled();
		});

		it("joins an existing room when a non-empty room password matches", async () => {
			const { YGOProRoom } = await import("../../domain/YGOProRoom");
			const { MessageRepositoryMock } = await import(
				"@test-support/mocks/MessageRepositoryMock"
			);
			const { LoggerMock } = await import("@test-support/mocks/logger/LoggerMock");
			const { PlayerInfoMessageMother } = await import(
				"@test-support/mothers/PlayerInfoMessageMother"
			);

			const existingRoom = YGOProRoom.create(
				7778,
				"TESTROOM#secret",
				new LoggerMock(),
				new EventEmitter(),
				PlayerInfoMessageMother.create(),
				"sock-orig",
				new MessageRepositoryMock(),
				true,
			);
			YGOProRoomList.addRoom(existingRoom);
			const emitSpy = jest.spyOn(existingRoom, "emit").mockImplementation(() => undefined);

			const ctx = makeCtx({
				socket: makeSocket("ticket-user") as never,
				command: "TESTROOM",
				password: "secret",
				rawPass: "TESTROOM#secret",
			});

			await strategy.handle(ctx);

			expect(emitSpy).toHaveBeenCalledWith("JOIN", expect.anything(), ctx.socket);
		});
	});
});
