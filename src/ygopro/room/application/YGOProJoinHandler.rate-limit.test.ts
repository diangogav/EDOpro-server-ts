/**
 * Per-IP rate limiting of the ygopro JOIN path.
 *
 * The JOIN attempt itself is the guarded resource: a novel JOIN can allocate a
 * room id (finite 1000-9999 space), a watch JOIN probes which ids exist, and a
 * ranked mid-duel JOIN with a PIN costs a DB lookup + bcrypt compare. All three
 * are cross-room, so the limiter must gate every attempt per IP BEFORE any
 * strategy is resolved — never per room, and never exempting anything a client
 * can control.
 *
 * Degradation contract: when rate limiting is disabled, Redis is unavailable,
 * the socket has no ip, or the limiter store errors, joins MUST proceed
 * (fail open) — the limiter can refuse service to an attacker, never to
 * everyone.
 */

import { EventEmitter } from "stream";

import { Redis } from "@shared/db/redis/infrastructure/Redis";
import { ErrorMessageType } from "ygopro-msg-encode";

import { config } from "../../../config";
import { YGOProJoinHandler } from "./YGOProJoinHandler";
import { JoinStrategyRegistry } from "./join-strategies/JoinStrategyRegistry";

// ---- fakes ----

class FakeRedis {
	private counters = new Map<string, number>();
	expireCalls: Array<{ key: string; seconds: number }> = [];
	incrCalls = 0;

	async incr(key: string): Promise<number> {
		this.incrCalls++;
		const next = (this.counters.get(key) ?? 0) + 1;
		this.counters.set(key, next);

		return next;
	}

	async expire(key: string, seconds: number): Promise<unknown> {
		this.expireCalls.push({ key, seconds });

		return 1;
	}

	count(key: string): number {
		return this.counters.get(key) ?? 0;
	}
}

const makeLogger = () => ({
	child: jest.fn().mockReturnThis(),
	info: jest.fn(),
	warn: jest.fn(),
	error: jest.fn(),
	debug: jest.fn(),
});

// Takes the address wrapped in an object so an explicit `undefined` (the
// no-remote-address degradation) cannot be silently replaced by a default.
const makeSocket = (
	opts: { remoteAddress: string | undefined } = { remoteAddress: "203.0.113.7" },
) => ({
	id: "sock-rate-limit",
	remoteAddress: opts.remoteAddress,
	send: jest.fn(),
	close: jest.fn(),
	destroy: jest.fn(),
});

const joinErrorBuffer = Buffer.from("JOINERROR-frame");

const makeMessageRepository = () => ({
	errorMessage: jest.fn().mockReturnValue(joinErrorBuffer),
});

/**
 * Minimal CTOS JOIN_GAME payload (version u16 at 0, gameid u32 at 4, pass
 * utf16 at 8) plus a PlayerInfo previousMessage — same layout the strategy
 * chain integration tests use.
 */
const makeJoinMessage = (pass: string): { data: Buffer; previousMessage: Buffer } => {
	const prevMsg = Buffer.alloc(40, 0);
	Buffer.from("TestPlayer", "utf16le").copy(prevMsg, 0);

	const data = Buffer.alloc(48, 0);
	data.writeUInt16LE(0x1362, 0);
	data.writeUInt32LE(0, 4);
	const passChars = pass.slice(0, 20);
	for (let i = 0; i < passChars.length; i++) {
		data.writeUInt16LE(passChars.charCodeAt(i), 8 + i * 2);
	}

	return { data, previousMessage: prevMsg };
};

// ---- harness ----

const LIMIT = 3;
const WINDOW = 120;

describe("YGOProJoinHandler — per-IP join rate limiting", () => {
	let store: FakeRedis;
	let strategyHandle: jest.Mock;
	let registryResolve: jest.Mock;
	let enabledBefore: boolean;
	let limitBefore: number;
	let windowBefore: number;

	const makeHandler = (socket = makeSocket(), messageRepo = makeMessageRepository()) => {
		strategyHandle = jest.fn().mockResolvedValue(undefined);
		registryResolve = jest.fn().mockReturnValue({ handle: strategyHandle });
		const registry = { resolve: registryResolve } as unknown as JoinStrategyRegistry;
		const handler = new YGOProJoinHandler(
			new EventEmitter(),
			makeLogger() as never,
			socket as never,
			messageRepo as never,
			registry,
		);

		return { handler, socket, messageRepo };
	};

	beforeEach(() => {
		store = new FakeRedis();
		jest
			.spyOn(Redis, "getInstance")
			.mockReturnValue(store as unknown as ReturnType<typeof Redis.getInstance>);
		enabledBefore = config.rateLimit.enabled;
		limitBefore = config.rateLimit.join.limit;
		windowBefore = config.rateLimit.join.window;
		config.rateLimit.enabled = true;
		config.rateLimit.join.limit = LIMIT;
		config.rateLimit.join.window = WINDOW;
	});

	afterEach(() => {
		config.rateLimit.enabled = enabledBefore;
		config.rateLimit.join.limit = limitBefore;
		config.rateLimit.join.window = windowBefore;
		jest.restoreAllMocks();
	});

	it("lets joins under the limit reach the strategy chain untouched", async () => {
		const { handler, socket } = makeHandler();

		for (let i = 0; i < LIMIT; i++) {
			await handler.handleJoinGame(makeJoinMessage("NORMALROOM") as never);
		}

		expect(registryResolve).toHaveBeenCalledTimes(LIMIT);
		expect(strategyHandle).toHaveBeenCalledTimes(LIMIT);
		expect(socket.send).not.toHaveBeenCalled();
		expect(socket.close).not.toHaveBeenCalled();
	});

	it("over the limit: sends JOINERROR, closes the socket, and never resolves a strategy", async () => {
		const { handler, socket, messageRepo } = makeHandler();

		for (let i = 0; i < LIMIT; i++) {
			await handler.handleJoinGame(makeJoinMessage("NORMALROOM") as never);
		}
		await handler.handleJoinGame(makeJoinMessage("NORMALROOM") as never);

		// Only the allowed attempts resolved a strategy — the limited one never
		// reached resolution, so no room lookup, id allocation, or DB auth ran.
		expect(registryResolve).toHaveBeenCalledTimes(LIMIT);
		expect(strategyHandle).toHaveBeenCalledTimes(LIMIT);
		expect(messageRepo.errorMessage).toHaveBeenCalledWith(ErrorMessageType.JOINERROR, 0);
		expect(socket.send).toHaveBeenCalledWith(joinErrorBuffer);
		// close(), not destroy(): the JOINERROR frame must flush before teardown.
		expect(socket.close).toHaveBeenCalledTimes(1);
		expect(socket.destroy).not.toHaveBeenCalled();
	});

	it("counts every attempt in a per-IP bucket keyed rate-limit:ygopro-join:<ip>", async () => {
		const { handler } = makeHandler(makeSocket({ remoteAddress: "203.0.113.7" }));

		await handler.handleJoinGame(makeJoinMessage("w,1234") as never);
		await handler.handleJoinGame(makeJoinMessage("OTHERROOM") as never);

		expect(store.count("rate-limit:ygopro-join:203.0.113.7")).toBe(2);
	});

	it("sets the window expiry only on the first hit of the window", async () => {
		const { handler } = makeHandler(makeSocket({ remoteAddress: "203.0.113.7" }));

		await handler.handleJoinGame(makeJoinMessage("NORMALROOM") as never);
		await handler.handleJoinGame(makeJoinMessage("NORMALROOM") as never);

		expect(store.expireCalls).toEqual([
			{ key: "rate-limit:ygopro-join:203.0.113.7", seconds: WINDOW },
		]);
	});

	it("tracks each ip independently: one exhausted ip never blocks another", async () => {
		const exhausted = makeHandler(makeSocket({ remoteAddress: "198.51.100.1" }));
		for (let i = 0; i < LIMIT + 2; i++) {
			await exhausted.handler.handleJoinGame(makeJoinMessage("NORMALROOM") as never);
		}

		const other = makeHandler(makeSocket({ remoteAddress: "198.51.100.2" }));
		await other.handler.handleJoinGame(makeJoinMessage("NORMALROOM") as never);

		expect(registryResolve).toHaveBeenCalledTimes(1);
		expect(strategyHandle).toHaveBeenCalledTimes(1);
		expect(other.socket.close).not.toHaveBeenCalled();
	});

	it("fails open when rate limiting is disabled", async () => {
		config.rateLimit.enabled = false;
		const { handler, socket } = makeHandler();

		for (let i = 0; i < LIMIT + 3; i++) {
			await handler.handleJoinGame(makeJoinMessage("NORMALROOM") as never);
		}

		expect(registryResolve).toHaveBeenCalledTimes(LIMIT + 3);
		expect(store.incrCalls).toBe(0);
		expect(socket.close).not.toHaveBeenCalled();
	});

	it("fails open when Redis is unavailable", async () => {
		(Redis.getInstance as jest.Mock).mockReturnValue(undefined);
		const { handler, socket } = makeHandler();

		for (let i = 0; i < LIMIT + 3; i++) {
			await handler.handleJoinGame(makeJoinMessage("NORMALROOM") as never);
		}

		expect(registryResolve).toHaveBeenCalledTimes(LIMIT + 3);
		expect(socket.close).not.toHaveBeenCalled();
	});

	it("fails open when the socket has no remote address", async () => {
		const { handler, socket } = makeHandler(makeSocket({ remoteAddress: undefined }));

		for (let i = 0; i < LIMIT + 3; i++) {
			await handler.handleJoinGame(makeJoinMessage("NORMALROOM") as never);
		}

		expect(registryResolve).toHaveBeenCalledTimes(LIMIT + 3);
		expect(store.incrCalls).toBe(0);
		expect(socket.close).not.toHaveBeenCalled();
	});

	it("fails open when the limiter store errors", async () => {
		jest.spyOn(store, "incr").mockRejectedValue(new Error("redis down"));
		const { handler, socket } = makeHandler();

		await handler.handleJoinGame(makeJoinMessage("NORMALROOM") as never);

		expect(registryResolve).toHaveBeenCalledTimes(1);
		expect(socket.close).not.toHaveBeenCalled();
	});

	it("ships a generous default join budget so NAT'd players and flapping reconnects fit", () => {
		// 60 joins/min per IP: several players behind one NAT plus a mobile
		// client rejoining after half-open drops stay far under one join per
		// second sustained, while id-space sweeps (9000 ids) and PIN brute
		// force (10000 PINs) stretch from seconds to hours.
		expect(limitBefore).toBe(60);
		expect(windowBefore).toBe(60);
	});
});
