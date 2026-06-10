import { EventEmitter } from "stream";

import { ErrorMessageType } from "ygopro-msg-encode";

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
	} as unknown as JoinContext);

// ---- tests ----

describe("DefaultJoinStrategy", () => {
	let strategy: DefaultJoinStrategy;

	beforeEach(() => {
		strategy = new DefaultJoinStrategy();
		// Clear the room list between tests
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
		it("destroys the socket when the room exists but password is wrong", async () => {
			// Create a room directly
			const emitter = new EventEmitter();
			const logger = makeLogger();
			const messageRepo = makeMessageRepository();
			const room = YGOProRoom.create(
				9999,
				"SECRETROOM#correctpass",
				logger as never,
				emitter,
				{ name: "TestPlayer", password: "", previousMessage: Buffer.alloc(0) } as never,
				"sock-original",
				messageRepo as never,
			);
			YGOProRoomList.addRoom(room);

			const socket = makeSocket();
			const ctx = makeCtx({
				rawPass: "SECRETROOM#wrongpass",
				command: "SECRETROOM",
				password: "wrongpass",
				socket: socket as never,
			});

			await strategy.handle(ctx);

			expect(socket.destroy).toHaveBeenCalled();
		});

		it("calls room.emit(JOIN) when the existing room has the correct password", async () => {
			const emitter = new EventEmitter();
			const logger = makeLogger();
			const messageRepo = makeMessageRepository();
			const room = YGOProRoom.create(
				8888,
				"MYROOM#mypass",
				logger as never,
				emitter,
				{ name: "TestPlayer", password: "", previousMessage: Buffer.alloc(0) } as never,
				"sock-original",
				messageRepo as never,
			);
			YGOProRoomList.addRoom(room);

			// Spy on room.emit to verify JOIN is called without triggering WaitingState
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

		it("closes the socket and does NOT emit JOIN when the ranked room rejects the user", async () => {
			// Ranked room created via rankedOverride=true (8th arg)
			const emitter = new EventEmitter();
			const logger = makeLogger();
			const messageRepo = makeMessageRepository();
			const room = YGOProRoom.create(
				7777,
				"RANKEDROOM",
				logger as never,
				emitter,
				{ name: "TestPlayer", password: "", previousMessage: Buffer.alloc(0) } as never,
				"sock-original",
				messageRepo as never,
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
				// check() returns false → user cannot join the ranked room
				checkIfUserCanJoin: { check: jest.fn().mockResolvedValue(false) } as never,
			});

			await strategy.handle(ctx);

			expect(socket.close).toHaveBeenCalled();
			expect(emitSpy).not.toHaveBeenCalledWith("JOIN", expect.anything(), expect.anything());
		});

		it("sends the JOINERROR via messageRepository (ygopro 8-byte format) on ranked reject", async () => {
			const emitter = new EventEmitter();
			const room = YGOProRoom.create(
				7778,
				"RANKEDROOM2",
				makeLogger() as never,
				emitter,
				{ name: "TestPlayer", password: "", previousMessage: Buffer.alloc(0) } as never,
				"sock-original",
				makeMessageRepository() as never,
				true,
			);
			YGOProRoomList.addRoom(room);
			jest.spyOn(room, "emit").mockImplementation(() => undefined);

			const socket = makeSocket();
			const ctxMessageRepo = makeMessageRepository();
			const ctx = makeCtx({
				rawPass: "RANKEDROOM2",
				command: "RANKEDROOM2",
				password: "",
				socket: socket as never,
				eventEmitter: emitter,
				messageRepository: ctxMessageRepo as never,
				checkIfUserCanJoin: { check: jest.fn().mockResolvedValue(false) } as never,
			});

			await strategy.handle(ctx);

			// The reject must serialize the JOINERROR through the ygopro repository (same
			// path as DECKERROR → YGOProStocErrorMsg, 8-byte body with code at offset 4),
			// NOT the @edopro ErrorClientMessage (5-byte body) the web client cannot decode.
			expect(ctxMessageRepo.errorMessage).toHaveBeenCalledWith(ErrorMessageType.JOINERROR, 0);
			expect(socket.send).toHaveBeenCalled();
		});

		it("does NOT close the socket on the happy ranked path (check passes)", async () => {
			const emitter = new EventEmitter();
			const logger = makeLogger();
			const messageRepo = makeMessageRepository();
			const room = YGOProRoom.create(
				6666,
				"RANKEDOK",
				logger as never,
				emitter,
				{ name: "TestPlayer", password: "", previousMessage: Buffer.alloc(0) } as never,
				"sock-original",
				messageRepo as never,
				true,
			);
			YGOProRoomList.addRoom(room);

			jest.spyOn(room, "emit").mockImplementation(() => undefined);

			const socket = makeSocket();
			const ctx = makeCtx({
				rawPass: "RANKEDOK",
				command: "RANKEDOK",
				password: "",
				socket: socket as never,
				eventEmitter: emitter,
				checkIfUserCanJoin: { check: jest.fn().mockResolvedValue(true) } as never,
			});

			await strategy.handle(ctx);

			expect(socket.close).not.toHaveBeenCalled();
		});

		it("creates a new room when none exists and adds it to the list", async () => {
			const emitter = new EventEmitter();
			const messageRepo = makeMessageRepository();
			const socket = makeSocket();

			// Mock YGOProRoom.prototype.waiting to prevent WaitingState setup
			// (we don't want WaitingState listening for JOIN events in this unit test)
			const waitingSpy = jest.spyOn(YGOProRoom.prototype, "waiting").mockImplementation(() => undefined);
			// Also mock emit so JOIN doesn't try to invoke WaitingState
			const emitSpy = jest.spyOn(YGOProRoom.prototype, "emit").mockImplementation(() => undefined);

			const ctx = makeCtx({
				rawPass: "NEWROOM",
				command: "NEWROOM",
				password: "",
				socket: socket as never,
				eventEmitter: emitter,
				messageRepository: messageRepo as never,
			});

			await strategy.handle(ctx);

			waitingSpy.mockRestore();
			emitSpy.mockRestore();

			const found = YGOProRoomList.findByName("NEWROOM");
			expect(found).not.toBeNull();
		});
	});
});
