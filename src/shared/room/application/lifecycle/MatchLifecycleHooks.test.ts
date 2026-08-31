import { Team } from "@shared/room/Team";
import { MatchContext, MatchLifecycleHook } from "@shared/room/domain/lifecycle/MatchLifecycleHook";
import { LoggerMock } from "@test-support/mocks/logger/LoggerMock";

import { MATCH_ENDING_HOOK_BUDGET_MS, MatchLifecycleHooks } from "./MatchLifecycleHooks";

function makeContext(): MatchContext {
	return {
		roomId: 1234,
		ranked: true,
		banListName: "TCG",
		season: 5,
		players: [
			{ id: "player-1", team: Team.PLAYER, name: "Diango", winner: false },
			{ id: "player-2", team: Team.OPPONENT, name: "Rival", winner: false },
		],
		announce: jest.fn(),
	};
}

function flushMicrotasks(): Promise<void> {
	return new Promise((resolve) => setImmediate(resolve));
}

describe("MatchLifecycleHooks", () => {
	let logger: LoggerMock;

	beforeEach(() => {
		logger = new LoggerMock();
		jest.spyOn(logger, "warn");
	});

	describe("runStarted", () => {
		it("is fire-and-forget: returns before a slow hook resolves", async () => {
			let resolved = false;
			const slowHook: MatchLifecycleHook = {
				name: "slow",
				onMatchStarted: () =>
					new Promise((resolve) =>
						setTimeout(() => {
							resolved = true;
							resolve();
						}, 50),
					),
			};
			const runner = new MatchLifecycleHooks(logger);
			runner.register(slowHook);

			const returnValue = runner.runStarted(makeContext());

			expect(returnValue).toBeUndefined();
			expect(resolved).toBe(false);
		});

		it("isolates one throwing hook from the others — every registered hook still runs", async () => {
			const calls: string[] = [];
			const brokenHook: MatchLifecycleHook = {
				name: "broken",
				onMatchStarted: async () => {
					calls.push("broken");
					throw new Error("boom");
				},
			};
			const healthyHook: MatchLifecycleHook = {
				name: "healthy",
				onMatchStarted: async () => {
					calls.push("healthy");
				},
			};
			const runner = new MatchLifecycleHooks(logger);
			runner.register(brokenHook);
			runner.register(healthyHook);

			runner.runStarted(makeContext());
			await flushMicrotasks();

			expect(calls).toEqual(["broken", "healthy"]);
			expect(logger.warn).toHaveBeenCalledWith(
				expect.stringContaining("broken"),
				expect.anything(),
			);
		});

		it("skips hooks that declare no onMatchStarted", async () => {
			const endOnly: MatchLifecycleHook = {
				name: "end-only",
				onMatchEnding: async () => undefined,
			};
			const runner = new MatchLifecycleHooks(logger);
			runner.register(endOnly);

			expect(() => runner.runStarted(makeContext())).not.toThrow();
			await flushMicrotasks();
		});
	});

	describe("runEnding", () => {
		it("awaits every registered hook when all finish within budget", async () => {
			const calls: string[] = [];
			const hookA: MatchLifecycleHook = {
				name: "a",
				onMatchEnding: async () => {
					calls.push("a");
				},
			};
			const hookB: MatchLifecycleHook = {
				name: "b",
				onMatchEnding: async () => {
					calls.push("b");
				},
			};
			const runner = new MatchLifecycleHooks(logger);
			runner.register(hookA);
			runner.register(hookB);

			await runner.runEnding(makeContext());

			expect(calls).toEqual(["a", "b"]);
		});

		it("isolates one throwing hook from the others", async () => {
			const calls: string[] = [];
			const brokenHook: MatchLifecycleHook = {
				name: "broken",
				onMatchEnding: async () => {
					calls.push("broken");
					throw new Error("boom");
				},
			};
			const healthyHook: MatchLifecycleHook = {
				name: "healthy",
				onMatchEnding: async () => {
					calls.push("healthy");
				},
			};
			const runner = new MatchLifecycleHooks(logger);
			runner.register(brokenHook);
			runner.register(healthyHook);

			await expect(runner.runEnding(makeContext())).resolves.toBeUndefined();

			expect(calls).toEqual(["broken", "healthy"]);
		});

		it("never blocks teardown past the total time budget, even if a hook is still pending", async () => {
			jest.useFakeTimers();
			try {
				let hookSettled = false;
				const slowHook: MatchLifecycleHook = {
					name: "slow",
					onMatchEnding: () =>
						new Promise((resolve) => {
							setTimeout(() => {
								hookSettled = true;
								resolve();
							}, MATCH_ENDING_HOOK_BUDGET_MS * 10);
						}),
				};
				const runner = new MatchLifecycleHooks(logger);
				runner.register(slowHook);

				const runEnding = runner.runEnding(makeContext());
				let settled = false;
				void runEnding.then(() => {
					settled = true;
				});

				await jest.advanceTimersByTimeAsync(MATCH_ENDING_HOOK_BUDGET_MS);

				expect(settled).toBe(true);
				expect(hookSettled).toBe(false);
				expect(logger.warn).toHaveBeenCalledWith(
					expect.stringContaining("budget"),
					expect.anything(),
				);
			} finally {
				jest.useRealTimers();
			}
		});

		it("resolves immediately when no hook declares onMatchEnding", async () => {
			const startOnly: MatchLifecycleHook = {
				name: "start-only",
				onMatchStarted: async () => undefined,
			};
			const runner = new MatchLifecycleHooks(logger);
			runner.register(startOnly);

			await expect(runner.runEnding(makeContext())).resolves.toBeUndefined();
		});
	});
});
