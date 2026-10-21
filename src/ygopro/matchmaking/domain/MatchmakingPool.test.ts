import { Logger } from "@shared/logger/domain/Logger";
import { LoggerMock } from "@test-support/mocks/logger/LoggerMock";
import { ParticipantMother } from "@test-support/mothers/matchmaking/ParticipantMother";

import { InMemoryPoolStore } from "../infrastructure/InMemoryPoolStore";
import { DuplicateQueueEntryError } from "./DuplicateQueueEntryError";
import { FifoPairingPolicy } from "./FifoPairingPolicy";
import { Match } from "./Match";
import { MatchHandler } from "./MatchHandler";
import { MatchmakingPool } from "./MatchmakingPool";
import {
	MatchFoundNotice,
	MatchmakingStatusUpdate,
	ParticipantChannel,
	RejectionReason,
} from "./ParticipantChannel";
import { PoolStore } from "./PoolStore";

class RecordingChannel implements ParticipantChannel {
	public readonly statusCalls: MatchmakingStatusUpdate[] = [];
	public readonly closeCalls: RejectionReason[] = [];
	private alive = true;

	constructor(private readonly onClose?: (reason: RejectionReason) => void) {}

	setAlive(value: boolean): void {
		this.alive = value;
	}

	status(update: MatchmakingStatusUpdate): void {
		this.statusCalls.push(update);
	}

	found(_notice: MatchFoundNotice): void {
		/* not exercised in this suite */
	}

	close(reason: RejectionReason): void {
		this.closeCalls.push(reason);
		this.onClose?.(reason);
	}

	isAlive(_now: number): boolean {
		return this.alive;
	}
}

class RecordingMatchHandler implements MatchHandler {
	public readonly handled: Match[] = [];

	handle(match: Match): void {
		this.handled.push(match);
	}
}

function buildPool(
	store: PoolStore,
	now: () => number,
	matchHandler: MatchHandler,
	logger?: Logger,
): MatchmakingPool {
	let nextId = 0;
	return new MatchmakingPool({
		store,
		pairingPolicy: new FifoPairingPolicy(() => `match-${++nextId}`),
		matchHandler,
		now,
		logger,
	});
}

describe("MatchmakingPool", () => {
	describe("add", () => {
		it("preserves FIFO order when two compatible participants pair", () => {
			const store = new InMemoryPoolStore();
			const matchHandler = new RecordingMatchHandler();
			const pool = buildPool(store, () => 10_000, matchHandler);
			const first = ParticipantMother.create({ id: "a", userId: "u-a", enqueuedAt: 1_000 });
			const second = ParticipantMother.create({ id: "b", userId: "u-b", enqueuedAt: 2_000 });

			pool.add(second);
			pool.add(first);
			pool.tick();

			expect(matchHandler.handled).toHaveLength(1);
			expect(matchHandler.handled[0].participants).toEqual([first, second]);
		});

		it("replaces the existing socket participant, removing it before closing it", () => {
			const store = new InMemoryPoolStore();
			const pool = buildPool(store, () => 0, new RecordingMatchHandler());
			let existingRemovedBeforeClose = false;
			let newAddedBeforeClose = false;
			const oldChannel = new RecordingChannel(() => {
				existingRemovedBeforeClose = store.get("conn-1") === undefined;
				newAddedBeforeClose = store.get("conn-2") !== undefined;
			});
			const existing = ParticipantMother.create({
				id: "conn-1",
				userId: "u-1",
				channel: oldChannel,
			});
			pool.add(existing);
			const replacement = ParticipantMother.create({ id: "conn-2", userId: "u-1" });

			expect(pool.add(replacement)).toBe(true);

			expect(existingRemovedBeforeClose).toBe(true);
			expect(newAddedBeforeClose).toBe(false);
			expect(oldChannel.closeCalls).toEqual(["replaced_by_new_connection"]);
			expect(store.findByUserId("u-1")).toBe(replacement);
		});

		it("replaces an existing poll participant when a new socket connection arrives for the same user", () => {
			const store = new InMemoryPoolStore();
			const pool = buildPool(store, () => 0, new RecordingMatchHandler());
			const oldChannel = new RecordingChannel();
			const existingPoll = ParticipantMother.create({
				id: "ticket-1",
				userId: "u-2",
				presence: "poll",
				channel: oldChannel,
			});
			pool.add(existingPoll);
			const newSocket = ParticipantMother.create({
				id: "conn-3",
				userId: "u-2",
				presence: "socket",
			});

			pool.add(newSocket);

			expect(oldChannel.closeCalls).toEqual(["replaced_by_new_connection"]);
			expect(store.findByUserId("u-2")).toBe(newSocket);
		});

		it("throws DuplicateQueueEntryError for a poll arrival when the user is already queued", () => {
			const store = new InMemoryPoolStore();
			const pool = buildPool(store, () => 0, new RecordingMatchHandler());
			const existing = ParticipantMother.create({ id: "conn-4", userId: "u-3" });
			pool.add(existing);
			const duplicatePoll = ParticipantMother.create({
				id: "ticket-2",
				userId: "u-3",
				presence: "poll",
			});

			expect(() => pool.add(duplicatePoll)).toThrow(DuplicateQueueEntryError);
			expect(store.findByUserId("u-3")).toBe(existing);
		});
	});

	describe("dequeueBySocketId", () => {
		it("is a no-op for an id that was never queued", () => {
			const store = new InMemoryPoolStore();
			const pool = buildPool(store, () => 0, new RecordingMatchHandler());
			const participant = ParticipantMother.create({ id: "conn-5", userId: "u-4" });
			expect(pool.add(participant)).toBe(false);

			expect(pool.dequeueBySocketId("unknown-id")).toBe(false);
			expect(store.get("conn-5")).toBe(participant);
		});

		it("reports the removal of an id that was queued", () => {
			const store = new InMemoryPoolStore();
			const pool = buildPool(store, () => 0, new RecordingMatchHandler());
			pool.add(ParticipantMother.create({ id: "conn-6", userId: "u-5" }));

			expect(pool.dequeueBySocketId("conn-6")).toBe(true);
			expect(store.get("conn-6")).toBeUndefined();
		});
	});

	describe("tick", () => {
		it("sweeps a stale poll participant but never a live socket participant", () => {
			const store = new InMemoryPoolStore();
			const pool = buildPool(store, () => 5_000, new RecordingMatchHandler());
			const deadChannel = new RecordingChannel();
			deadChannel.setAlive(false);
			const stalePoll = ParticipantMother.create({
				id: "ticket-3",
				userId: "u-5",
				presence: "poll",
				channel: deadChannel,
			});
			const liveSocket = ParticipantMother.create({ id: "conn-6", userId: "u-6" });
			pool.add(stalePoll);
			pool.add(liveSocket);

			pool.tick();

			expect(store.get("ticket-3")).toBeUndefined();
			expect(store.get("conn-6")).toBe(liveSocket);
		});

		it("runs sweep, then pair, then status — a paired participant never receives a status push", () => {
			const store = new InMemoryPoolStore();
			const matchHandler = new RecordingMatchHandler();
			const pool = buildPool(store, () => 5_000, matchHandler);
			const firstChannel = new RecordingChannel();
			const secondChannel = new RecordingChannel();
			const leftoverChannel = new RecordingChannel();
			const first = ParticipantMother.create({
				id: "a",
				userId: "u-a",
				enqueuedAt: 0,
				channel: firstChannel,
			});
			const second = ParticipantMother.create({
				id: "b",
				userId: "u-b",
				enqueuedAt: 1_000,
				channel: secondChannel,
			});
			const leftover = ParticipantMother.create({
				id: "c",
				userId: "u-c",
				enqueuedAt: 2_000,
				channel: leftoverChannel,
			});
			pool.add(first);
			pool.add(second);
			pool.add(leftover);

			pool.tick();

			expect(matchHandler.handled).toHaveLength(1);
			expect(matchHandler.handled[0].participants).toEqual([first, second]);
			expect(firstChannel.statusCalls).toHaveLength(0);
			expect(secondChannel.statusCalls).toHaveLength(0);
			expect(leftoverChannel.statusCalls).toEqual([{ state: "searching", waitedMs: 3_000 }]);
		});

		it("pushes status on every tick with the current waited time", () => {
			const store = new InMemoryPoolStore();
			let now = 1_000;
			const pool = buildPool(store, () => now, new RecordingMatchHandler());
			const channel = new RecordingChannel();
			const participant = ParticipantMother.create({
				id: "solo",
				userId: "u-solo",
				enqueuedAt: 1_000,
				channel,
			});
			pool.add(participant);

			pool.tick();
			now = 3_000;
			pool.tick();

			expect(channel.statusCalls).toEqual([
				{ state: "searching", waitedMs: 0 },
				{ state: "searching", waitedMs: 2_000 },
			]);
		});
	});
	describe("queue exit logging", () => {
		const setup = (now: () => number, matchHandler: MatchHandler = new RecordingMatchHandler()) => {
			const logger = new LoggerMock();
			const infoSpy = jest.spyOn(logger, "info");
			const store = new InMemoryPoolStore();
			const pool = buildPool(store, now, matchHandler, logger);
			return { pool, infoSpy };
		};
		const exitCalls = (infoSpy: jest.SpyInstance) =>
			infoSpy.mock.calls.filter(([message]) => message === "matchmaking.exit");

		it("logs a human match for each paired participant with its waited time", () => {
			const { pool, infoSpy } = setup(() => 5_000);
			pool.add(ParticipantMother.create({ id: "a", userId: "u-a", enqueuedAt: 1_000 }));
			pool.add(
				ParticipantMother.create({
					id: "b",
					userId: "u-b",
					enqueuedAt: 2_000,
					format: "tcg",
					botFallbackAfterMs: 60_000,
				}),
			);

			pool.tick();

			expect(exitCalls(infoSpy)).toEqual([
				[
					"matchmaking.exit",
					{
						participantId: "a",
						outcome: "matched_human",
						waitedMs: 4_000,
						format: "tcg",
						presence: "socket",
						hasBotFallback: false,
					},
				],
				[
					"matchmaking.exit",
					{
						participantId: "b",
						outcome: "matched_human",
						waitedMs: 3_000,
						format: "tcg",
						presence: "socket",
						hasBotFallback: true,
					},
				],
			]);
		});

		it("logs a bot match for a single-participant match", () => {
			const handler = new RecordingMatchHandler();
			const logger = new LoggerMock();
			const infoSpy = jest.spyOn(logger, "info");
			const pool = new MatchmakingPool({
				store: new InMemoryPoolStore(),
				pairingPolicy: {
					pair: (candidates) => [
						{
							id: "m-1",
							format: "tcg",
							mode: "ranked",
							rated: false,
							opponentKind: "bot",
							participants: [candidates[0]],
						},
					],
				},
				matchHandler: handler,
				now: () => 70_000,
				logger,
			});
			pool.add(
				ParticipantMother.create({
					id: "solo",
					userId: "u-solo",
					enqueuedAt: 0,
					presence: "poll",
					botFallbackAfterMs: 60_000,
				}),
			);

			pool.tick();

			expect(exitCalls(infoSpy)).toEqual([
				[
					"matchmaking.exit",
					{
						participantId: "solo",
						outcome: "matched_bot",
						waitedMs: 70_000,
						format: "tcg",
						presence: "poll",
						hasBotFallback: true,
					},
				],
			]);
		});

		it("logs an expired outcome when the sweep drops a dead participant", () => {
			const { pool, infoSpy } = setup(() => 9_000);
			const channel = new RecordingChannel();
			channel.setAlive(false);
			pool.add(ParticipantMother.create({ id: "dead", userId: "u-d", enqueuedAt: 1_000, channel }));

			pool.tick();

			expect(exitCalls(infoSpy)).toEqual([
				[
					"matchmaking.exit",
					expect.objectContaining({ participantId: "dead", outcome: "expired", waitedMs: 8_000 }),
				],
			]);
		});

		it("logs a cancelled outcome when a participant is removed by id", () => {
			const { pool, infoSpy } = setup(() => 4_000);
			pool.add(ParticipantMother.create({ id: "t1", userId: "u-1", enqueuedAt: 1_000 }));

			pool.remove("t1");

			expect(exitCalls(infoSpy)).toEqual([
				[
					"matchmaking.exit",
					expect.objectContaining({ participantId: "t1", outcome: "cancelled", waitedMs: 3_000 }),
				],
			]);
		});

		it("logs a dequeued outcome when a socket participant leaves", () => {
			const { pool, infoSpy } = setup(() => 4_000);
			pool.add(ParticipantMother.create({ id: "sock", userId: "u-1", enqueuedAt: 0 }));

			pool.dequeueBySocketId("sock");

			expect(exitCalls(infoSpy)).toEqual([
				[
					"matchmaking.exit",
					expect.objectContaining({ participantId: "sock", outcome: "dequeued", waitedMs: 4_000 }),
				],
			]);
		});

		it("logs a replaced outcome for the participant a new connection supersedes", () => {
			const { pool, infoSpy } = setup(() => 2_000);
			pool.add(ParticipantMother.create({ id: "old", userId: "u-1", enqueuedAt: 500 }));

			pool.add(ParticipantMother.create({ id: "new", userId: "u-1", enqueuedAt: 2_000 }));

			expect(exitCalls(infoSpy)).toEqual([
				[
					"matchmaking.exit",
					expect.objectContaining({ participantId: "old", outcome: "replaced", waitedMs: 1_500 }),
				],
			]);
		});

		it("does not log when the removed id was not queued", () => {
			const { pool, infoSpy } = setup(() => 0);

			pool.remove("ghost");
			pool.dequeueBySocketId("ghost");

			expect(exitCalls(infoSpy)).toEqual([]);
		});

		it("never logs the user id or display name", () => {
			const { pool, infoSpy } = setup(() => 1_000);
			pool.add(
				ParticipantMother.create({
					id: "t1",
					userId: "secret-user",
					displayName: "SecretName",
					enqueuedAt: 0,
				}),
			);

			pool.remove("t1");

			const text = JSON.stringify(infoSpy.mock.calls);
			expect(text).not.toContain("secret-user");
			expect(text).not.toContain("SecretName");
		});
	});

	describe("depthByFormat", () => {
		it("counts the queued participants of every format, including empty ones", () => {
			const store = new InMemoryPoolStore();
			const pool = buildPool(store, () => 0, new RecordingMatchHandler());
			pool.add(ParticipantMother.create({ id: "a", userId: "u-a", format: "edison" }));
			pool.add(ParticipantMother.create({ id: "b", userId: "u-b", format: "tcg" }));

			expect(pool.depthByFormat()).toEqual({ tcg: 1, jtp: 0, edison: 1 });
		});

		it("reports zero for every format when nobody is queued", () => {
			const pool = buildPool(new InMemoryPoolStore(), () => 0, new RecordingMatchHandler());

			expect(pool.depthByFormat()).toEqual({ tcg: 0, jtp: 0, edison: 0 });
		});
	});
});
