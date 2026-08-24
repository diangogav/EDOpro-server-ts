import { LoggerMock } from "@test-support/mocks/logger/LoggerMock";

import { DomainEventSubscriber, EventBus } from "./EventBus";

describe("EventBus", () => {
	let logger: LoggerMock;
	let bus: EventBus;

	beforeEach(() => {
		logger = new LoggerMock();
		bus = new EventBus(logger);
	});

	it("resolves publish() with no subscribers registered for the event", async () => {
		await expect(bus.publish("UNKNOWN_EVENT", { foo: "bar" })).resolves.toBeUndefined();
	});

	it("invokes every subscriber and still resolves publish() when one rejects", async () => {
		const succeeding: DomainEventSubscriber<{ value: number }> = {
			handle: jest.fn().mockResolvedValue(undefined),
		};
		const failing: DomainEventSubscriber<{ value: number }> = {
			handle: jest.fn().mockRejectedValue(new Error("boom")),
		};

		bus.subscribe("GAME_OVER", failing);
		bus.subscribe("GAME_OVER", succeeding);

		await expect(bus.publish("GAME_OVER", { value: 1 })).resolves.toBeUndefined();

		expect(succeeding.handle).toHaveBeenCalledWith({ value: 1 });
		expect(failing.handle).toHaveBeenCalledWith({ value: 1 });
	});

	it("awaits until every subscriber has settled before resolving", async () => {
		const order: string[] = [];
		const slow: DomainEventSubscriber<undefined> = {
			handle: jest.fn().mockImplementation(async () => {
				await new Promise((resolve) => setTimeout(resolve, 20));
				order.push("slow-done");
			}),
		};
		const fast: DomainEventSubscriber<undefined> = {
			handle: jest.fn().mockImplementation(async () => {
				order.push("fast-done");
			}),
		};

		bus.subscribe("GAME_OVER", slow);
		bus.subscribe("GAME_OVER", fast);

		await bus.publish("GAME_OVER", undefined);

		expect(order).toEqual(["fast-done", "slow-done"]);
	});

	it("logs a rejecting subscriber with the event name and never throws", async () => {
		const errorSpy = jest.spyOn(logger, "error");
		const failing: DomainEventSubscriber<undefined> = {
			handle: jest.fn().mockRejectedValue(new Error("boom")),
		};

		bus.subscribe("GAME_OVER", failing);

		await expect(bus.publish("GAME_OVER", undefined)).resolves.toBeUndefined();

		expect(errorSpy).toHaveBeenCalledTimes(1);
		const [error, context] = errorSpy.mock.calls[0];
		expect(String(error)).toContain("boom");
		expect(context).toMatchObject({ event: "GAME_OVER" });
	});

	it("logs a synchronously throwing subscriber without blocking the remaining subscribers", async () => {
		const errorSpy = jest.spyOn(logger, "error");
		const throwing: DomainEventSubscriber<undefined> = {
			handle: () => {
				throw new Error("sync-boom");
			},
		};
		const succeeding: DomainEventSubscriber<undefined> = { handle: jest.fn() };

		bus.subscribe("GAME_OVER", throwing);
		bus.subscribe("GAME_OVER", succeeding);

		await expect(bus.publish("GAME_OVER", undefined)).resolves.toBeUndefined();

		expect(succeeding.handle).toHaveBeenCalledTimes(1);
		expect(errorSpy).toHaveBeenCalledTimes(1);
	});
});
