jest.mock("../../../../web-socket-server/WebSocketSingleton", () => ({
	__esModule: true,
	default: { getInstance: () => ({ broadcast: jest.fn() }) },
}));
jest.mock("@shared/dependency-injection", () => ({
	container: { get: () => ({ runClosed: jest.fn() }) },
}));

import { EventEmitter } from "stream";

import { ReservedDuelServices } from "@shared/reserved-duel/application/ReservedDuels";
import { Reservation } from "@shared/reserved-duel/domain/Reservation";
import { ClaimResult, ReservationStore } from "@shared/reserved-duel/domain/ReservationStore";
import { ReservedDuelRepository } from "@shared/reserved-duel/domain/ReservedDuelRepository";
import { LoggerMock } from "@test-support/mocks/logger/LoggerMock";

import { WindbotModule } from "../../../windbot/application/WindbotModule";
import { YGOProRoom } from "../../domain/YGOProRoom";
import YGOProRoomList from "../../infrastructure/YGOProRoomList";
import { JoinContext } from "./JoinStrategy";
import { ReservedDuelJoinStrategy } from "./ReservedDuelJoinStrategy";

const ID = "Ab3dEf6hIj9kLm2n";

const makeReservation = (overrides: Partial<Reservation> = {}): Reservation => ({
	id: ID,
	format: "edison",
	mode: "single",
	participants: [
		{ seat: 0, kind: "user", userId: "user-1", requiredDeck: null },
		{ seat: 1, kind: "windbot", botName: "Haunted" },
	],
	options: {
		spectators: false,
		listed: false,
		reconnect: false,
		deckLock: "exact",
		lobbyTimeoutSeconds: 120,
	},
	...overrides,
});

const twoHumans = (reconnect = false): Reservation =>
	makeReservation({
		participants: [
			{ seat: 0, kind: "user", userId: "user-1", requiredDeck: null },
			{ seat: 1, kind: "user", userId: "user-2", requiredDeck: null },
		],
		options: { ...makeReservation().options, reconnect },
	});

const makeRepository = (): jest.Mocked<ReservedDuelRepository> => ({
	open: jest.fn().mockResolvedValue(undefined),
	claimSeat: jest.fn().mockResolvedValue(true),
	markStarted: jest.fn().mockResolvedValue(undefined),
	recordAbandon: jest.fn().mockResolvedValue(true),
	recordResult: jest.fn().mockResolvedValue(true),
	exists: jest.fn().mockResolvedValue(false),
	closeLeftovers: jest.fn().mockResolvedValue(0),
});

const makeStore = (result: ClaimResult): jest.Mocked<ReservationStore> => ({
	claim: jest.fn().mockResolvedValue(result),
	release: jest.fn().mockResolvedValue(undefined),
});

const makeServices = (store: ReservationStore, repository: ReservedDuelRepository) =>
	new ReservedDuelServices({
		store,
		repository,
		instanceId: "slot-a",
		logger: new LoggerMock(),
		retryPolicy: { attempts: 1, baseDelayMs: 0 },
	});

const makeSocket = (resolvedUserId?: string) => ({
	id: `sock-${resolvedUserId}`,
	resolvedUserId,
	closed: false,
	send: jest.fn(),
	close: jest.fn(),
	destroy: jest.fn(),
	removeAllListeners: jest.fn(),
});

const makeCtx = (userId?: string, password = ID): JoinContext =>
	({
		rawPass: `rv#${password}`,
		command: "rv",
		password,
		playerInfo: { name: "Player", password: null, previousMessage: Buffer.alloc(0) },
		socket: makeSocket(userId),
		socketId: `sock-${userId}`,
		eventEmitter: new EventEmitter(),
		messageRepository: { errorMessage: jest.fn().mockReturnValue(Buffer.from("joinerror")) },
		logger: new LoggerMock(),
		message: { data: Buffer.alloc(0), previousMessage: Buffer.alloc(0) },
	}) as unknown as JoinContext;

const makeWindbot = (
	requestBot = jest.fn().mockResolvedValue({ bot: { name: "Haunted", deck: "d" } }),
) =>
	({ isEnabled: () => true, requestBot }) as unknown as WindbotModule & { requestBot: jest.Mock };

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe("ReservedDuelJoinStrategy", () => {
	let emitSpy: jest.SpyInstance;

	beforeEach(() => {
		emitSpy = jest.spyOn(YGOProRoom.prototype, "emit").mockImplementation(() => undefined);
	});

	afterEach(() => {
		emitSpy.mockRestore();
		const rooms = YGOProRoomList.getRooms();
		while (rooms.length) {
			YGOProRoomList.deleteRoom(rooms[0]);
		}
	});

	it("matches only the rv command", () => {
		const strategy = new ReservedDuelJoinStrategy(undefined, () => null);

		expect(strategy.matches(makeCtx("user-1"))).toBe(true);
		expect(strategy.matches({ ...makeCtx("user-1"), command: "edison" })).toBe(false);
	});

	it.each([
		"missing",
		"not_participant",
		"claimed_elsewhere",
		"unavailable",
	] as const)("refuses a %s claim without opening a room or writing rows", async (status) => {
		const repository = makeRepository();
		const store = makeStore({ status });
		const strategy = new ReservedDuelJoinStrategy(makeWindbot(), () =>
			makeServices(store, repository),
		);

		await expect(strategy.handle(makeCtx("user-1"))).rejects.toThrow(status);
		expect(YGOProRoomList.getRooms()).toHaveLength(0);
		expect(repository.open).not.toHaveBeenCalled();
		expect(store.release).not.toHaveBeenCalled();
	});

	it("refuses a socket without a ticket identity before claiming", async () => {
		const store = makeStore({ status: "claimed", reservation: makeReservation() });
		const strategy = new ReservedDuelJoinStrategy(makeWindbot(), () =>
			makeServices(store, makeRepository()),
		);

		await expect(strategy.handle(makeCtx(undefined))).rejects.toThrow();
		expect(store.claim).not.toHaveBeenCalled();
	});

	it("claims as the configured instance and opens a room built from the reservation", async () => {
		const repository = makeRepository();
		const store = makeStore({ status: "claimed", reservation: makeReservation() });
		const windbot = makeWindbot();
		const strategy = new ReservedDuelJoinStrategy(windbot, () => makeServices(store, repository));
		const ctx = makeCtx("user-1");

		await strategy.handle(ctx);

		expect(store.claim).toHaveBeenCalledWith(ID, "slot-a", "user-1");
		const [room] = YGOProRoomList.getRooms();
		expect(room.reservedDuel?.id).toBe(ID);
		expect(room.reservedUserIds).toEqual(["user-1"]);
		expect(room.noReconnect).toBe(true);
		expect(room.isMatch).toBe(false);
		expect(room.ranked).toBe(false);
		expect(room.shouldValidateDeck()).toBe(true);
		expect(repository.open).toHaveBeenCalledWith({
			reservation: makeReservation(),
			instanceId: "slot-a",
			roomId: room.id,
			joinedSeat: 0,
		});
		expect(emitSpy).toHaveBeenCalledWith("JOIN", ctx.message, ctx.socket);
		expect(windbot.requestBot).toHaveBeenCalledWith(room.id, "Haunted", expect.any(Function));
	});

	it("builds a best-of-3 room for match mode", async () => {
		const reservation = { ...twoHumans(), mode: "match" as const };
		const strategy = new ReservedDuelJoinStrategy(undefined, () =>
			makeServices(makeStore({ status: "claimed", reservation }), makeRepository()),
		);

		await strategy.handle(makeCtx("user-1"));

		expect(YGOProRoomList.getRooms()[0].isMatch).toBe(true);
	});

	it("records bot_unavailable and closes the room when windbot is off", async () => {
		const repository = makeRepository();
		const store = makeStore({ status: "claimed", reservation: makeReservation() });
		const strategy = new ReservedDuelJoinStrategy(undefined, () => makeServices(store, repository));
		const ctx = makeCtx("user-1");

		await strategy.handle(ctx);
		await flush();

		expect(repository.recordAbandon).toHaveBeenCalledWith(ID, {
			seat: null,
			reason: "bot_unavailable",
		});
		expect(store.release).toHaveBeenCalledWith(ID);
		expect(ctx.socket.close).toHaveBeenCalled();
		expect(YGOProRoomList.getRooms()).toHaveLength(0);
	});

	it("records bot_unavailable when the bot request fails", async () => {
		const repository = makeRepository();
		const store = makeStore({ status: "claimed", reservation: makeReservation() });
		const windbot = makeWindbot(jest.fn().mockRejectedValue(new Error("no bot")));
		const strategy = new ReservedDuelJoinStrategy(windbot, () => makeServices(store, repository));

		await strategy.handle(makeCtx("user-1"));
		await flush();

		expect(repository.recordAbandon).toHaveBeenCalledWith(ID, {
			seat: null,
			reason: "bot_unavailable",
		});
	});

	it("gives the reservation back when its rows cannot be written", async () => {
		const repository = makeRepository();
		repository.open.mockRejectedValue(new Error("db down"));
		const store = makeStore({ status: "claimed", reservation: makeReservation() });
		const strategy = new ReservedDuelJoinStrategy(makeWindbot(), () =>
			makeServices(store, repository),
		);

		await expect(strategy.handle(makeCtx("user-1"))).rejects.toThrow("db down");
		await flush();

		expect(repository.exists).toHaveBeenCalledWith(ID);
		expect(repository.recordAbandon).toHaveBeenCalledWith(ID, {
			seat: null,
			reason: "room_closed",
		});
		expect(store.release).toHaveBeenCalledWith(ID);
		expect(YGOProRoomList.getRooms()).toHaveLength(0);
	});

	it("opens the room when the row write failed but its rows were committed", async () => {
		const repository = makeRepository();
		repository.open.mockRejectedValue(new Error("connection reset"));
		repository.exists.mockResolvedValue(true);
		const store = makeStore({ status: "claimed", reservation: makeReservation() });
		const strategy = new ReservedDuelJoinStrategy(makeWindbot(), () =>
			makeServices(store, repository),
		);

		await strategy.handle(makeCtx("user-1"));
		await flush();

		expect(store.release).not.toHaveBeenCalled();
		expect(repository.recordAbandon).not.toHaveBeenCalled();
		expect(YGOProRoomList.getRooms()).toHaveLength(1);
	});

	it("closes the row when the write failed and its existence cannot be checked", async () => {
		const repository = makeRepository();
		repository.open.mockRejectedValue(new Error("db down"));
		repository.exists.mockRejectedValue(new Error("db down"));
		const store = makeStore({ status: "claimed", reservation: makeReservation() });
		const strategy = new ReservedDuelJoinStrategy(makeWindbot(), () =>
			makeServices(store, repository),
		);

		await expect(strategy.handle(makeCtx("user-1"))).rejects.toThrow("db down");
		await flush();

		expect(repository.recordAbandon).toHaveBeenCalledWith(ID, {
			seat: null,
			reason: "room_closed",
		});
		expect(store.release).toHaveBeenCalledWith(ID);
		expect(YGOProRoomList.getRooms()).toHaveLength(0);
	});

	it("records an unknown format as closed without playing it", async () => {
		const repository = makeRepository();
		const store = makeStore({
			status: "claimed",
			reservation: makeReservation({ format: "nonsense" }),
		});
		const strategy = new ReservedDuelJoinStrategy(makeWindbot(), () =>
			makeServices(store, repository),
		);

		await expect(strategy.handle(makeCtx("user-1"))).rejects.toThrow("unknown format");
		await flush();
		await flush();

		expect(YGOProRoomList.getRooms()).toHaveLength(0);
		expect(repository.recordAbandon).toHaveBeenCalledWith(ID, {
			seat: null,
			reason: "room_closed",
		});
	});

	describe("a later participant", () => {
		const openFor = async (reservation: Reservation, repository = makeRepository()) => {
			const first = new ReservedDuelJoinStrategy(undefined, () =>
				makeServices(makeStore({ status: "claimed", reservation }), repository),
			);
			await first.handle(makeCtx("user-1"));

			return YGOProRoomList.getRooms()[0];
		};

		it("takes their seat in the live room", async () => {
			const repository = makeRepository();
			const reservation = twoHumans();
			const room = await openFor(reservation, repository);
			const strategy = new ReservedDuelJoinStrategy(undefined, () =>
				makeServices(makeStore({ status: "already_claimed_here", reservation }), repository),
			);
			const ctx = makeCtx("user-2");

			await strategy.handle(ctx);

			expect(repository.claimSeat).toHaveBeenCalledWith(ID, 1);
			expect(emitSpy).toHaveBeenLastCalledWith("JOIN", ctx.message, ctx.socket);
			expect(room.reservedDuel?.seatOfUser("user-2")).toBe(1);
		});

		it("is refused when the seat was already taken", async () => {
			const repository = makeRepository();
			const reservation = twoHumans(false);
			await openFor(reservation, repository);
			repository.claimSeat.mockResolvedValue(false);
			const strategy = new ReservedDuelJoinStrategy(undefined, () =>
				makeServices(makeStore({ status: "already_claimed_here", reservation }), repository),
			);
			emitSpy.mockClear();

			await expect(strategy.handle(makeCtx("user-2"))).rejects.toThrow("seat already taken");
			expect(emitSpy).not.toHaveBeenCalled();
		});

		it("may come back to a taken seat when the room allows reconnecting", async () => {
			const repository = makeRepository();
			const reservation = twoHumans(true);
			await openFor(reservation, repository);
			repository.claimSeat.mockResolvedValue(false);
			const strategy = new ReservedDuelJoinStrategy(undefined, () =>
				makeServices(makeStore({ status: "already_claimed_here", reservation }), repository),
			);

			await expect(strategy.handle(makeCtx("user-2"))).resolves.toBeUndefined();
		});

		it("is refused once the room is gone (its row is terminal)", async () => {
			const repository = makeRepository();
			const strategy = new ReservedDuelJoinStrategy(undefined, () =>
				makeServices(
					makeStore({ status: "already_claimed_here", reservation: twoHumans() }),
					repository,
				),
			);

			await expect(strategy.handle(makeCtx("user-2"))).rejects.toThrow("no longer live");
			expect(repository.claimSeat).not.toHaveBeenCalled();
		});
	});
});
