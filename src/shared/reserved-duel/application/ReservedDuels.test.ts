import { LoggerMock } from "@test-support/mocks/logger/LoggerMock";

import { ReservationStore } from "../domain/ReservationStore";
import { ReservedDuelRepository } from "../domain/ReservedDuelRepository";
import { ReservedDuelServices } from "./ReservedDuels";

const makeRepository = (): jest.Mocked<ReservedDuelRepository> => ({
	open: jest.fn(),
	claimSeat: jest.fn(),
	markStarted: jest.fn().mockResolvedValue(undefined),
	recordAbandon: jest.fn().mockResolvedValue(true),
	recordResult: jest.fn(),
	exists: jest.fn().mockResolvedValue(false),
	closeLeftovers: jest.fn().mockResolvedValue(0),
});

const makeStore = (): jest.Mocked<ReservationStore> => ({
	claim: jest.fn(),
	release: jest.fn().mockResolvedValue(undefined),
});

const flush = () => new Promise((resolve) => setImmediate(resolve));

const makeServices = (repository = makeRepository(), store = makeStore()) =>
	new ReservedDuelServices({
		store,
		repository,
		instanceId: "slot-a",
		logger: new LoggerMock(),
		retryPolicy: { attempts: 3, baseDelayMs: 0 },
	});

describe("ReservedDuelServices", () => {
	it("retries a failed abandon write until it lands", async () => {
		const repository = makeRepository();
		repository.recordAbandon
			.mockRejectedValueOnce(new Error("db down"))
			.mockResolvedValueOnce(true);

		makeServices(repository).abandoned("Ab3dEf6hIj9kLm2n", { seat: 0, reason: "no_show" });
		// The zero backoff is still a timer turn, which setImmediate can outrun.
		await new Promise((resolve) => setTimeout(resolve, 20));

		expect(repository.recordAbandon).toHaveBeenCalledTimes(2);
		expect(repository.recordAbandon).toHaveBeenLastCalledWith("Ab3dEf6hIj9kLm2n", {
			seat: 0,
			reason: "no_show",
		});
	});

	it("closes only the leftovers of its own instance", async () => {
		const repository = makeRepository();
		repository.closeLeftovers.mockResolvedValue(2);

		expect(await makeServices(repository).closeLeftovers()).toBe(2);
		expect(repository.closeLeftovers).toHaveBeenCalledWith("slot-a");
	});

	it("releases the reservation key and records the start", async () => {
		const repository = makeRepository();
		const store = makeStore();
		const services = makeServices(repository, store);

		services.release("Ab3dEf6hIj9kLm2n");
		services.started("Ab3dEf6hIj9kLm2n", "match-1");
		await flush();

		expect(store.release).toHaveBeenCalledWith("Ab3dEf6hIj9kLm2n");
		expect(repository.markStarted).toHaveBeenCalledWith("Ab3dEf6hIj9kLm2n", "match-1");
	});
});
