import { BOT_FALLBACK_MS, QUEUE_TTL_MS, SUPPORTED_FORMAT } from "./QueueEntry";
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
			expect(spawnBot).toHaveBeenCalledWith(4242);
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
