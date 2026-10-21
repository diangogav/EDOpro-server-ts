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
	MatchProposalNotice,
	ParticipantChannel,
	RejectionReason,
} from "./ParticipantChannel";
import { PoolStore } from "./PoolStore";
import { MATCH_ACCEPT_TIMEOUT_MS } from "./QueueEntry";

class RecordingChannel implements ParticipantChannel {
	public readonly statusCalls: MatchmakingStatusUpdate[] = [];
	public readonly closeCalls: RejectionReason[] = [];
	public readonly proposedCalls: MatchProposalNotice[] = [];
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

	proposed(notice: MatchProposalNotice): void {
		this.proposedCalls.push(notice);
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

	describe("accept step", () => {
		const setup = (initialNow = 0) => {
			let now = initialNow;
			const logger = new LoggerMock();
			const infoSpy = jest.spyOn(logger, "info");
			const store = new InMemoryPoolStore();
			const matchHandler = new RecordingMatchHandler();
			const pool = buildPool(store, () => now, matchHandler, logger);
			const advanceTo = (value: number) => {
				now = value;
			};
			const logged = (event: string) =>
				infoSpy.mock.calls.filter(([message]) => message === event).map(([, context]) => context);
			return { pool, store, matchHandler, advanceTo, logged };
		};
		const optedIn = (id: string, enqueuedAt: number, channel = new RecordingChannel()) =>
			ParticipantMother.create({
				id,
				userId: `u-${id}`,
				enqueuedAt,
				supportsAcceptStep: true,
				channel,
			});
		const legacy = (id: string, enqueuedAt: number, channel = new RecordingChannel()) =>
			ParticipantMother.create({ id, userId: `u-${id}`, enqueuedAt, channel });

		it("removes the second decliner too when both players decline one after the other", () => {
			const { pool, store } = setup(5_000);
			const bChannel = new RecordingChannel();
			pool.add(optedIn("a", 0));
			pool.add(optedIn("b", 1_000, bChannel));
			pool.tick();

			expect(pool.decline("match-1", "a")).toBe("declined");
			expect(pool.decline("match-1", "b")).toBe("declined");

			expect(pool.isQueued("b")).toBe(false);
			expect(store.get("b")).toBeUndefined();
			expect(bChannel.closeCalls).toEqual(["declined"]);
		});

		it("keeps a player searching when they accept a match the opponent already declined", () => {
			const { pool, store } = setup(5_000);
			const bChannel = new RecordingChannel();
			pool.add(optedIn("a", 0));
			pool.add(optedIn("b", 1_000, bChannel));
			pool.tick();
			pool.decline("match-1", "a");

			expect(pool.accept("match-1", "b")).toBe("requeued");

			expect(store.get("b")?.id).toBe("b");
			expect(bChannel.closeCalls).toEqual([]);
		});

		it("forgets a declined match once its accept window is over", () => {
			const { pool, advanceTo } = setup(5_000);
			pool.add(optedIn("a", 0));
			pool.add(optedIn("b", 1_000));
			pool.tick();
			pool.decline("match-1", "a");

			advanceTo(5_000 + MATCH_ACCEPT_TIMEOUT_MS);
			pool.tick();

			expect(pool.decline("match-1", "b")).toBe("unknown_match");
		});

		it("provisions a pair where nobody opted in immediately, exactly as before", () => {
			const { pool, matchHandler, logged } = setup(5_000);
			const aChannel = new RecordingChannel();
			const bChannel = new RecordingChannel();
			const a = legacy("a", 0, aChannel);
			const b = legacy("b", 1_000, bChannel);
			pool.add(a);
			pool.add(b);

			pool.tick();

			expect(matchHandler.handled.map((match) => match.participants)).toEqual([[a, b]]);
			expect(aChannel.proposedCalls).toEqual([]);
			expect(bChannel.proposedCalls).toEqual([]);
			expect(logged("matchmaking.proposed")).toEqual([]);
		});

		it("holds a human match with an opted-in participant instead of provisioning it", () => {
			const { pool, store, matchHandler, logged } = setup(5_000);
			const aChannel = new RecordingChannel();
			const bChannel = new RecordingChannel();
			pool.add(optedIn("a", 0, aChannel));
			pool.add(legacy("b", 1_000, bChannel));

			pool.tick();

			expect(matchHandler.handled).toEqual([]);
			expect(store.get("a")).toBeUndefined();
			expect(store.get("b")).toBeUndefined();
			expect(pool.isQueued("a")).toBe(true);
			expect(pool.isQueued("b")).toBe(true);
			expect(aChannel.proposedCalls).toEqual([
				{ matchId: "match-1", acceptWithinMs: MATCH_ACCEPT_TIMEOUT_MS },
			]);
			expect(bChannel.proposedCalls).toEqual([]);
			expect(aChannel.statusCalls).toEqual([]);
			expect(bChannel.statusCalls).toEqual([]);
			expect(logged("matchmaking.proposed")).toEqual([
				{ matchId: "match-1", format: "tcg", mode: "ranked", acceptWithinMs: 20_000 },
			]);
			expect(logged("matchmaking.exit")).toEqual([]);
		});

		it("never pairs a pending participant again", () => {
			const { pool, store, matchHandler } = setup(5_000);
			pool.add(optedIn("a", 0));
			pool.add(legacy("b", 1_000));
			pool.tick();
			const c = legacy("c", 2_000);
			pool.add(c);

			pool.tick();

			expect(matchHandler.handled).toEqual([]);
			expect(store.get("c")).toBe(c);
		});

		it("provisions the held match through the match handler once every opted-in participant accepts", () => {
			const { pool, matchHandler, logged } = setup(5_000);
			const a = optedIn("a", 0);
			const b = legacy("b", 1_000);
			pool.add(a);
			pool.add(b);
			pool.tick();

			expect(pool.accept("match-1", "a")).toBe("accepted");

			expect(matchHandler.handled).toHaveLength(1);
			expect(matchHandler.handled[0].participants).toEqual([a, b]);
			expect(pool.isQueued("a")).toBe(false);
			expect(pool.isQueued("b")).toBe(false);
			expect(logged("matchmaking.accepted")).toEqual([{ matchId: "match-1", participantId: "a" }]);
			expect(logged("matchmaking.exit")).toEqual([
				expect.objectContaining({ participantId: "a", outcome: "matched_human", waitedMs: 5_000 }),
				expect.objectContaining({ participantId: "b", outcome: "matched_human", waitedMs: 4_000 }),
			]);
		});

		it("waits for both participants when both opted in", () => {
			const { pool, matchHandler } = setup(5_000);
			pool.add(optedIn("a", 0));
			pool.add(optedIn("b", 1_000));
			pool.tick();

			pool.accept("match-1", "b");
			expect(matchHandler.handled).toEqual([]);

			pool.accept("match-1", "a");
			expect(matchHandler.handled).toHaveLength(1);
		});

		it("rejects a response for an unknown match or from a participant outside it", () => {
			const { pool, matchHandler } = setup(5_000);
			pool.add(optedIn("a", 0));
			pool.add(legacy("b", 1_000));
			pool.add(legacy("c", 1_500));
			pool.tick();

			expect(pool.accept("match-404", "a")).toBe("unknown_match");
			expect(pool.decline("match-404", "a")).toBe("unknown_match");
			expect(pool.accept("match-1", "c")).toBe("unknown_match");
			expect(pool.decline("match-1", "c")).toBe("unknown_match");
			expect(matchHandler.handled).toEqual([]);
			expect(pool.isQueued("a")).toBe(true);
		});

		it("removes a decliner and puts the opponent back first in line with its original enqueue time", () => {
			const { pool, store, matchHandler, logged, advanceTo } = setup(5_000);
			const aChannel = new RecordingChannel();
			const bChannel = new RecordingChannel();
			const b = legacy("b", 1_000, bChannel);
			pool.add(optedIn("a", 0, aChannel));
			pool.add(b);
			pool.tick();
			const c = legacy("c", 4_000);
			pool.add(c);

			advanceTo(6_000);
			expect(pool.decline("match-1", "a")).toBe("declined");

			expect(pool.isQueued("a")).toBe(false);
			expect(aChannel.closeCalls).toEqual(["declined"]);
			expect(store.get("b")).toBe(b);
			expect(bChannel.statusCalls).toEqual([{ state: "searching", waitedMs: 5_000 }]);
			expect(logged("matchmaking.declined")).toEqual([
				{ matchId: "match-1", participantId: "a", outcome: "declined" },
			]);
			expect(logged("matchmaking.exit")).toEqual([
				expect.objectContaining({ participantId: "a", outcome: "declined", waitedMs: 6_000 }),
			]);

			pool.add(legacy("d", 6_000));
			pool.tick();

			expect(matchHandler.handled.map((match) => match.participants)).toEqual([[b, c]]);
		});

		it("times out unanswered participants once the accept deadline passes", () => {
			const { pool, store, logged, advanceTo } = setup(5_000);
			const aChannel = new RecordingChannel();
			const b = legacy("b", 1_000);
			pool.add(optedIn("a", 0, aChannel));
			pool.add(b);
			pool.tick();

			advanceTo(5_000 + MATCH_ACCEPT_TIMEOUT_MS - 1);
			pool.tick();
			expect(pool.isQueued("a")).toBe(true);
			expect(aChannel.closeCalls).toEqual([]);

			advanceTo(5_000 + MATCH_ACCEPT_TIMEOUT_MS);
			pool.tick();

			expect(pool.isQueued("a")).toBe(false);
			expect(aChannel.closeCalls).toEqual(["accept_timeout"]);
			expect(store.get("b")).toBe(b);
			expect(logged("matchmaking.accept_timeout")).toEqual([
				{ matchId: "match-1", participantId: "a", outcome: "accept_timeout" },
			]);
			expect(logged("matchmaking.exit")).toEqual([
				expect.objectContaining({ participantId: "a", outcome: "accept_timeout" }),
			]);
		});

		it("refuses an accept that arrives after the deadline", () => {
			const { pool, matchHandler, advanceTo } = setup(5_000);
			pool.add(optedIn("a", 0));
			pool.add(legacy("b", 1_000));
			pool.tick();

			advanceTo(5_000 + MATCH_ACCEPT_TIMEOUT_MS);

			expect(pool.accept("match-1", "a")).toBe("unknown_match");
			expect(matchHandler.handled).toEqual([]);
		});

		it("removes both participants when neither accepts in time", () => {
			const { pool, store, advanceTo } = setup(5_000);
			const aChannel = new RecordingChannel();
			const bChannel = new RecordingChannel();
			pool.add(optedIn("a", 0, aChannel));
			pool.add(optedIn("b", 1_000, bChannel));
			pool.tick();

			advanceTo(5_000 + MATCH_ACCEPT_TIMEOUT_MS);
			pool.tick();

			expect(aChannel.closeCalls).toEqual(["accept_timeout"]);
			expect(bChannel.closeCalls).toEqual(["accept_timeout"]);
			expect(store.get("a")).toBeUndefined();
			expect(store.get("b")).toBeUndefined();
			expect(pool.isQueued("a")).toBe(false);
			expect(pool.isQueued("b")).toBe(false);
		});

		it("times out only the participant that never accepted", () => {
			const { pool, store, advanceTo } = setup(5_000);
			const aChannel = new RecordingChannel();
			const b = optedIn("b", 1_000);
			pool.add(optedIn("a", 0, aChannel));
			pool.add(b);
			pool.tick();
			pool.accept("match-1", "b");

			advanceTo(5_000 + MATCH_ACCEPT_TIMEOUT_MS);
			pool.tick();

			expect(aChannel.closeCalls).toEqual(["accept_timeout"]);
			expect(store.get("b")).toBe(b);
		});

		it("counts a pending participant whose connection leaves as a decline", () => {
			const { pool, store, logged } = setup(5_000);
			const aChannel = new RecordingChannel();
			const b = legacy("b", 1_000);
			pool.add(optedIn("a", 0, aChannel));
			pool.add(b);
			pool.tick();

			expect(pool.dequeueBySocketId("a")).toBe(true);

			expect(pool.isQueued("a")).toBe(false);
			expect(aChannel.closeCalls).toEqual([]);
			expect(store.get("b")).toBe(b);
			expect(logged("matchmaking.declined")).toEqual([
				{ matchId: "match-1", participantId: "a", outcome: "declined" },
			]);
		});

		it("counts a pending participant the sweep finds dead as a decline", () => {
			const { pool, store, logged } = setup(5_000);
			const aChannel = new RecordingChannel();
			const b = legacy("b", 1_000);
			pool.add(optedIn("a", 0, aChannel));
			pool.add(b);
			pool.tick();
			aChannel.setAlive(false);

			pool.tick();

			expect(pool.isQueued("a")).toBe(false);
			expect(aChannel.closeCalls).toEqual([]);
			expect(store.get("b")).toBe(b);
			expect(logged("matchmaking.declined")).toEqual([
				{ matchId: "match-1", participantId: "a", outcome: "expired" },
			]);
		});

		it("returns the opted-in opponent to the pool when a pending poll participant cancels", () => {
			const { pool, store } = setup(5_000);
			const a = optedIn("a", 0);
			pool.add(a);
			pool.add(
				ParticipantMother.create({ id: "t-b", userId: "u-b", enqueuedAt: 1_000, presence: "poll" }),
			);
			pool.tick();

			pool.remove("t-b");

			expect(pool.isQueued("t-b")).toBe(false);
			expect(store.get("a")).toBe(a);
		});

		it("replaces a pending participant when the same user reconnects, freeing the opponent", () => {
			const { pool, store } = setup(5_000);
			const aChannel = new RecordingChannel();
			const b = legacy("b", 1_000);
			pool.add(optedIn("a", 0, aChannel));
			pool.add(b);
			pool.tick();
			const replacement = ParticipantMother.create({ id: "a2", userId: "u-a", enqueuedAt: 5_000 });

			expect(pool.add(replacement)).toBe(true);

			expect(aChannel.closeCalls).toEqual(["replaced_by_new_connection"]);
			expect(pool.isQueued("a")).toBe(false);
			expect(store.get("b")).toBe(b);
			expect(store.findByUserId("u-a")).toBe(replacement);
		});

		it("rejects a poll arrival for a user whose match is pending", () => {
			const { pool } = setup(5_000);
			pool.add(optedIn("a", 0));
			pool.add(legacy("b", 1_000));
			pool.tick();

			expect(() =>
				pool.add(ParticipantMother.create({ id: "t-a", userId: "u-a", presence: "poll" })),
			).toThrow(DuplicateQueueEntryError);
			expect(pool.isQueued("a")).toBe(true);
		});

		it("never holds a bot fallback match, even for an opted-in participant", () => {
			const matchHandler = new RecordingMatchHandler();
			const channel = new RecordingChannel();
			const pool = new MatchmakingPool({
				store: new InMemoryPoolStore(),
				pairingPolicy: {
					pair: (candidates) => [
						{
							id: "m-bot",
							format: "tcg",
							mode: "ranked",
							rated: false,
							opponentKind: "bot",
							participants: [candidates[0]],
						},
					],
				},
				matchHandler,
				now: () => 70_000,
			});
			pool.add(optedIn("solo", 0, channel));

			pool.tick();

			expect(matchHandler.handled.map((match) => match.id)).toEqual(["m-bot"]);
			expect(channel.proposedCalls).toEqual([]);
		});
	});
});
