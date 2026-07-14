// Tests for the ban-list reloader core cycle. reloadBanListsOnce is exercised
// directly with injected ports so no filesystem, timers, or singletons are touched.

jest.mock("src/config", () => ({
	config: { resources: { dir: "/fake/resources" } },
}));
jest.mock("./bootstrapBanListLoaders", () => ({
	loadEdoproBanLists: jest.fn(),
	loadYgoproBanLists: jest.fn(),
}));

import { EdoproBanList } from "@edopro/ban-list/domain/BanList";
import { Logger } from "@shared/logger/domain/Logger";
import { YGOProBanList } from "@ygopro/ban-list/domain/YGOProBanList";

import {
	type BanListReloaderPorts,
	getBanListReloadedAt,
	reloadBanListsOnce,
} from "./bootstrapBanListReloader";

function fakeLogger(): Logger {
	return {
		info: jest.fn(),
		error: jest.fn(),
		warn: jest.fn(),
		debug: jest.fn(),
	} as unknown as Logger;
}

function makeEdoList(name: string): EdoproBanList {
	const list = new EdoproBanList();
	list.setName(name);
	return list;
}

function makeYgoList(name: string): YGOProBanList {
	const list = new YGOProBanList();
	list.setName(name);
	return list;
}

interface Recorder {
	calls: string[];
	edoproReplaced: EdoproBanList[] | null;
	ygoproReplaced: YGOProBanList[] | null;
}

function makePorts(overrides: Partial<BanListReloaderPorts> & { recorder?: Recorder } = {}): {
	ports: BanListReloaderPorts;
	recorder: Recorder;
} {
	const recorder: Recorder = overrides.recorder ?? {
		calls: [],
		edoproReplaced: null,
		ygoproReplaced: null,
	};
	const ports: BanListReloaderPorts = {
		fingerprint: overrides.fingerprint ?? jest.fn().mockResolvedValue("fp-new"),
		loadEdopro:
			overrides.loadEdopro ??
			jest.fn().mockImplementation(async () => {
				recorder.calls.push("loadEdopro");
				return [makeEdoList("Edo A")];
			}),
		loadYgopro:
			overrides.loadYgopro ??
			jest.fn().mockImplementation(async () => {
				recorder.calls.push("loadYgopro");
				return [makeYgoList("Ygo A")];
			}),
		replaceEdopro:
			overrides.replaceEdopro ??
			((next) => {
				recorder.calls.push("replaceEdopro");
				recorder.edoproReplaced = next;
			}),
		replaceYgopro:
			overrides.replaceYgopro ??
			((next) => {
				recorder.calls.push("replaceYgopro");
				recorder.ygoproReplaced = next;
			}),
		now: overrides.now ?? (() => "2026-07-14T12:00:00.000Z"),
	};
	return { ports, recorder };
}

describe("reloadBanListsOnce — change detection", () => {
	it("skips the rebuild when the fingerprint is unchanged", async () => {
		const { ports, recorder } = makePorts({
			fingerprint: jest.fn().mockResolvedValue("fp-same"),
		});

		const outcome = await reloadBanListsOnce(ports, fakeLogger(), "fp-same");

		expect(outcome.changed).toBe(false);
		expect(outcome.fingerprint).toBe("fp-same");
		expect(recorder.calls).toEqual([]); // no load, no replace
	});

	it("rebuilds and swaps when the fingerprint changed", async () => {
		const { ports, recorder } = makePorts();

		const outcome = await reloadBanListsOnce(ports, fakeLogger(), "fp-old");

		expect(outcome.changed).toBe(true);
		expect(outcome.fingerprint).toBe("fp-new");
		expect(recorder.edoproReplaced).toHaveLength(1);
		expect(recorder.ygoproReplaced).toHaveLength(1);
	});
});

describe("reloadBanListsOnce — atomic swap ordering", () => {
	it("replaces edopro before ygopro", async () => {
		const { ports, recorder } = makePorts();

		await reloadBanListsOnce(ports, fakeLogger(), "fp-old");

		expect(recorder.calls).toEqual(["loadEdopro", "loadYgopro", "replaceEdopro", "replaceYgopro"]);
		expect(recorder.calls.indexOf("replaceEdopro")).toBeLessThan(
			recorder.calls.indexOf("replaceYgopro"),
		);
	});
});

describe("reloadBanListsOnce — empty-result safety", () => {
	it("keeps previous lists and does NOT swap when edopro rebuild is empty", async () => {
		const { ports, recorder } = makePorts({
			loadEdopro: jest.fn().mockResolvedValue([]),
		});

		const outcome = await reloadBanListsOnce(ports, fakeLogger(), "fp-old");

		expect(outcome.changed).toBe(false);
		// old fingerprint retained so the next cycle retries
		expect(outcome.fingerprint).toBe("fp-old");
		expect(recorder.edoproReplaced).toBeNull();
		expect(recorder.ygoproReplaced).toBeNull();
	});

	it("keeps previous lists and does NOT swap when ygopro rebuild is empty", async () => {
		const { ports, recorder } = makePorts({
			loadYgopro: jest.fn().mockResolvedValue([]),
		});

		const outcome = await reloadBanListsOnce(ports, fakeLogger(), "fp-old");

		expect(outcome.changed).toBe(false);
		expect(recorder.edoproReplaced).toBeNull();
		expect(recorder.ygoproReplaced).toBeNull();
	});
});

describe("reloadBanListsOnce — error propagation", () => {
	it("propagates loader errors so the scheduler can keep previous lists", async () => {
		const { ports } = makePorts({
			loadEdopro: jest.fn().mockRejectedValue(new Error("parse boom")),
		});

		await expect(reloadBanListsOnce(ports, fakeLogger(), "fp-old")).rejects.toThrow("parse boom");
	});
});

describe("getBanListReloadedAt — timestamp", () => {
	it("advances after a successful reload", async () => {
		const { ports } = makePorts({ now: () => "2026-07-14T15:30:00.000Z" });

		await reloadBanListsOnce(ports, fakeLogger(), "fp-old");

		expect(getBanListReloadedAt()).toBe("2026-07-14T15:30:00.000Z");
	});

	it("does not advance when the rebuild is skipped (unchanged fingerprint)", async () => {
		const { ports: first } = makePorts({ now: () => "2026-07-14T15:30:00.000Z" });
		await reloadBanListsOnce(first, fakeLogger(), "fp-old"); // sets a known value

		const { ports: second } = makePorts({
			fingerprint: jest.fn().mockResolvedValue("fp-same"),
			now: () => "2026-07-14T99:99:99.000Z",
		});
		await reloadBanListsOnce(second, fakeLogger(), "fp-same");

		expect(getBanListReloadedAt()).toBe("2026-07-14T15:30:00.000Z");
	});
});
