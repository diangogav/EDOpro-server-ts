import { BOT_FALLBACK_MS, MATCHED_GRACE_MS, QUEUE_TTL_MS, SUPPORTED_FORMAT } from "./QueueEntry";
import { MatchmakingQueue, MatchmakingQueueDeps } from "./MatchmakingQueue";

// ---- helpers ----

const makeDeps = (overrides: Partial<MatchmakingQueueDeps> = {}): MatchmakingQueueDeps => {
	let roomSeq = 0;
	return {
		now: () => 0,
		createRankedRoom: () => {
			roomSeq += 1;
			return { roomPassword: `to,mm-r${roomSeq}#pw${roomSeq}` };
		},
		createBotRoom: () => {
			roomSeq += 1;
			return { roomPassword: `to,mm-b${roomSeq}#pw${roomSeq}`, roomId: 1000 + roomSeq };
		},
		spawnBot: jest.fn(),
		...overrides,
	};
};

const enqueue = (queue: MatchmakingQueue, ticketId: string, userId: string) =>
	queue.enqueue({ ticketId, userId, format: SUPPORTED_FORMAT });

describe("MatchmakingQueue", () => {
	afterEach(() => {
		MatchmakingQueue.resetForTests();
	});

	describe("enqueue", () => {
		it("registers a searching entry keyed by ticketId", () => {
			const clock = { t: 100 };
			const queue = MatchmakingQueue.createForTests(makeDeps({ now: () => clock.t }));

			enqueue(queue, "t1", "user-1");
			const entry = queue.get("t1");

			expect(entry).toMatchObject({
				ticketId: "t1",
				userId: "user-1",
				state: "searching",
				enteredAt: 100,
				lastPollAt: 100,
			});
		});

		it("rejects a second active entry for the same user (one entry per user)", () => {
			const queue = MatchmakingQueue.createForTests(makeDeps());

			enqueue(queue, "t1", "user-1");

			expect(() => enqueue(queue, "t2", "user-1")).toThrow();
			expect(queue.get("t2")).toBeUndefined();
			// original entry stays intact
			expect(queue.get("t1")).toBeDefined();
		});
	});

	describe("poll", () => {
		it("returns searching state with elapsed waitedMs and refreshes lastPollAt", () => {
			const clock = { t: 0 };
			const queue = MatchmakingQueue.createForTests(makeDeps({ now: () => clock.t }));
			enqueue(queue, "t1", "user-1");

			clock.t = 3_000;
			const status = queue.poll("t1");

			expect(status).toEqual({ state: "searching", waitedMs: 3_000 });
			expect(queue.get("t1")?.lastPollAt).toBe(3_000);
		});

		it("returns null for an unknown ticketId", () => {
			const queue = MatchmakingQueue.createForTests(makeDeps());
			expect(queue.poll("nope")).toBeNull();
		});

		it("does NOT advance the whole-queue tick for an unknown ticketId", () => {
			// A garbage/unknown ticket poll must short-circuit (404) WITHOUT driving an
			// O(n) sweep or side-effecting room creation on behalf of nobody.
			const queue = MatchmakingQueue.createForTests(makeDeps());
			enqueue(queue, "t1", "user-1"); // a lone waiting entry
			const tickSpy = jest.spyOn(queue, "tick");

			expect(queue.poll("garbage")).toBeNull();

			// The unknown poll short-circuited: the sweep was never run.
			expect(tickSpy).not.toHaveBeenCalled();
			expect(queue.get("t1")?.state).toBe("searching");
			tickSpy.mockRestore();
		});

		it("returns the matched payload once paired", () => {
			const clock = { t: 0 };
			const queue = MatchmakingQueue.createForTests(makeDeps({ now: () => clock.t }));
			enqueue(queue, "t1", "user-1");
			enqueue(queue, "t2", "user-2");

			queue.tick();

			const s1 = queue.poll("t1");
			const s2 = queue.poll("t2");
			expect(s1).toMatchObject({ state: "matched", opponentType: "human", rated: true });
			expect(s2).toMatchObject({ state: "matched", opponentType: "human", rated: true });
			// both land in the SAME room password (the exact join string)
			expect((s1 as { roomPassword: string }).roomPassword).toBe(
				(s2 as { roomPassword: string }).roomPassword,
			);
		});
	});

	describe("cancel", () => {
		it("removes the entry and frees the user", () => {
			const queue = MatchmakingQueue.createForTests(makeDeps());
			enqueue(queue, "t1", "user-1");

			expect(queue.cancel("t1")).toBe(true);
			expect(queue.get("t1")).toBeUndefined();
			// user can enqueue again with a new ticket
			expect(() => enqueue(queue, "t2", "user-1")).not.toThrow();
		});

		it("returns false when cancelling an unknown ticket", () => {
			const queue = MatchmakingQueue.createForTests(makeDeps());
			expect(queue.cancel("nope")).toBe(false);
		});
	});

	describe("tick — pairing", () => {
		it("pairs two searching entries of the same format into one ranked room", () => {
			const createRankedRoom = jest.fn().mockReturnValue({ roomPassword: "to,mm-r1#pw1" });
			const queue = MatchmakingQueue.createForTests(makeDeps({ createRankedRoom }));
			enqueue(queue, "t1", "user-1");
			enqueue(queue, "t2", "user-2");

			queue.tick();

			expect(createRankedRoom).toHaveBeenCalledTimes(1);
			const e1 = queue.get("t1");
			const e2 = queue.get("t2");
			expect(e1?.state).toBe("matched");
			expect(e2?.state).toBe("matched");
			expect(e1?.roomPassword).toBe("to,mm-r1#pw1");
			expect(e2?.roomPassword).toBe("to,mm-r1#pw1");
			expect(e1?.rated).toBe(true);
			expect(e2?.rated).toBe(true);
			expect(e1?.opponentType).toBe("human");
		});

		it("does not pair an already matched entry again", () => {
			const createRankedRoom = jest.fn().mockReturnValue({ roomPassword: "to,mm-r1#pw1" });
			const queue = MatchmakingQueue.createForTests(makeDeps({ createRankedRoom }));
			enqueue(queue, "t1", "user-1");
			enqueue(queue, "t2", "user-2");

			queue.tick();
			queue.tick();

			expect(createRankedRoom).toHaveBeenCalledTimes(1);
		});

		it("leaves a lone searching entry unpaired", () => {
			const createRankedRoom = jest.fn();
			const queue = MatchmakingQueue.createForTests(makeDeps({ createRankedRoom }));
			enqueue(queue, "t1", "user-1");

			queue.tick();

			expect(createRankedRoom).not.toHaveBeenCalled();
			expect(queue.get("t1")?.state).toBe("searching");
		});
	});

	describe("tick — bot fallback", () => {
		it("matches a lone entry to a bot after the fallback window", () => {
			const clock = { t: 0 };
			const createBotRoom = jest
				.fn()
				.mockReturnValue({ roomPassword: "to,mm-b1#pw1", roomId: 4242 });
			const spawnBot = jest.fn();
			const queue = MatchmakingQueue.createForTests(
				makeDeps({ now: () => clock.t, createBotRoom, spawnBot }),
			);
			enqueue(queue, "t1", "user-1");

			// Keep polling within the TTL window, as a real client does, so the
			// entry survives to the bot-fallback threshold instead of being swept.
			clock.t = QUEUE_TTL_MS - 1;
			queue.poll("t1");
			clock.t = BOT_FALLBACK_MS + 1;
			queue.tick();

			const e1 = queue.get("t1");
			expect(e1?.state).toBe("matched");
			expect(e1?.opponentType).toBe("bot");
			expect(e1?.rated).toBe(false);
			expect(e1?.roomPassword).toBe("to,mm-b1#pw1");
			expect(spawnBot).toHaveBeenCalledWith(4242, SUPPORTED_FORMAT);
		});

		it("does not trigger bot fallback before the window elapses", () => {
			const clock = { t: 0 };
			const createBotRoom = jest.fn();
			const queue = MatchmakingQueue.createForTests(
				makeDeps({ now: () => clock.t, createBotRoom }),
			);
			enqueue(queue, "t1", "user-1");

			clock.t = QUEUE_TTL_MS - 1;
			queue.poll("t1");
			clock.t = BOT_FALLBACK_MS - 1;
			queue.tick();

			expect(createBotRoom).not.toHaveBeenCalled();
			expect(queue.get("t1")?.state).toBe("searching");
		});

		it("prefers pairing two humans over a bot even past the fallback window", () => {
			const clock = { t: 0 };
			const createRankedRoom = jest.fn().mockReturnValue({ roomPassword: "to,mm-r1#pw1" });
			const createBotRoom = jest.fn();
			const queue = MatchmakingQueue.createForTests(
				makeDeps({ now: () => clock.t, createRankedRoom, createBotRoom }),
			);
			enqueue(queue, "t1", "user-1");
			enqueue(queue, "t2", "user-2");

			clock.t = QUEUE_TTL_MS - 1;
			queue.poll("t1");
			queue.poll("t2");
			clock.t = BOT_FALLBACK_MS + 1;
			queue.tick();

			expect(createRankedRoom).toHaveBeenCalledTimes(1);
			expect(createBotRoom).not.toHaveBeenCalled();
		});

		it("keeps the entry searching when the bot spawner is unavailable", () => {
			const clock = { t: 0 };
			const createBotRoom = jest.fn();
			const queue = MatchmakingQueue.createForTests(
				makeDeps({
					now: () => clock.t,
					createBotRoom,
					botAvailable: () => false,
				}),
			);
			enqueue(queue, "t1", "user-1");

			clock.t = QUEUE_TTL_MS - 1;
			queue.poll("t1");
			clock.t = BOT_FALLBACK_MS + 1;
			queue.tick();

			expect(createBotRoom).not.toHaveBeenCalled();
			// graceful: entry keeps waiting rather than crashing
			expect(queue.get("t1")?.state).toBe("searching");
		});
	});

	describe("tick — room-creation port failures", () => {
		it("does not bubble a throwing createRankedRoom out of the sweep", () => {
			const createRankedRoom = jest.fn(() => {
				throw new Error("room boom");
			});
			const onRoomCreationError = jest.fn();
			const queue = MatchmakingQueue.createForTests(
				makeDeps({ createRankedRoom, onRoomCreationError }),
			);
			enqueue(queue, "t1", "user-1");
			enqueue(queue, "t2", "user-2");

			// The opportunistic enqueue tick already hit the throwing port; an explicit
			// tick must also stay contained rather than propagating a 500 to the caller.
			expect(() => queue.tick()).not.toThrow();
			expect(onRoomCreationError).toHaveBeenCalled();
			// The failed pair is left searching for a later retry, not corrupted.
			expect(queue.get("t1")?.state).toBe("searching");
			expect(queue.get("t2")?.state).toBe("searching");
		});

		it("continues the sweep for other pairs when one createRankedRoom throws", () => {
			// The first pair's room creation throws; the second pair must still match.
			let call = 0;
			const createRankedRoom = jest.fn(() => {
				call += 1;
				if (call === 1) throw new Error("first pair boom");
				return { roomPassword: `to,mm-r${call}#pw${call}` };
			});
			const queue = MatchmakingQueue.createForTests(
				makeDeps({ createRankedRoom, onRoomCreationError: jest.fn() }),
			);
			// Four same-format searching entries → two pairs in a single sweep. The
			// opportunistic enqueue ticks fire the throwing port on the first pair each
			// time (they stay searching); a final explicit sweep pairs a surviving pair.
			enqueue(queue, "t1", "user-1");
			enqueue(queue, "t2", "user-2");
			enqueue(queue, "t3", "user-3");
			enqueue(queue, "t4", "user-4");
			queue.tick();

			// The throwing port kept firing but never aborted a sweep; once it returns a
			// room (any call after the first) a pair matches — so at least two entries
			// end matched while the sweep never threw.
			const matched = ["t1", "t2", "t3", "t4"]
				.map((t) => queue.get(t)?.state)
				.filter((s) => s === "matched").length;
			expect(matched).toBeGreaterThanOrEqual(2);
			expect(createRankedRoom.mock.calls.length).toBeGreaterThanOrEqual(2);
		});

		it("does not bubble a throwing createBotRoom out of the sweep", () => {
			const clock = { t: 0 };
			const createBotRoom = jest.fn(() => {
				throw new Error("bot room boom");
			});
			const onRoomCreationError = jest.fn();
			const spawnBot = jest.fn();
			const queue = MatchmakingQueue.createForTests(
				makeDeps({ now: () => clock.t, createBotRoom, spawnBot, onRoomCreationError }),
			);
			enqueue(queue, "t1", "user-1");

			clock.t = QUEUE_TTL_MS - 1;
			queue.poll("t1");
			clock.t = BOT_FALLBACK_MS + 1;

			expect(() => queue.tick()).not.toThrow();
			expect(onRoomCreationError).toHaveBeenCalled();
			expect(spawnBot).not.toHaveBeenCalled();
			// Entry left searching (retried next tick / TTL-dropped), not corrupted.
			expect(queue.get("t1")?.state).toBe("searching");
		});

		it("throwing createBotRoom for one entry does not stop the others (lone-entry retries survive)", () => {
			// A single lone entry hits the throwing bot port past the fallback window;
			// the sweep neither throws nor corrupts it, and the entry remains eligible
			// for a later retry once the port recovers.
			const clock = { t: 0 };
			let call = 0;
			const createBotRoom = jest.fn(() => {
				call += 1;
				if (call === 1) throw new Error("first bot boom");
				return { roomPassword: `to,mm-b${call}#pw${call}`, roomId: 5000 + call };
			});
			const spawnBot = jest.fn();
			const queue = MatchmakingQueue.createForTests(
				makeDeps({ now: () => clock.t, createBotRoom, spawnBot, onRoomCreationError: jest.fn() }),
			);
			enqueue(queue, "t1", "user-1"); // lone → bot-fallback candidate

			clock.t = QUEUE_TTL_MS - 1;
			queue.poll("t1");
			clock.t = BOT_FALLBACK_MS + 1;

			// First tick: bot port throws, entry stays searching, no crash.
			expect(() => queue.tick()).not.toThrow();
			expect(queue.get("t1")?.state).toBe("searching");

			// Second tick: port recovers, entry now matches to a bot.
			expect(() => queue.tick()).not.toThrow();
			expect(queue.get("t1")?.state).toBe("matched");
			expect(spawnBot).toHaveBeenCalledWith(5000 + call, SUPPORTED_FORMAT);
		});
	});

	describe("tick — TTL expiry", () => {
		it("drops a searching entry that missed the poll window", () => {
			const clock = { t: 0 };
			const queue = MatchmakingQueue.createForTests(makeDeps({ now: () => clock.t }));
			enqueue(queue, "t1", "user-1");

			clock.t = QUEUE_TTL_MS + 1;
			queue.tick();

			expect(queue.get("t1")).toBeUndefined();
			// user freed after drop
			expect(() => enqueue(queue, "t2", "user-1")).not.toThrow();
		});

		it("does not drop an entry that polled within the window", () => {
			const clock = { t: 0 };
			const queue = MatchmakingQueue.createForTests(makeDeps({ now: () => clock.t }));
			enqueue(queue, "t1", "user-1");

			clock.t = QUEUE_TTL_MS - 1;
			queue.poll("t1"); // refresh
			clock.t = QUEUE_TTL_MS + 1; // now within TTL of the last poll
			queue.tick();

			expect(queue.get("t1")).toBeDefined();
		});

		it("does not drop a matched entry on TTL (it already found a game)", () => {
			const clock = { t: 0 };
			const queue = MatchmakingQueue.createForTests(makeDeps({ now: () => clock.t }));
			enqueue(queue, "t1", "user-1");
			enqueue(queue, "t2", "user-2");
			queue.tick(); // pairs both

			clock.t = QUEUE_TTL_MS + 1;
			queue.tick();

			expect(queue.get("t1")).toBeDefined();
			expect(queue.get("t2")).toBeDefined();
		});
	});

	describe("tick — matched grace-window cleanup", () => {
		it("frees the user after MATCHED_GRACE_MS so the SAME userId can enqueue again", () => {
			const clock = { t: 0 };
			const queue = MatchmakingQueue.createForTests(makeDeps({ now: () => clock.t }));
			enqueue(queue, "t1", "user-1");
			enqueue(queue, "t2", "user-2");
			queue.tick(); // pairs both → matched

			// Grace window elapses, then a tick sweeps the matched entries.
			clock.t = MATCHED_GRACE_MS + 1;
			queue.tick();

			// Entries and their user mappings are gone.
			expect(queue.get("t1")).toBeUndefined();
			expect(queue.get("t2")).toBeUndefined();
			// The same users can enqueue again with fresh tickets (Quick Match works again).
			expect(() => enqueue(queue, "t3", "user-1")).not.toThrow();
			expect(() => enqueue(queue, "t4", "user-2")).not.toThrow();
		});

		it("keeps returning the matched result while re-polling within the grace window (idempotent)", () => {
			const clock = { t: 0 };
			const queue = MatchmakingQueue.createForTests(makeDeps({ now: () => clock.t }));
			enqueue(queue, "t1", "user-1");
			enqueue(queue, "t2", "user-2");
			queue.tick(); // pairs both → matched

			// Re-poll several times within the grace window: each still gets `matched`.
			clock.t = 1_000;
			expect(queue.poll("t1")).toMatchObject({ state: "matched", opponentType: "human" });
			clock.t = MATCHED_GRACE_MS - 1;
			expect(queue.poll("t1")).toMatchObject({ state: "matched", opponentType: "human" });
			// Still present because we did not delete on first poll.
			expect(queue.get("t1")?.state).toBe("matched");
		});

		it("does NOT drop a matched entry before the grace window elapses", () => {
			const clock = { t: 0 };
			const queue = MatchmakingQueue.createForTests(makeDeps({ now: () => clock.t }));
			enqueue(queue, "t1", "user-1");
			enqueue(queue, "t2", "user-2");
			queue.tick(); // pairs both → matched

			clock.t = MATCHED_GRACE_MS - 1;
			queue.tick();

			expect(queue.get("t1")).toBeDefined();
			expect(queue.get("t2")).toBeDefined();
			// User still held → cannot enqueue again yet.
			expect(() => enqueue(queue, "t3", "user-1")).toThrow();
		});

		it("keeps a matched entry alive while it is still being polled (grace measured from last poll)", () => {
			// W3: a slow-joining client that keeps polling its matched result must NOT
			// be dropped mid-flow, even long after matchedAt + MATCHED_GRACE_MS. The
			// grace is measured from lastPollAt, which poll() refreshes on every call.
			const clock = { t: 0 };
			const queue = MatchmakingQueue.createForTests(makeDeps({ now: () => clock.t }));
			enqueue(queue, "t1", "user-1");
			enqueue(queue, "t2", "user-2");
			queue.tick(); // pairs both → matched at t=0

			// Well past matchedAt + grace, but the client kept polling.
			clock.t = MATCHED_GRACE_MS * 3;
			expect(queue.poll("t1")).toMatchObject({ state: "matched" });
			queue.tick();

			// Still present: last poll was at clock.t, so grace has not elapsed since.
			expect(queue.get("t1")?.state).toBe("matched");
		});

		it("expires a matched entry MATCHED_GRACE_MS after it STOPS polling (joined)", () => {
			// W3: once the client stops polling (it joined the room), the entry is
			// reaped a grace window after its LAST contact — not after matchedAt.
			const clock = { t: 0 };
			const queue = MatchmakingQueue.createForTests(makeDeps({ now: () => clock.t }));
			enqueue(queue, "t1", "user-1");
			enqueue(queue, "t2", "user-2");
			queue.tick(); // pairs both → matched at t=0

			// Client polls once, later, then stops (joined).
			clock.t = 10_000;
			expect(queue.poll("t1")).toMatchObject({ state: "matched" });

			// Grace elapses from the LAST poll, then a tick reaps it.
			clock.t = 10_000 + MATCHED_GRACE_MS + 1;
			queue.tick();

			expect(queue.get("t1")).toBeUndefined();
			expect(() => enqueue(queue, "t3", "user-1")).not.toThrow();
		});

		it("frees a bot-matched user after the grace window too", () => {
			const clock = { t: 0 };
			const queue = MatchmakingQueue.createForTests(makeDeps({ now: () => clock.t }));
			enqueue(queue, "t1", "user-1");

			clock.t = QUEUE_TTL_MS - 1;
			queue.poll("t1");
			clock.t = BOT_FALLBACK_MS + 1;
			queue.tick(); // matched to a bot
			expect(queue.get("t1")?.state).toBe("matched");

			clock.t = BOT_FALLBACK_MS + 1 + MATCHED_GRACE_MS + 1;
			queue.tick();

			expect(queue.get("t1")).toBeUndefined();
			expect(() => enqueue(queue, "t2", "user-1")).not.toThrow();
		});
	});

	describe("singleton", () => {
		it("start() installs an unref'd interval and stop() clears it", () => {
			const unref = jest.fn().mockReturnThis();
			const setIntervalSpy = jest
				.spyOn(global, "setInterval")
				.mockReturnValue({ unref } as unknown as NodeJS.Timeout);
			const clearIntervalSpy = jest
				.spyOn(global, "clearInterval")
				.mockImplementation(() => undefined);

			MatchmakingQueue.init(makeDeps());
			MatchmakingQueue.getInstance().start();
			expect(unref).toHaveBeenCalled();

			MatchmakingQueue.getInstance().stop();
			expect(clearIntervalSpy).toHaveBeenCalled();

			setIntervalSpy.mockRestore();
			clearIntervalSpy.mockRestore();
		});

		it("getInstance throws before init", () => {
			expect(() => MatchmakingQueue.getInstance()).toThrow();
		});
	});
});
