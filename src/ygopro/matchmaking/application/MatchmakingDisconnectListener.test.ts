/**
 * DisconnectHandler — matchmaking queue dequeue on disconnect (D17).
 *
 * A socket can be queued in matchmaking with no room at all. On disconnect,
 * DisconnectHandler must dequeue it from the shared pool before (and
 * independently of) any room lookup, and must stay a safe no-op when
 * matchmaking was never initialized.
 */

import { LoggerMock } from "@test-support/mocks/logger/LoggerMock";
import { ParticipantMother } from "@test-support/mothers/matchmaking/ParticipantMother";
import { MatchmakingQueue } from "@ygopro/matchmaking/application/MatchmakingQueue";

import { createDisconnectHandler } from "src/bootstrap/disconnectHandler";
import { RoomFinder } from "@shared/room/application/RoomFinder";

const makeSocket = (id: string) => ({
	id,
	closed: false,
	send: jest.fn(),
	removeAllListeners: jest.fn(),
});

const makeRoomFinder = (room: unknown): RoomFinder =>
	({ run: jest.fn().mockReturnValue(room) }) as unknown as RoomFinder;

describe("DisconnectHandler — matchmaking dequeue", () => {
	afterEach(() => {
		MatchmakingQueue.resetForTests();
		jest.restoreAllMocks();
	});

	it("dequeues by socket id when the socket has no room, and logs the dequeue", () => {
		MatchmakingQueue.init({
			now: () => 0,
			createRankedRoom: jest.fn(),
			createBotRoom: jest.fn(),
			spawnBot: jest.fn(),
		});
		jest.spyOn(MatchmakingQueue.getInstance(), "dequeueBySocketId").mockReturnValue(true);
		const roomFinder = makeRoomFinder(undefined);
		const socket = makeSocket("sock-queued");
		const logger = new LoggerMock();
		const infoSpy = jest.spyOn(logger, "info");

		createDisconnectHandler(socket as never, roomFinder, logger).run();

		expect(MatchmakingQueue.getInstance().dequeueBySocketId).toHaveBeenCalledWith("sock-queued");
		expect(roomFinder.run).toHaveBeenCalledWith("sock-queued");
		expect(infoSpy).toHaveBeenCalledWith("matchmaking.dequeued", { reason: "disconnect" });
	});

	it("dequeues before the room lookup even when a room is found", () => {
		MatchmakingQueue.init({
			now: () => 0,
			createRankedRoom: jest.fn(),
			createBotRoom: jest.fn(),
			spawnBot: jest.fn(),
		});
		const dequeueSpy = jest.spyOn(MatchmakingQueue.getInstance(), "dequeueBySocketId");
		// An unrecognized room shape short-circuits handle()/handleYGOPro() with
		// no side effects, isolating this assertion to the dequeue-ordering claim.
		const roomFinder = makeRoomFinder({});
		const socket = makeSocket("sock-with-room");

		createDisconnectHandler(socket as never, roomFinder).run();

		expect(dequeueSpy).toHaveBeenCalledWith("sock-with-room");
	});

	it("counts a disconnect during a pending accept step as a decline, returning the opponent to the pool", () => {
		const matchHandler = { handle: jest.fn() };
		MatchmakingQueue.init({
			now: () => 0,
			createRankedRoom: jest.fn(),
			createBotRoom: jest.fn(),
			spawnBot: jest.fn(),
			matchHandler,
		});
		const pool = MatchmakingQueue.getInstance().getPool();
		pool.add(
			ParticipantMother.create({
				id: "sock-pending",
				userId: "u-pending",
				enqueuedAt: 0,
				supportsAcceptStep: true,
			}),
		);
		pool.add(
			ParticipantMother.create({ id: "sock-opponent", userId: "u-opponent", enqueuedAt: 1 }),
		);
		pool.tick();
		const logger = new LoggerMock();
		const infoSpy = jest.spyOn(logger, "info");

		createDisconnectHandler(
			makeSocket("sock-pending") as never,
			makeRoomFinder(undefined),
			logger,
		).run();

		expect(infoSpy).toHaveBeenCalledWith("matchmaking.dequeued", { reason: "disconnect" });
		expect(pool.isQueued("sock-pending")).toBe(false);
		expect(pool.isQueued("sock-opponent")).toBe(true);
		expect(pool.depthByFormat().tcg).toBe(1);
		expect(matchHandler.handle).not.toHaveBeenCalled();
	});

	it("is a no-op when matchmaking was never initialized", () => {
		const roomFinder = makeRoomFinder(undefined);
		const socket = makeSocket("sock-no-mm");

		expect(() => createDisconnectHandler(socket as never, roomFinder).run()).not.toThrow();
		expect(MatchmakingQueue.isInitialized()).toBe(false);
	});
});
