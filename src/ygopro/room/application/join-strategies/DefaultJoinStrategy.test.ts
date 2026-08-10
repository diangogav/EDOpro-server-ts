import { EventEmitter } from "stream";

import { JoinContext } from "./JoinStrategy";
import { DefaultJoinStrategy } from "./DefaultJoinStrategy";
import { YGOProRoom } from "../../domain/YGOProRoom";
import YGOProRoomList from "../../infrastructure/YGOProRoomList";

// ---- helpers ----

const makeLogger = () => ({
	child: jest.fn().mockReturnThis(),
	info: jest.fn(),
	warn: jest.fn(),
	error: jest.fn(),
	debug: jest.fn(),
});

const makeSocket = () => ({
	id: "sock-1",
	destroy: jest.fn(),
	close: jest.fn(),
	send: jest.fn(),
});

const makeMessageRepository = () => ({
	errorMessage: jest.fn().mockReturnValue(Buffer.alloc(0)),
});

const makeCheckIfUserCanJoin = () => ({
	check: jest.fn().mockResolvedValue(true),
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
			name: "TestPlayer",
			password: "",
			previousMessage: Buffer.alloc(0),
		},
		socket: makeSocket(),
		socketId: "sock-1",
		eventEmitter: new EventEmitter(),
		messageRepository: makeMessageRepository(),
		logger: makeLogger(),
		checkIfUserCanJoin: makeCheckIfUserCanJoin(),
		message: makeClientMessage(),
		...overrides,
	}) as unknown as JoinContext;

// ---- tests ----

describe("DefaultJoinStrategy", () => {
	let strategy: DefaultJoinStrategy;

	beforeEach(() => {
		strategy = new DefaultJoinStrategy();
		const rooms = YGOProRoomList.getRooms();
		while (rooms.length) {
			YGOProRoomList.deleteRoom(rooms[0]);
		}
	});

	describe("matches()", () => {
		it("always returns true — terminal fallback", () => {
			expect(strategy.matches(makeCtx({ rawPass: "" }))).toBe(true);
			expect(strategy.matches(makeCtx({ rawPass: "AI" }))).toBe(true);
			expect(strategy.matches(makeCtx({ rawPass: "AI#Anna" }))).toBe(true);
			expect(strategy.matches(makeCtx({ rawPass: "normal-room" }))).toBe(true);
		});
	});

	describe("handle()", () => {
		// Room identity for non-pairing joins is the exact (name, password)
		// pair (see findOrCreateRoom), so a mismatched password identifies a
		// DIFFERENT room rather than rejecting the join: no matching pair
		// creates a new room and routes the joiner into it, leaving the
		// original room untouched.
		it("creates a new room and routes JOIN into it when the existing same-named room's password does not match", async () => {
			const emitter = new EventEmitter();
			const existingRoom = YGOProRoom.create(
				9999,
				"SECRETROOM#correctpass",
				makeLogger() as never,
				emitter,
				{ name: "TestPlayer", password: "", previousMessage: Buffer.alloc(0) } as never,
				"sock-original",
				makeMessageRepository() as never,
			);
			YGOProRoomList.addRoom(existingRoom);

			const waitingSpy = jest
				.spyOn(YGOProRoom.prototype, "waiting")
				.mockImplementation(() => undefined);
			const emitSpy = jest.spyOn(YGOProRoom.prototype, "emit").mockImplementation(() => undefined);

			const socket = makeSocket();
			const messageRepository = makeMessageRepository();
			const ctx = makeCtx({
				rawPass: "SECRETROOM#wrongpass",
				command: "SECRETROOM",
				password: "wrongpass",
				socket: socket as never,
				messageRepository: messageRepository as never,
			});

			await strategy.handle(ctx);

			expect(socket.close).not.toHaveBeenCalled();
			expect(messageRepository.errorMessage).not.toHaveBeenCalled();

			const rooms = YGOProRoomList.getRooms();
			expect(rooms).toHaveLength(2);
			const newRoom = rooms.find((candidate) => candidate !== existingRoom);
			expect(newRoom?.name).toBe("SECRETROOM");
			expect(newRoom?.password).toBe("wrongpass");
			expect(emitSpy).toHaveBeenCalledWith("JOIN", expect.anything(), ctx.socket);
			expect(emitSpy.mock.instances[0]).toBe(newRoom);

			waitingSpy.mockRestore();
			emitSpy.mockRestore();
		});

		it("routes JOIN to the same room mid-duel when the password matches (spectating is decided downstream by the room's own state)", async () => {
			const emitter = new EventEmitter();
			const room = YGOProRoom.create(
				6666,
				"DUELROOM#pass",
				makeLogger() as never,
				emitter,
				{ name: "TestPlayer", password: "", previousMessage: Buffer.alloc(0) } as never,
				"sock-original",
				makeMessageRepository() as never,
			);
			YGOProRoomList.addRoom(room);
			room.rps(); // lightweight non-waiting transition, no OCGCore needed

			const emitSpy = jest.spyOn(room, "emit").mockImplementation(() => undefined);

			const socket = makeSocket();
			const ctx = makeCtx({
				rawPass: "DUELROOM#pass",
				command: "DUELROOM",
				password: "pass",
				socket: socket as never,
				eventEmitter: emitter,
			});

			await strategy.handle(ctx);

			expect(emitSpy).toHaveBeenCalledWith("JOIN", expect.anything(), ctx.socket);
			expect(YGOProRoomList.getRooms()).toHaveLength(1);
		});

		it("calls room.emit(JOIN) when the existing room has the correct password", async () => {
			const emitter = new EventEmitter();
			const room = YGOProRoom.create(
				8888,
				"MYROOM#mypass",
				makeLogger() as never,
				emitter,
				{ name: "TestPlayer", password: "", previousMessage: Buffer.alloc(0) } as never,
				"sock-original",
				makeMessageRepository() as never,
			);
			YGOProRoomList.addRoom(room);

			const emitSpy = jest.spyOn(room, "emit").mockImplementation(() => undefined);

			const socket = makeSocket();
			const ctx = makeCtx({
				rawPass: "MYROOM#mypass",
				command: "MYROOM",
				password: "mypass",
				socket: socket as never,
				eventEmitter: emitter,
			});

			await strategy.handle(ctx);

			expect(emitSpy).toHaveBeenCalledWith("JOIN", expect.anything(), ctx.socket);
		});

		it("emits JOIN for a ranked room — admission is now decided downstream by AdmitToRoom", async () => {
			const emitter = new EventEmitter();
			const room = YGOProRoom.create(
				7777,
				"RANKEDROOM",
				makeLogger() as never,
				emitter,
				{ name: "TestPlayer", password: "", previousMessage: Buffer.alloc(0) } as never,
				"sock-original",
				makeMessageRepository() as never,
				true,
			);
			YGOProRoomList.addRoom(room);
			const emitSpy = jest.spyOn(room, "emit").mockImplementation(() => undefined);

			const socket = makeSocket();
			const ctx = makeCtx({
				rawPass: "RANKEDROOM",
				command: "RANKEDROOM",
				password: "",
				socket: socket as never,
				eventEmitter: emitter,
			});

			await strategy.handle(ctx);

			// The strategy no longer authenticates — it just routes the join.
			expect(emitSpy).toHaveBeenCalledWith("JOIN", expect.anything(), ctx.socket);
			expect(socket.close).not.toHaveBeenCalled();
		});

		it("creates a new room when none exists and adds it to the list", async () => {
			const emitter = new EventEmitter();
			const socket = makeSocket();

			const waitingSpy = jest
				.spyOn(YGOProRoom.prototype, "waiting")
				.mockImplementation(() => undefined);
			const emitSpy = jest.spyOn(YGOProRoom.prototype, "emit").mockImplementation(() => undefined);

			const ctx = makeCtx({
				rawPass: "NEWROOM",
				command: "NEWROOM",
				password: "",
				socket: socket as never,
				eventEmitter: emitter,
				messageRepository: makeMessageRepository() as never,
			});

			await strategy.handle(ctx);

			waitingSpy.mockRestore();
			emitSpy.mockRestore();

			expect(YGOProRoomList.findByName("NEWROOM")).not.toBeNull();
		});

		// "TCG" is a recognized rule token with no password segment, so the second
		// sender must land in the FIRST sender's waiting room instead of creating a
		// separate one (see findOrCreateRoom.test.ts for the full pairing-scenario
		// matrix; this is the thin end-to-end proof that DefaultJoinStrategy wires
		// into it).
		it("routes a second joiner with the same recognized command into the first's waiting room (pairing)", async () => {
			const emitter = new EventEmitter();

			const waitingSpy = jest
				.spyOn(YGOProRoom.prototype, "waiting")
				.mockImplementation(() => undefined);
			const emitSpy = jest.spyOn(YGOProRoom.prototype, "emit").mockImplementation(() => undefined);

			const firstCtx = makeCtx({
				rawPass: "TCG",
				command: "TCG",
				password: "",
				socket: makeSocket() as never,
				eventEmitter: emitter,
				messageRepository: makeMessageRepository() as never,
			});
			await strategy.handle(firstCtx);

			const secondCtx = makeCtx({
				rawPass: "TCG",
				command: "TCG",
				password: "",
				socket: makeSocket() as never,
				eventEmitter: emitter,
				messageRepository: makeMessageRepository() as never,
			});
			await strategy.handle(secondCtx);

			waitingSpy.mockRestore();
			emitSpy.mockRestore();

			expect(YGOProRoomList.getRooms()).toHaveLength(1);
		});
	});
});
