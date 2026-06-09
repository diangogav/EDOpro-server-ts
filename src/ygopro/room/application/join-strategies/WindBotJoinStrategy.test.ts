import { EventEmitter } from "stream";

import { JoinContext } from "./JoinStrategy";
import { WindBotJoinStrategy } from "./WindBotJoinStrategy";
import { WindbotModule, WindbotModuleDeps } from "../../../windbot/application/WindbotModule";
import { WindbotTokenStore } from "../../../windbot/domain/WindbotTokenStore";
import { WindbotUnreachableError } from "../../../windbot/domain/WindbotErrors";
import YGOProRoomList from "../../infrastructure/YGOProRoomList";
import { YGOProRoom } from "../../domain/YGOProRoom";

// ---- helpers ----

const makeLogger = () => ({
	child: jest.fn().mockReturnThis(),
	info: jest.fn(),
	warn: jest.fn(),
	error: jest.fn(),
	debug: jest.fn(),
});

const makeSocket = () => ({
	id: "sock-test",
	close: jest.fn(),
	destroy: jest.fn(),
	send: jest.fn(),
});

const makeMessageRepository = () => ({
	errorMessage: jest.fn().mockReturnValue(Buffer.alloc(4)),
	joinGameMessage: jest.fn().mockReturnValue(Buffer.alloc(0)),
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

/**
 * Build a valid join message buffer (48 bytes) as expected by YGOProJoinGameMessage.
 * version(u16) + align(u16) + gameid(u32) + pass(utf16, 40 bytes)
 */
const makeJoinData = (pass: string): Buffer => {
	const data = Buffer.alloc(48, 0);
	// Use the same version as mercuryConfig to pass validateVersion
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
	const prevMsg = Buffer.alloc(40, 0);
	Buffer.from("TestPlayer", "utf16le").copy(prevMsg, 0);
	return prevMsg;
};

const makeCtx = (rawPass: string, overrides: Partial<JoinContext> = {}): JoinContext => {
	const parts = rawPass.split("#");
	return {
		rawPass,
		command: parts[0],
		password: parts[1] ?? "",
		playerInfo: {
			name: "TestPlayer",
			password: "",
			previousMessage: makePrevMsg(),
		},
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

// ---- tests ----

describe("WindBotJoinStrategy", () => {
	let waitingSpy: jest.SpyInstance;
	let emitSpy: jest.SpyInstance;

	beforeEach(() => {
		// Prevent real WaitingState from being set up so handleJoin doesn't crash
		// Unit tests only care that the strategy calls the right methods, not that
		// the WaitingState processes JOIN events.
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
	});

	describe("matches()", () => {
		it("returns false when windbot module is not enabled", () => {
			const mod = WindbotModule.createForTests({
				enabled: false,
				repo: makeRepo(),
				tokenStore: WindbotTokenStore.createForTests(),
				provider: makeProvider() as never,
			});
			const strategy = new WindBotJoinStrategy(mod);

			expect(strategy.matches(makeCtx(""))).toBe(false);
			expect(strategy.matches(makeCtx("AI"))).toBe(false);
			expect(strategy.matches(makeCtx("AI#Anna"))).toBe(false);
		});

		it("returns true for blank password when enabled", () => {
			const strategy = new WindBotJoinStrategy(makeModule());
			expect(strategy.matches(makeCtx(""))).toBe(true);
		});

		it("returns true for 'AI' password when enabled", () => {
			const strategy = new WindBotJoinStrategy(makeModule());
			expect(strategy.matches(makeCtx("AI"))).toBe(true);
		});

		it("returns true for 'AI#Anna' password when enabled", () => {
			const strategy = new WindBotJoinStrategy(makeModule());
			expect(strategy.matches(makeCtx("AI#Anna"))).toBe(true);
		});

		it("returns false for non-AI passwords even when enabled", () => {
			const strategy = new WindBotJoinStrategy(makeModule());
			expect(strategy.matches(makeCtx("NORMALROOM"))).toBe(false);
			expect(strategy.matches(makeCtx("AIJOIN#sometoken"))).toBe(false);
		});

		// Multi-token AI command tests
		it("returns true for 'ai,jtp#Joey' (ai token present, not first)", () => {
			const strategy = new WindBotJoinStrategy(makeModule());
			expect(strategy.matches(makeCtx("ai,jtp#Joey"))).toBe(true);
		});

		it("returns true for 'nc,ns,ai#joey' (ai not first among tokens)", () => {
			const strategy = new WindBotJoinStrategy(makeModule());
			expect(strategy.matches(makeCtx("nc,ns,ai#joey"))).toBe(true);
		});

		it("returns true for 'jtp,ai' (ai token present, no bot name)", () => {
			const strategy = new WindBotJoinStrategy(makeModule());
			expect(strategy.matches(makeCtx("jtp,ai"))).toBe(true);
		});

		it("returns true for lowercase 'ai' (case-insensitive token match)", () => {
			const strategy = new WindBotJoinStrategy(makeModule());
			expect(strategy.matches(makeCtx("ai"))).toBe(true);
		});

		it("returns false for 'jtp#pass' (no ai token)", () => {
			const strategy = new WindBotJoinStrategy(makeModule());
			expect(strategy.matches(makeCtx("jtp#pass"))).toBe(false);
		});

		it("returns false for 'nc,ns#pass' (no ai token)", () => {
			const strategy = new WindBotJoinStrategy(makeModule());
			expect(strategy.matches(makeCtx("nc,ns#pass"))).toBe(false);
		});

		it("returns false for 'normalroom' (no ai token)", () => {
			const strategy = new WindBotJoinStrategy(makeModule());
			expect(strategy.matches(makeCtx("normalroom"))).toBe(false);
		});

		it("returns false for any password when module is disabled", () => {
			const mod = WindbotModule.createForTests({
				enabled: false,
				repo: makeRepo(),
				tokenStore: WindbotTokenStore.createForTests(),
				provider: makeProvider() as never,
			});
			const strategy = new WindBotJoinStrategy(mod);
			expect(strategy.matches(makeCtx("ai,jtp#Joey"))).toBe(false);
			expect(strategy.matches(makeCtx("nc,ns,ai"))).toBe(false);
			expect(strategy.matches(makeCtx("jtp,ai"))).toBe(false);
		});
	});

	describe("handle()", () => {
		describe("tag-mode rejection (REQ-JOIN-103 / REQ-ROOM-502)", () => {
			it("rejects tag-mode rooms before any room or token is created", async () => {
				// Force YGOProRoom.create to return a room whose isTag returns true
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

				// Error should be sent
				expect(socket.send).toHaveBeenCalled();
				// No room should be in the list (not added because of tag rejection)
				expect(YGOProRoomList.getRooms().length).toBe(0);
			});

			it("does not reject when mode is SINGLE (not tag)", async () => {
				const mod = makeModule();
				const strategy = new WindBotJoinStrategy(mod);

				const ctx = makeCtx("AI");

				await strategy.handle(ctx);

				// Room should have been created and added (isTag is false for "AI" password)
				expect(YGOProRoomList.getRooms().length).toBeGreaterThan(0);
			});
		});

		describe("happy path", () => {
			it("creates a room with noHost=true and noReconnect=true when AI password", async () => {
				const mod = makeModule();
				const strategy = new WindBotJoinStrategy(mod);

				const ctx = makeCtx("AI");

				await strategy.handle(ctx);

				const room = YGOProRoomList.getRooms()[0];
				expect(room).toBeDefined();
				expect(room.noHost).toBe(true);
				expect(room.noReconnect).toBe(true);
			});

			it("sets windbot data on the created room after requestBot resolves", async () => {
				const mod = makeModule();
				const strategy = new WindBotJoinStrategy(mod);

				const ctx = makeCtx("AI#Anna");

				await strategy.handle(ctx);

				// Wait for the fire-and-forget to resolve
				await new Promise((r) => setImmediate(r));

				const room = YGOProRoomList.getRooms()[0];
				expect(room.windbot).toBeDefined();
				expect(room.windbot?.name).toBe("Anna");
			});

			it("calls requestBot via the module", async () => {
				const tokenStore = WindbotTokenStore.createForTests();
				const provider = makeProvider();
				const mod = makeModule({ tokenStore, provider: provider as never });
				const strategy = new WindBotJoinStrategy(mod);

				const ctx = makeCtx("AI");

				await strategy.handle(ctx);
				await new Promise((r) => setImmediate(r));

				// Provider must have been called (token was registered + HTTP fired)
				expect(provider.requestJoin).toHaveBeenCalled();
			});

			it("parses bot name from AI#BotName", async () => {
				const repo = makeRepo();
				const mod = makeModule({ repo });
				const strategy = new WindBotJoinStrategy(mod);

				const ctx = makeCtx("AI#Gear");

				await strategy.handle(ctx);

				expect(repo.findByName).toHaveBeenCalledWith("Gear");
			});

			it("uses null (random bot) for plain 'AI' password", async () => {
				const repo = makeRepo();
				const mod = makeModule({ repo });
				const strategy = new WindBotJoinStrategy(mod);

				const ctx = makeCtx("AI");

				await strategy.handle(ctx);

				// pickRandom called because no name specified
				expect(repo.pickRandom).toHaveBeenCalled();
			});

			// Multi-token bot-name parsing tests
			it("parses bot name from 'ai,jtp#Joey' → findByName('Joey')", async () => {
				const repo = makeRepo();
				const mod = makeModule({ repo });
				const strategy = new WindBotJoinStrategy(mod);

				const ctx = makeCtx("ai,jtp#Joey");

				await strategy.handle(ctx);

				expect(repo.findByName).toHaveBeenCalledWith("Joey");
			});

			it("parses bot name from 'nc,ns,ai#joey' → findByName('joey')", async () => {
				const repo = makeRepo();
				const mod = makeModule({ repo });
				const strategy = new WindBotJoinStrategy(mod);

				const ctx = makeCtx("nc,ns,ai#joey");

				await strategy.handle(ctx);

				expect(repo.findByName).toHaveBeenCalledWith("joey");
			});

			it("uses pickRandom when 'ai' has no '#' segment (no bot name)", async () => {
				const repo = makeRepo();
				const mod = makeModule({ repo });
				const strategy = new WindBotJoinStrategy(mod);

				const ctx = makeCtx("ai");

				await strategy.handle(ctx);

				expect(repo.pickRandom).toHaveBeenCalled();
				expect(repo.findByName).not.toHaveBeenCalled();
			});

			it("uses pickRandom when 'nc,ai' has no '#' segment (no bot name)", async () => {
				const repo = makeRepo();
				const mod = makeModule({ repo });
				const strategy = new WindBotJoinStrategy(mod);

				const ctx = makeCtx("nc,ai");

				await strategy.handle(ctx);

				expect(repo.pickRandom).toHaveBeenCalled();
				expect(repo.findByName).not.toHaveBeenCalled();
			});
		});

		describe("requestBot failure path", () => {
			it("sends error to human and closes socket when requestBot throws", async () => {
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
				// Wait for the fire-and-forget rejection handler
				await new Promise((r) => setImmediate(r));

				expect(socket.send).toHaveBeenCalled();
			});

			it("removes the room from the list when requestBot fails", async () => {
				const provider = {
					requestJoin: jest.fn().mockRejectedValue(new WindbotUnreachableError("Anna", 10)),
				};
				const mod = makeModule({ provider: provider as never });
				const strategy = new WindBotJoinStrategy(mod);

				const ctx = makeCtx("AI");

				await strategy.handle(ctx);
				// Wait for the fire-and-forget rejection handler
				await new Promise((r) => setImmediate(r));

				// Room must be deleted
				expect(YGOProRoomList.getRooms().length).toBe(0);
			});
		});

		describe("isFinalizing callback (REQ-HTTP-402)", () => {
			it("isFinalizing callback returns false before room is finalized", async () => {
				// provider.requestJoin receives { token, bot, isFinalizing } — capture isFinalizing
				let capturedIsFinalizing: (() => boolean) | undefined;
				const provider = {
					requestJoin: jest.fn().mockImplementation(
						(params: { token: string; bot: { name: string; deck: string }; isFinalizing: () => boolean }) => {
							capturedIsFinalizing = params.isFinalizing;
							return Promise.resolve();
						},
					),
				};
				const mod = makeModule({ provider: provider as never });
				const strategy = new WindBotJoinStrategy(mod);

				const ctx = makeCtx("AI");
				await strategy.handle(ctx);
				await new Promise((r) => setImmediate(r));

				expect(capturedIsFinalizing).toBeDefined();
				// room.finalizing is false at this point
				expect(capturedIsFinalizing!()).toBe(false);
			});

			it("isFinalizing callback returns true when room.finalizing is set to true", async () => {
				// provider.requestJoin receives { token, bot, isFinalizing } — capture isFinalizing
				let capturedIsFinalizing: (() => boolean) | undefined;
				const provider = {
					requestJoin: jest.fn().mockImplementation(
						(params: { token: string; bot: { name: string; deck: string }; isFinalizing: () => boolean }) => {
							capturedIsFinalizing = params.isFinalizing;
							return Promise.resolve();
						},
					),
				};
				const mod = makeModule({ provider: provider as never });
				const strategy = new WindBotJoinStrategy(mod);

				const ctx = makeCtx("AI");
				await strategy.handle(ctx);
				await new Promise((r) => setImmediate(r));

				expect(capturedIsFinalizing).toBeDefined();

				// Simulate room teardown — flip finalizing on the created room.
				// The callback must reflect this change (it closes over room.finalizing).
				const room = YGOProRoomList.getRooms()[0];
				expect(room).toBeDefined();
				room.finalizing = true;

				expect(capturedIsFinalizing!()).toBe(true);
			});
		});
	});
});
