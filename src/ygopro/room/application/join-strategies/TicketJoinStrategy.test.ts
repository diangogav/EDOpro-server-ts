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
	close: jest.fn(),
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
	}) as unknown as JoinContext;

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
				.spyOn((await import("../../domain/YGOProRoom")).YGOProRoom.prototype, "waiting")
				.mockImplementation(() => undefined);
			const emitSpy = jest
				.spyOn((await import("../../domain/YGOProRoom")).YGOProRoom.prototype, "emit")
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
				.spyOn((await import("../../domain/YGOProRoom")).YGOProRoom.prototype, "waiting")
				.mockImplementation(() => undefined);
			const emitSpy = jest
				.spyOn((await import("../../domain/YGOProRoom")).YGOProRoom.prototype, "emit")
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
			const { MessageRepositoryMock } = await import("@test-support/mocks/MessageRepositoryMock");
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

		// Room identity for non-pairing joins is the exact (name, password)
		// pair (see findOrCreateRoom), so a mismatched password identifies a
		// DIFFERENT room rather than rejecting the join: no matching pair
		// creates a new ranked room (TicketJoinStrategy's rankedOverride=true)
		// and routes the joiner into it, leaving the original room untouched.
		it("creates a new ranked room and routes JOIN into it when the existing room's password does NOT match", async () => {
			const { YGOProRoom } = await import("../../domain/YGOProRoom");
			const { MessageRepositoryMock } = await import("@test-support/mocks/MessageRepositoryMock");
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
			const originalEmitSpy = jest.spyOn(existingRoom, "emit").mockImplementation(() => undefined);

			const waitingSpy = jest
				.spyOn(YGOProRoom.prototype, "waiting")
				.mockImplementation(() => undefined);
			const emitSpy = jest.spyOn(YGOProRoom.prototype, "emit").mockImplementation(() => undefined);

			const socket = makeSocket("ticket-user");
			const messageRepository = makeMessageRepository();
			const ctx = makeCtx({
				socket: socket as never,
				command: "TESTROOM",
				password: "wrong",
				rawPass: "TESTROOM#wrong",
				messageRepository: messageRepository as never,
			});

			await strategy.handle(ctx);

			expect(socket.close).not.toHaveBeenCalled();
			expect(messageRepository.errorMessage).not.toHaveBeenCalled();
			expect(originalEmitSpy).not.toHaveBeenCalled();

			const rooms = YGOProRoomList.getRooms();
			expect(rooms).toHaveLength(2);
			const newRoom = rooms.find((candidate) => candidate !== existingRoom);
			expect(newRoom?.name).toBe("TESTROOM");
			expect(newRoom?.password).toBe("wrong");
			expect(newRoom?.ranked).toBe(true);
			expect(emitSpy).toHaveBeenCalledWith("JOIN", expect.anything(), ctx.socket);
			expect(emitSpy.mock.instances[0]).toBe(newRoom);

			waitingSpy.mockRestore();
			emitSpy.mockRestore();
		});

		it("joins an existing room when a non-empty room password matches", async () => {
			const { YGOProRoom } = await import("../../domain/YGOProRoom");
			const { MessageRepositoryMock } = await import("@test-support/mocks/MessageRepositoryMock");
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

		// "TCG" is a recognized rule token with no password segment, so a second
		// ticket-authenticated sender must land in the FIRST sender's waiting
		// room instead of creating a separate one (see findOrCreateRoom.test.ts
		// for the full pairing-scenario matrix).
		it("routes a second ticket joiner with the same recognized command into the first's waiting room (pairing)", async () => {
			const { YGOProRoom } = await import("../../domain/YGOProRoom");
			const emitter = new EventEmitter();

			const waitingSpy = jest
				.spyOn(YGOProRoom.prototype, "waiting")
				.mockImplementation(() => undefined);
			const emitSpy = jest.spyOn(YGOProRoom.prototype, "emit").mockImplementation(() => undefined);

			const firstCtx = makeCtx({
				rawPass: "TCG",
				command: "TCG",
				password: "",
				socket: makeSocket("ticket-user-1") as never,
				eventEmitter: emitter,
			});
			await strategy.handle(firstCtx);

			const secondCtx = makeCtx({
				rawPass: "TCG",
				command: "TCG",
				password: "",
				socket: makeSocket("ticket-user-2") as never,
				eventEmitter: emitter,
			});
			await strategy.handle(secondCtx);

			waitingSpy.mockRestore();
			emitSpy.mockRestore();

			expect(YGOProRoomList.getRooms()).toHaveLength(1);
		});
	});
});
