/**
 * PR-7 tests — socket.destroy() called after error sends.
 *
 * WARNING-3 / SUGGESTION-3 from verify-pr4:
 * Both WindBotJoinStrategy and AIJoinTokenStrategy call ctx.socket.send(errorBuf)
 * on error paths but do NOT call ctx.socket.destroy(). The original DefaultJoinStrategy
 * wrong-password path calls socket.destroy(). This test enforces the fix.
 *
 * Covered error paths:
 *   WindBotJoinStrategy:
 *     1. Tag-mode rejection → send + destroy
 *     2. requestBot failure → send + destroy
 *
 *   AIJoinTokenStrategy:
 *     3. Invalid token → send + destroy
 *     4. Room disappeared (findById returns undefined) → send + destroy
 */

import { EventEmitter } from "stream";

import { WindBotJoinStrategy } from "./WindBotJoinStrategy";
import { AIJoinTokenStrategy } from "./AIJoinTokenStrategy";
import { JoinContext } from "./JoinStrategy";
import { WindbotModule, WindbotModuleDeps } from "../../../windbot/application/WindbotModule";
import { WindbotTokenStore } from "../../../windbot/domain/WindbotTokenStore";
import { WindbotUnreachableError } from "../../../windbot/domain/WindbotErrors";
import YGOProRoomList from "../../infrastructure/YGOProRoomList";
import { YGOProRoom } from "../../domain/YGOProRoom";

// ---------- helpers ----------

const makeLogger = () => ({
	child: jest.fn().mockReturnThis(),
	info: jest.fn(),
	warn: jest.fn(),
	error: jest.fn(),
	debug: jest.fn(),
});

const makeSocket = () => ({
	id: "sock-test",
	destroy: jest.fn(),
	send: jest.fn(),
	closed: false,
});

const makeMessageRepository = () => ({
	errorMessage: jest.fn().mockReturnValue(Buffer.alloc(4)),
	joinGameMessage: jest.fn().mockReturnValue(Buffer.alloc(0)),
	typeChangeMessage: jest.fn().mockReturnValue(Buffer.alloc(0)),
	playerEnterMessage: jest.fn().mockReturnValue(Buffer.alloc(0)),
});

const makeRepo = () => ({
	findAll: jest.fn().mockReturnValue([{ name: "Anna", deck: "Anna.ydk" }]),
	findByName: jest.fn().mockReturnValue({ name: "Anna", deck: "Anna.ydk" }),
	pickRandom: jest.fn().mockReturnValue({ name: "Anna", deck: "Anna.ydk" }),
});

const makeProvider = () => ({
	requestJoin: jest.fn().mockResolvedValue(undefined),
});

const makeModule = (overrides: Partial<WindbotModuleDeps> = {}): WindbotModule =>
	WindbotModule.createForTests({
		enabled: true,
		repo: makeRepo(),
		tokenStore: WindbotTokenStore.createForTests(),
		provider: makeProvider() as never,
		...overrides,
	});

const makeJoinData = (pass: string): Buffer => {
	const data = Buffer.alloc(48, 0);
	data.writeUInt16LE(0x1362, 0);
	data.writeUInt16LE(0, 2);
	data.writeUInt32LE(0, 4);
	const passChars = pass.slice(0, 20);
	for (let i = 0; i < passChars.length; i++) {
		data.writeUInt16LE(passChars.charCodeAt(i), 8 + i * 2);
	}
	return data;
};

const makePrevMsg = (): Buffer => {
	const buf = Buffer.alloc(40, 0);
	Buffer.from("TestPlayer", "utf16le").copy(buf, 0);
	return buf;
};

const makeCtx = (rawPass: string, overrides: Partial<JoinContext> = {}): JoinContext => {
	const parts = rawPass.split("#");
	return {
		rawPass,
		command: parts[0],
		password: parts[1] ?? "",
		playerInfo: { name: "TestPlayer", password: "", previousMessage: makePrevMsg() },
		socket: makeSocket(),
		socketId: "sock-test",
		eventEmitter: new EventEmitter(),
		messageRepository: makeMessageRepository(),
		logger: makeLogger(),
		checkIfUserCanJoin: { check: jest.fn().mockResolvedValue(true) },
		message: { data: makeJoinData(rawPass), previousMessage: makePrevMsg() },
		...overrides,
	} as unknown as JoinContext;
};

// ---------- tests ----------

describe("socket.destroy() after error send — PR-7 (WARNING-3 fix)", () => {
	let waitingSpy: jest.SpyInstance;
	let emitSpy: jest.SpyInstance;

	beforeEach(() => {
		waitingSpy = jest.spyOn(YGOProRoom.prototype, "waiting").mockImplementation(() => undefined);
		emitSpy = jest.spyOn(YGOProRoom.prototype, "emit").mockImplementation(() => undefined);
	});

	afterEach(() => {
		waitingSpy.mockRestore();
		emitSpy.mockRestore();
		const rooms = YGOProRoomList.getRooms();
		while (rooms.length) {
			YGOProRoomList.deleteRoom(rooms[0]);
		}
		jest.restoreAllMocks();
	});

	describe("WindBotJoinStrategy — error paths", () => {
		it("calls socket.destroy() after send() on tag-mode rejection", async () => {
			const fakeRoom = {
				isTag: true,
				id: 42,
				noHost: false,
				noReconnect: false,
				windbot: undefined,
				waiting: jest.fn(),
				emit: jest.fn(),
			};
			jest.spyOn(YGOProRoom, "create").mockReturnValueOnce(fakeRoom as never);

			const mod = makeModule();
			const strategy = new WindBotJoinStrategy(mod);

			const socket = makeSocket();
			const ctx = makeCtx("AI", { socket: socket as never });

			await strategy.handle(ctx);

			expect(socket.send).toHaveBeenCalled();
			expect(socket.destroy).toHaveBeenCalled();
		});

		it("calls socket.destroy() after send() on requestBot failure", async () => {
			const provider = {
				requestJoin: jest.fn().mockRejectedValue(new WindbotUnreachableError("Anna", 10)),
			};
			const mod = makeModule({ provider: provider as never });
			const strategy = new WindBotJoinStrategy(mod);

			const socket = makeSocket();
			const ctx = makeCtx("AI", {
				socket: socket as never,
				messageRepository: makeMessageRepository() as never,
			});

			await strategy.handle(ctx);
			// Wait for fire-and-forget rejection handler
			await new Promise((r) => setImmediate(r));

			expect(socket.send).toHaveBeenCalled();
			expect(socket.destroy).toHaveBeenCalled();
		});

		it("destroy() is called AFTER send() on tag-mode rejection (order matters)", async () => {
			const fakeRoom = {
				isTag: true,
				id: 42,
				noHost: false,
				noReconnect: false,
				windbot: undefined,
				waiting: jest.fn(),
				emit: jest.fn(),
			};
			jest.spyOn(YGOProRoom, "create").mockReturnValueOnce(fakeRoom as never);

			const mod = makeModule();
			const strategy = new WindBotJoinStrategy(mod);

			const callOrder: string[] = [];
			const socket = {
				...makeSocket(),
				send: jest.fn().mockImplementation(() => { callOrder.push("send"); }),
				destroy: jest.fn().mockImplementation(() => { callOrder.push("destroy"); }),
			};
			const ctx = makeCtx("AI", { socket: socket as never });

			await strategy.handle(ctx);

			expect(callOrder).toEqual(["send", "destroy"]);
		});
	});

	describe("AIJoinTokenStrategy — error paths", () => {
		it("calls socket.destroy() after send() on invalid token", async () => {
			const mod = makeModule();
			const strategy = new AIJoinTokenStrategy(mod);

			const socket = makeSocket();
			const ctx = makeCtx("AIJOIN#nosuchtoken", { socket: socket as never });

			await strategy.handle(ctx);

			expect(socket.send).toHaveBeenCalled();
			expect(socket.destroy).toHaveBeenCalled();
		});

		it("calls socket.destroy() after send() when room not found", async () => {
			const tokenStore = WindbotTokenStore.createForTests();
			const token = tokenStore.register(99999, "Anna", "Anna.ydk");

			const mod = makeModule({ tokenStore });
			const strategy = new AIJoinTokenStrategy(mod);

			const socket = makeSocket();
			const ctx = makeCtx(`AIJOIN#${token}`, { socket: socket as never });

			// Room 99999 is NOT in YGOProRoomList — findById returns undefined
			await strategy.handle(ctx);

			expect(socket.send).toHaveBeenCalled();
			expect(socket.destroy).toHaveBeenCalled();
		});

		it("destroy() is called AFTER send() on invalid token (order)", async () => {
			const mod = makeModule();
			const strategy = new AIJoinTokenStrategy(mod);

			const callOrder: string[] = [];
			const socket = {
				...makeSocket(),
				send: jest.fn().mockImplementation(() => { callOrder.push("send"); }),
				destroy: jest.fn().mockImplementation(() => { callOrder.push("destroy"); }),
			};
			const ctx = makeCtx("AIJOIN#nosuchtoken", { socket: socket as never });

			await strategy.handle(ctx);

			expect(callOrder).toEqual(["send", "destroy"]);
		});

		it("does NOT call socket.destroy() on the HAPPY path (valid token, room found)", async () => {
			const tokenStore = WindbotTokenStore.createForTests();

			// Create a real room in the list
			const emitter = new EventEmitter();
			const msgRepo = makeMessageRepository();
			const room = YGOProRoom.create(
				1234,
				"AIROOM",
				makeLogger() as never,
				emitter,
				{ name: "Human", password: "", previousMessage: Buffer.alloc(0) } as never,
				"sock-human",
				msgRepo as never,
			);
			YGOProRoomList.addRoom(room);

			const token = tokenStore.register(room.id, "Anna", "Anna.ydk");

			jest.spyOn(room, "emit").mockImplementation(() => undefined);

			const mod = makeModule({ tokenStore });
			const strategy = new AIJoinTokenStrategy(mod);

			const socket = makeSocket();
			const ctx = makeCtx(`AIJOIN#${token}`, {
				socket: socket as never,
				eventEmitter: emitter,
				messageRepository: msgRepo as never,
			});

			await strategy.handle(ctx);

			// Happy path: no error sent, no destroy
			expect(socket.send).not.toHaveBeenCalled();
			expect(socket.destroy).not.toHaveBeenCalled();
		});
	});
});
