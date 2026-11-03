import { mock } from "jest-mock-extended";
import { LoggerMock } from "@test-support/mocks/logger/LoggerMock";
import { YGOProRoom } from "@ygopro/room/domain/YGOProRoom";
import { OCGCore } from "@ygopro/ocgcore-worker/ocgcore";
import { DuelResourceWatch } from "@shared/metrics/domain/DuelResourceMonitor";

jest.mock("@ygopro/ocgcore-worker/ocgcore-worker", () => ({}));
jest.mock("@ygopro/ygopro", () => ({}));
jest.mock("@ygopro/room/domain/DuelRecord", () => ({}));

type WorkerStub = {
	resourceStats: jest.Mock;
	dispose: jest.Mock;
	finalize: jest.Mock;
};

type CoreInternals = {
	ocgcore: WorkerStub | null;
	resourceWatch: DuelResourceWatch | null;
	disposeWithTimeout(kill: boolean): void;
};

function makeCore(worker: WorkerStub): { core: CoreInternals; end: jest.Mock } {
	const room = mock<YGOProRoom>();
	Object.assign(room, { hostInfo: { time_limit: 0 } });
	const core = new OCGCore(room, new LoggerMock()) as unknown as CoreInternals;
	const end = jest.fn();
	core.ocgcore = worker;
	core.resourceWatch = { end };

	return { core, end };
}

function makeWorker(overrides?: Partial<WorkerStub>): WorkerStub {
	return {
		resourceStats: jest.fn().mockResolvedValue({ cpuSeconds: 1.25, memoryBytes: 2048 }),
		dispose: jest.fn().mockResolvedValue(undefined),
		finalize: jest.fn().mockResolvedValue(undefined),
		...overrides,
	};
}

async function flushPromises(): Promise<void> {
	for (let i = 0; i < 10; i += 1) {
		await Promise.resolve();
	}
}

describe("OCGCore resource measurement", () => {
	it("ends the measurement with the worker stats before disposing the worker", async () => {
		const worker = makeWorker();
		const { core, end } = makeCore(worker);

		core.disposeWithTimeout(false);
		await flushPromises();

		expect(end).toHaveBeenCalledWith({ cpuSeconds: 1.25, memoryBytes: 2048 });
		expect(end.mock.invocationCallOrder[0]).toBeLessThan(
			worker.dispose.mock.invocationCallOrder[0],
		);
	});

	it("ends the measurement without stats and still disposes when the worker cannot report", async () => {
		const worker = makeWorker({
			resourceStats: jest.fn().mockRejectedValue(new Error("worker gone")),
		});
		const { core, end } = makeCore(worker);

		core.disposeWithTimeout(false);
		await flushPromises();

		expect(end).toHaveBeenCalledWith(null);
		expect(worker.dispose).toHaveBeenCalled();
	});

	it("disposes the worker without asking for stats when nothing is measured", async () => {
		const worker = makeWorker();
		const { core } = makeCore(worker);
		core.resourceWatch = null;

		core.disposeWithTimeout(false);
		await flushPromises();

		expect(worker.resourceStats).not.toHaveBeenCalled();
		expect(worker.dispose).toHaveBeenCalled();
	});

	it("still disposes the worker when recording the stats throws", async () => {
		const worker = makeWorker();
		const { core, end } = makeCore(worker);
		end.mockImplementation(() => {
			throw new Error("Value is not a valid number");
		});

		core.disposeWithTimeout(false);
		await flushPromises();

		expect(worker.dispose).toHaveBeenCalled();
	});

	it("still finalizes a killed worker when recording the stats throws", () => {
		const worker = makeWorker();
		const { core, end } = makeCore(worker);
		end.mockImplementation(() => {
			throw new Error("Value is not a valid number");
		});

		core.disposeWithTimeout(true);

		expect(worker.finalize).toHaveBeenCalled();
	});

	it("ends the measurement without asking a killed worker for stats", () => {
		const worker = makeWorker();
		const { core, end } = makeCore(worker);

		core.disposeWithTimeout(true);

		expect(worker.resourceStats).not.toHaveBeenCalled();
		expect(end).toHaveBeenCalledWith(null);
		expect(worker.finalize).toHaveBeenCalled();
	});
});
