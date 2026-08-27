import { EventEmitter } from "stream";

import { ISocket } from "@shared/socket/domain/ISocket";

import { JoinContext } from "./JoinStrategy";
import { WatchJoinStrategy } from "./WatchJoinStrategy";
import { isRecognizedToken } from "../../domain/RuleMappings";
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

const makeMessageRepository = () => ({
	errorMessage: jest.fn().mockReturnValue(Buffer.from("join-error")),
});

const makeSocket = (): jest.Mocked<ISocket> =>
	({
		id: "sock-watch",
		send: jest.fn(),
		close: jest.fn(),
		destroy: jest.fn(),
		remoteAddress: "127.0.0.1",
		closed: false,
	}) as unknown as jest.Mocked<ISocket>;

const makeCtx = (rawPass: string, overrides: Partial<JoinContext> = {}): JoinContext => {
	const [command, password = ""] = rawPass.split("#");
	return {
		rawPass,
		command,
		password,
		playerInfo: { name: "Watcher", password: "", previousMessage: Buffer.alloc(0) },
		socket: makeSocket(),
		socketId: "sock-watch",
		eventEmitter: new EventEmitter(),
		messageRepository: makeMessageRepository(),
		logger: makeLogger(),
		message: { data: Buffer.alloc(48), previousMessage: Buffer.alloc(0) },
		...overrides,
	} as unknown as JoinContext;
};

const makeRoom = (id: number, rawPass: string): YGOProRoom => {
	const room = YGOProRoom.create(
		id,
		rawPass,
		makeLogger() as never,
		new EventEmitter(),
		{ name: "Host", password: "", previousMessage: Buffer.alloc(0) } as never,
		"sock-host",
		makeMessageRepository() as never,
	);
	YGOProRoomList.addRoom(room);
	return room;
};

const clearRooms = (): void => {
	const rooms = YGOProRoomList.getRooms();
	while (rooms.length) {
		YGOProRoomList.deleteRoom(rooms[0]);
	}
};

// ---- tests ----

describe("WatchJoinStrategy", () => {
	let strategy: WatchJoinStrategy;
	let emitSpy: jest.SpyInstance;

	beforeEach(() => {
		strategy = new WatchJoinStrategy();
		emitSpy = jest.spyOn(YGOProRoom.prototype, "emit").mockImplementation(() => undefined);
		clearRooms();
	});

	afterEach(() => {
		emitSpy.mockRestore();
		clearRooms();
	});

	describe("matches() — command shape", () => {
		const accepted = ["w,123", "W,123", " w , 123 ", "w,1", "w,999999"];
		it.each(accepted)("accepts %j", (rawPass) => {
			expect(strategy.matches(makeCtx(rawPass))).toBe(true);
		});

		it("accepts the shape regardless of the password segment", () => {
			expect(strategy.matches(makeCtx("w,123#secret"))).toBe(true);
		});

		const rejected = [
			"w",
			"w,",
			"w,12a",
			"w,12 3",
			"tcg,w",
			"w,123,extra",
			"ww,123",
			"tcg",
			"TESTROOM",
			"",
			",123",
		];
		it.each(rejected)("rejects %j (falls through to the other strategies)", (rawPass) => {
			expect(strategy.matches(makeCtx(rawPass))).toBe(false);
		});
	});

	describe("handle() — room resolution and password gate", () => {
		it("routes the joiner into the room found by id, marking the socket with watch intent scoped to that room", async () => {
			const room = makeRoom(1234, "tcg");
			const ctx = makeCtx("w,1234");

			await strategy.handle(ctx);

			expect(ctx.socket.watchForRoomId).toBe(1234);
			expect(emitSpy).toHaveBeenCalledWith("JOIN", ctx.message, ctx.socket);
			expect(emitSpy.mock.instances[0]).toBe(room);
		});

		it("routes into a mid-duel room the same way (spectating decided downstream by the state)", async () => {
			const room = makeRoom(1234, "tcg");
			room.rps();
			const ctx = makeCtx("w,1234");

			await strategy.handle(ctx);

			expect(ctx.socket.watchForRoomId).toBe(1234);
			expect(emitSpy).toHaveBeenCalledWith("JOIN", ctx.message, ctx.socket);
		});

		it("admits when the supplied password matches the room password exactly", async () => {
			makeRoom(1234, "tcg#secret");
			const ctx = makeCtx("w,1234#secret");

			await strategy.handle(ctx);

			expect(emitSpy).toHaveBeenCalled();
			expect(ctx.socket.close).not.toHaveBeenCalled();
		});

		it("rejects an unknown room id with chat + JOINERROR + close, and NEVER creates a room", async () => {
			const ctx = makeCtx("w,4321");

			await strategy.handle(ctx);

			expect(YGOProRoomList.getRooms()).toHaveLength(0);
			expect(emitSpy).not.toHaveBeenCalled();
			// Red chat first, then the JOINERROR frame, then a graceful close.
			expect(ctx.socket.send).toHaveBeenCalledTimes(2);
			expect(ctx.messageRepository.errorMessage).toHaveBeenCalled();
			expect(ctx.socket.close).toHaveBeenCalled();
			expect(ctx.socket.destroy).not.toHaveBeenCalled();
		});

		it("rejects a wrong password with chat + JOINERROR + close, leaving the room untouched", async () => {
			const room = makeRoom(1234, "tcg#secret");
			const ctx = makeCtx("w,1234#wrong");

			await strategy.handle(ctx);

			expect(emitSpy).not.toHaveBeenCalled();
			expect(ctx.socket.watchForRoomId).toBeUndefined();
			expect(ctx.socket.send).toHaveBeenCalledTimes(2);
			expect(ctx.socket.close).toHaveBeenCalled();
			expect(YGOProRoomList.getRooms()).toEqual([room]);
		});

		it("rejects a missing password for a passworded room", async () => {
			makeRoom(1234, "tcg#secret");
			const ctx = makeCtx("w,1234");

			await strategy.handle(ctx);

			expect(emitSpy).not.toHaveBeenCalled();
			expect(ctx.socket.close).toHaveBeenCalled();
		});
	});
});

// "w" is a join command, not a rule token: it must never become recognizable
// config (that would turn "w" into a pairing-join room name — see
// docs/join-commands.md).
describe("watch command token", () => {
	it("is not a recognized rule token", () => {
		expect(isRecognizedToken("w")).toBe(false);
	});
});
