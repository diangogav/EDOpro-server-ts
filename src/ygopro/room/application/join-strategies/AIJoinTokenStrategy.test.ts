import { EventEmitter } from "stream";

import { JoinContext } from "./JoinStrategy";
import { AIJoinTokenStrategy } from "./AIJoinTokenStrategy";
import { WindbotModule, WindbotModuleDeps } from "../../../windbot/application/WindbotModule";
import { WindbotTokenStore } from "../../../windbot/domain/WindbotTokenStore";
import { YGOProClient } from "../../../client/domain/YGOProClient";
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
	id: "sock-bot",
	close: jest.fn(),
	destroy: jest.fn(),
	send: jest.fn(),
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

const makeModule = (
	tokenStore: WindbotTokenStore,
	overrides: Partial<WindbotModuleDeps> = {},
): WindbotModule =>
	WindbotModule.createForTests({
		enabled: true,
		repo: makeRepo(),
		tokenStore,
		provider: makeProvider() as never,
		...overrides,
	});

const makeCtx = (rawPass: string, overrides: Partial<JoinContext> = {}): JoinContext => {
	const parts = rawPass.split("#");
	return {
		rawPass,
		command: parts[0],
		password: parts.slice(1).join("#"),
		playerInfo: {
			name: "WindBot",
			password: "",
			previousMessage: Buffer.alloc(0),
		},
		socket: makeSocket(),
		socketId: "sock-bot",
		eventEmitter: new EventEmitter(),
		messageRepository: makeMessageRepository(),
		logger: makeLogger(),
		checkIfUserCanJoin: { check: jest.fn().mockResolvedValue(true) },
		message: { data: Buffer.alloc(0), previousMessage: Buffer.alloc(0) },
		...overrides,
	} as unknown as JoinContext;
};

// helper to create a real room in the list
const createRoomInList = (id = 1234): { room: YGOProRoom; emitter: EventEmitter } => {
	const emitter = new EventEmitter();
	const messageRepo = makeMessageRepository();
	const room = YGOProRoom.create(
		id,
		"AIROOM",
		makeLogger() as never,
		emitter,
		{ name: "Human", password: "", previousMessage: Buffer.alloc(0) } as never,
		"sock-human",
		messageRepo as never,
	);
	YGOProRoomList.addRoom(room);
	return { room, emitter };
};

// ---- tests ----

describe("AIJoinTokenStrategy", () => {
	let tokenStore: WindbotTokenStore;

	beforeEach(() => {
		tokenStore = WindbotTokenStore.createForTests();
		const rooms = YGOProRoomList.getRooms();
		while (rooms.length) {
			YGOProRoomList.deleteRoom(rooms[0]);
		}
	});

	describe("matches()", () => {
		it("returns true for AIJOIN# prefix when enabled", () => {
			const mod = makeModule(tokenStore);
			const strategy = new AIJoinTokenStrategy(mod);

			expect(strategy.matches(makeCtx("AIJOIN#abc123"))).toBe(true);
		});

		it("returns false when module is not enabled", () => {
			const mod = WindbotModule.createForTests({
				enabled: false,
				repo: makeRepo(),
				tokenStore,
				provider: makeProvider() as never,
			});
			const strategy = new AIJoinTokenStrategy(mod);

			expect(strategy.matches(makeCtx("AIJOIN#abc123"))).toBe(false);
		});

		it("returns false for non-AIJOIN# passwords", () => {
			const mod = makeModule(tokenStore);
			const strategy = new AIJoinTokenStrategy(mod);

			expect(strategy.matches(makeCtx("AI"))).toBe(false);
			expect(strategy.matches(makeCtx("AI#Anna"))).toBe(false);
			expect(strategy.matches(makeCtx("NORMALROOM"))).toBe(false);
			expect(strategy.matches(makeCtx(""))).toBe(false);
		});
	});

	describe("handle()", () => {
		describe("invalid / missing token", () => {
			it("sends an error to the socket when token is unknown", async () => {
				const mod = makeModule(tokenStore);
				const strategy = new AIJoinTokenStrategy(mod);
				const socket = makeSocket();

				const ctx = makeCtx("AIJOIN#invalidtoken", { socket: socket as never });

				await strategy.handle(ctx);

				expect(socket.send).toHaveBeenCalled();
			});

			it("does NOT create a room when token is invalid", async () => {
				const mod = makeModule(tokenStore);
				const strategy = new AIJoinTokenStrategy(mod);

				const ctx = makeCtx("AIJOIN#invalidtoken");

				await strategy.handle(ctx);

				expect(YGOProRoomList.getRooms().length).toBe(0);
			});

			it("does NOT fall through — rejects cleanly", async () => {
				const mod = makeModule(tokenStore);
				const strategy = new AIJoinTokenStrategy(mod);
				const socket = makeSocket();

				const ctx = makeCtx("AIJOIN#nonexistent", { socket: socket as never });

				// handle returns void — the strategy handles the rejection internally
				await expect(strategy.handle(ctx)).resolves.toBeUndefined();
				expect(socket.send).toHaveBeenCalled();
			});
		});

		describe("valid token", () => {
			it("consumes the token from the store", async () => {
				const { room, emitter } = createRoomInList();
				const token = tokenStore.register(room.id, "Anna", "Anna.ydk");

				// Prevent actual WaitingState JOIN processing
				jest.spyOn(room, "emit").mockImplementation(() => undefined);

				const mod = makeModule(tokenStore);
				const strategy = new AIJoinTokenStrategy(mod);

				const ctx = makeCtx(`AIJOIN#${token}`, {
					eventEmitter: emitter,
					messageRepository: makeMessageRepository() as never,
				});

				await strategy.handle(ctx);

				// Token must be consumed — second consume should throw
				expect(() => tokenStore.consume(token)).toThrow("Windbot token not found");
			});

			it("emits JOIN for the bot client on the target room", async () => {
				const { room, emitter } = createRoomInList();
				const token = tokenStore.register(room.id, "Anna", "Anna.ydk");

				// Spy on room.emit to verify JOIN is called
				const roomEmitSpy = jest.spyOn(room, "emit").mockImplementation(() => undefined);

				const mod = makeModule(tokenStore);
				const strategy = new AIJoinTokenStrategy(mod);

				const ctx = makeCtx(`AIJOIN#${token}`, {
					eventEmitter: emitter,
					messageRepository: makeMessageRepository() as never,
				});

				await strategy.handle(ctx);

				expect(roomEmitSpy).toHaveBeenCalledWith("JOIN", expect.anything(), ctx.socket);
			});

			it("finds the room by roomId from the token payload", async () => {
				const { room, emitter } = createRoomInList();
				const token = tokenStore.register(room.id, "Anna", "Anna.ydk");

				jest.spyOn(room, "emit").mockImplementation(() => undefined);

				const findByIdSpy = jest.spyOn(YGOProRoomList, "findById");

				const mod = makeModule(tokenStore);
				const strategy = new AIJoinTokenStrategy(mod);

				const ctx = makeCtx(`AIJOIN#${token}`, {
					eventEmitter: emitter,
					messageRepository: makeMessageRepository() as never,
				});

				await strategy.handle(ctx);

				expect(findByIdSpy).toHaveBeenCalledWith(room.id);
				findByIdSpy.mockRestore();
			});

			it("marks the joining client (matched by socket) as internal after the join completes", async () => {
				const { room, emitter } = createRoomInList();
				const token = tokenStore.register(room.id, "Anna", "Anna.ydk");

				const ctx = makeCtx(`AIJOIN#${token}`, {
					eventEmitter: emitter,
					messageRepository: makeMessageRepository() as never,
				});

				// Simulate WaitingState adding the bot client. The strategy now locates the
				// client by socket identity (not "last added"), so the fake must carry ctx.socket.
				const fakeClient = {
					markInternal: jest.fn(),
					isInternal: false,
					socket: ctx.socket,
				} as unknown as YGOProClient;
				jest.spyOn(room, "emit").mockImplementation(() => {
					(room as unknown as { _players: YGOProClient[] })._players.push(fakeClient);
				});

				const mod = makeModule(tokenStore);
				const strategy = new AIJoinTokenStrategy(mod);

				await strategy.handle(ctx);

				// markInternal must have been called on the client whose socket matches the join
				expect(fakeClient.markInternal).toHaveBeenCalled();
			});

			it("does NOT mark an unrelated client when no socket matches", async () => {
				const { room, emitter } = createRoomInList();
				const token = tokenStore.register(room.id, "Anna", "Anna.ydk");

				const ctx = makeCtx(`AIJOIN#${token}`, {
					eventEmitter: emitter,
					messageRepository: makeMessageRepository() as never,
				});

				// A pre-existing client with a DIFFERENT socket must not be marked.
				const otherClient = {
					markInternal: jest.fn(),
					isInternal: false,
					socket: { id: "sock-human" },
				} as unknown as YGOProClient;
				(room as unknown as { _players: YGOProClient[] })._players.push(otherClient);
				jest.spyOn(room, "emit").mockImplementation(() => undefined);

				const mod = makeModule(tokenStore);
				const strategy = new AIJoinTokenStrategy(mod);

				await strategy.handle(ctx);

				expect(otherClient.markInternal).not.toHaveBeenCalled();
			});
		});
	});
});
