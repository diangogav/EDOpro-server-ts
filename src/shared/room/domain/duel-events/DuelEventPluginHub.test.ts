import { LoggerMock } from "@test-support/mocks/logger/LoggerMock";

import { YgoRoom } from "../YgoRoom";
import { DuelEventDispatcher } from "./DuelEventDispatcher";
import { DuelEventPluginHub } from "./DuelEventPluginHub";
import { DamageDealtEvent } from "./DuelEvents";

const room = { id: 7 } as unknown as YgoRoom;
const damage = (amount: number): DamageDealtEvent => ({ roomId: 7, team: 0, amount, turn: 1 });

// Queue drains run on microtasks (and async handlers add real ticks); flush
// both before asserting.
const flush = () => new Promise((resolve) => setImmediate(resolve));

const busyWaitMs = (ms: number) => {
	const end = Date.now() + ms;
	while (Date.now() < end) {
		/* burn */
	}
};

describe("DuelEventPluginHub", () => {
	let hub: DuelEventPluginHub;
	let dispatcher: DuelEventDispatcher;
	let logger: LoggerMock;
	let errorSpy: jest.SpyInstance;
	let warnSpy: jest.SpyInstance;

	const makeHub = (options?: ConstructorParameters<typeof DuelEventPluginHub>[0]) => {
		hub = new DuelEventPluginHub(options);
		hub.initialize(logger);
	};

	beforeEach(() => {
		logger = new LoggerMock();
		errorSpy = jest.spyOn(logger, "error");
		warnSpy = jest.spyOn(logger, "warn");
		dispatcher = new DuelEventDispatcher();
	});

	it("delivers dispatched events to a registered plugin handler, in order", async () => {
		makeHub();
		const seen: number[] = [];
		hub.register("stats", "duel.damage", async (event) => {
			await Promise.resolve();
			seen.push((event as DamageDealtEvent).amount);
		});
		hub.attach(dispatcher);

		dispatcher.dispatch("duel.damage", damage(100), room);
		dispatcher.dispatch("duel.damage", damage(200), room);
		dispatcher.dispatch("duel.damage", damage(300), room);
		await flush();

		expect(seen).toEqual([100, 200, 300]);
	});

	it("delivers nothing for kinds no plugin registered", () => {
		makeHub();
		const subscribeSpy = jest.spyOn(dispatcher, "subscribe");

		hub.attach(dispatcher);

		expect(subscribeSpy).not.toHaveBeenCalled();
	});

	it("does not deliver synchronously inside dispatch", () => {
		makeHub();
		let delivered = false;
		hub.register("stats", "duel.damage", () => {
			delivered = true;
		});
		hub.attach(dispatcher);

		dispatcher.dispatch("duel.damage", damage(100), room);

		expect(delivered).toBe(false);
	});

	it("logs a plugin handler's error and keeps delivering", async () => {
		makeHub();
		const seen: number[] = [];
		hub.register("stats", "duel.damage", (event) => {
			if ((event as DamageDealtEvent).amount === 100) {
				throw new Error("plugin exploded");
			}
			seen.push((event as DamageDealtEvent).amount);
		});
		hub.attach(dispatcher);

		dispatcher.dispatch("duel.damage", damage(100), room);
		dispatcher.dispatch("duel.damage", damage(200), room);
		await flush();

		expect(seen).toEqual([200]);
		expect(errorSpy).toHaveBeenCalled();
	});

	it("disconnects a plugin from the room when its queue overflows, with a loud error", async () => {
		makeHub({ maxQueue: 2 });
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const seen: number[] = [];
		hub.register("slow", "duel.damage", async (event) => {
			await gate;
			seen.push((event as DamageDealtEvent).amount);
		});
		hub.attach(dispatcher);

		// First event enters the drain and blocks; the queue then fills to the
		// cap and the next enqueue overflows.
		dispatcher.dispatch("duel.damage", damage(1), room);
		await Promise.resolve();
		dispatcher.dispatch("duel.damage", damage(2), room);
		dispatcher.dispatch("duel.damage", damage(3), room);
		dispatcher.dispatch("duel.damage", damage(4), room);
		await flush();

		expect(errorSpy).toHaveBeenCalledWith(
			expect.stringContaining('"slow"'),
			expect.objectContaining({ roomId: 7, reason: "queue-overflow" }),
		);

		release();
		await flush();
		dispatcher.dispatch("duel.damage", damage(5), room);
		await flush();

		// Only the event that was already draining survives; nothing after the
		// disconnect is delivered.
		expect(seen).toEqual([1]);
	});

	it("warns on a handle over budget and disconnects a repeat offender", async () => {
		makeHub({ budgetMs: 5, maxViolations: 2 });
		const seen: number[] = [];
		hub.register("cpu-hog", "duel.damage", (event) => {
			seen.push((event as DamageDealtEvent).amount);
			busyWaitMs(8);
		});
		hub.attach(dispatcher);

		dispatcher.dispatch("duel.damage", damage(1), room);
		await flush();
		expect(warnSpy).toHaveBeenCalledTimes(1);

		dispatcher.dispatch("duel.damage", damage(2), room);
		await flush();
		expect(errorSpy).toHaveBeenCalledWith(
			expect.stringContaining('"cpu-hog"'),
			expect.objectContaining({ roomId: 7, reason: "budget-exceeded" }),
		);

		dispatcher.dispatch("duel.damage", damage(3), room);
		await flush();

		expect(seen).toEqual([1, 2]);
	});

	it("keeps a healthy plugin delivering after another plugin is disconnected", async () => {
		makeHub({ budgetMs: 5, maxViolations: 1 });
		const healthy: number[] = [];
		hub.register("cpu-hog", "duel.damage", () => busyWaitMs(8));
		hub.register("healthy", "duel.damage", (event) => {
			healthy.push((event as DamageDealtEvent).amount);
		});
		hub.attach(dispatcher);

		dispatcher.dispatch("duel.damage", damage(1), room);
		await flush();
		dispatcher.dispatch("duel.damage", damage(2), room);
		await flush();

		expect(healthy).toEqual([1, 2]);
	});

	it("attachments are independent: a disconnect in one room does not affect another", async () => {
		makeHub({ budgetMs: 5, maxViolations: 1 });
		const otherRoom = { id: 8 } as unknown as YgoRoom;
		const otherDispatcher = new DuelEventDispatcher();
		const seen: number[] = [];
		hub.register("plugin", "duel.damage", (event) => {
			busyWaitMs((event as DamageDealtEvent).amount === 1 ? 8 : 0);
			seen.push((event as DamageDealtEvent).amount);
		});
		hub.attach(dispatcher);
		hub.attach(otherDispatcher);

		// Disconnect in room 7 (over budget), then room 8 still delivers.
		dispatcher.dispatch("duel.damage", damage(1), room);
		await flush();
		dispatcher.dispatch("duel.damage", damage(2), room);
		otherDispatcher.dispatch("duel.damage", { roomId: 8, team: 0, amount: 3, turn: 1 }, otherRoom);
		await flush();

		expect(seen).toEqual([1, 3]);
	});

	it("getInstance returns a stable singleton and resetInstance clears it", () => {
		const first = DuelEventPluginHub.getInstance();
		expect(DuelEventPluginHub.getInstance()).toBe(first);

		DuelEventPluginHub.resetInstance();

		expect(DuelEventPluginHub.getInstance()).not.toBe(first);
	});
});
