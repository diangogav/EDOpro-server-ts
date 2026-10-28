import { ReservedDuels } from "@shared/reserved-duel/application/ReservedDuels";
import { ReservedDuelRepository } from "@shared/reserved-duel/domain/ReservedDuelRepository";
import { LoggerMock } from "@test-support/mocks/logger/LoggerMock";

import { bootstrapReservedDuels } from "./bootstrapReservedDuels";

const makeRepository = (): jest.Mocked<ReservedDuelRepository> => ({
	open: jest.fn(),
	claimSeat: jest.fn(),
	markStarted: jest.fn(),
	recordAbandon: jest.fn(),
	recordResult: jest.fn(),
	exists: jest.fn().mockResolvedValue(false),
	closeLeftovers: jest.fn().mockResolvedValue(1),
});

const store = { claim: jest.fn(), release: jest.fn() };

describe("bootstrapReservedDuels", () => {
	afterEach(() => ReservedDuels.reset());

	it("sweeps the rows left open by the configured instance and turns reserved duels on", async () => {
		const repository = makeRepository();

		const services = await bootstrapReservedDuels(
			{ enabled: true, instanceId: "slot-a", production: true },
			new LoggerMock(),
			{ store, repository },
		);

		expect(repository.closeLeftovers).toHaveBeenCalledWith("slot-a");
		expect(ReservedDuels.current()).toBe(services);
	});

	it("still turns reserved duels on when the sweep fails", async () => {
		const repository = makeRepository();
		repository.closeLeftovers.mockRejectedValue(new Error("db down"));

		await bootstrapReservedDuels(
			{ enabled: true, instanceId: "slot-a", production: true },
			new LoggerMock(),
			{
				store,
				repository,
			},
		);

		expect(ReservedDuels.current()).not.toBeNull();
	});

	it("refuses to boot in production without an explicit instance id", async () => {
		const repository = makeRepository();

		await expect(
			bootstrapReservedDuels({ enabled: true, production: true }, new LoggerMock(), {
				store,
				repository,
			}),
		).rejects.toThrow("SERVER_INSTANCE_ID is required");
		expect(repository.closeLeftovers).not.toHaveBeenCalled();
		expect(ReservedDuels.current()).toBeNull();
	});

	it("falls back to the default instance id outside production", async () => {
		const repository = makeRepository();

		await bootstrapReservedDuels({ enabled: true, production: false }, new LoggerMock(), {
			store,
			repository,
		});

		expect(repository.closeLeftovers).toHaveBeenCalledWith("default");
	});

	it("needs no instance id in production while reserved duels are off", async () => {
		const services = await bootstrapReservedDuels(
			{ enabled: false, production: true },
			new LoggerMock(),
			{ store, repository: makeRepository() },
		);

		expect(services).toBeNull();
	});

	it("stays off without its stores", async () => {
		const repository = makeRepository();

		const services = await bootstrapReservedDuels(
			{ enabled: false, instanceId: "slot-a", production: true },
			new LoggerMock(),
			{ store, repository },
		);

		expect(services).toBeNull();
		expect(repository.closeLeftovers).not.toHaveBeenCalled();
		expect(ReservedDuels.current()).toBeNull();
	});
});
