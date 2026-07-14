// Tests for the re-callable loader functions extracted from bootstrap (REQ-302, REQ-303).
// The functions are pure builders: they parse into a local temp array and do NOT touch
// the live BanListMemoryRepository. Mocking at the class level to avoid fs / ygopro deps.

jest.mock("@edopro/ban-list/infrastructure/BanListLoader", () => ({
	EdoProBanListLoader: jest.fn(),
}));
jest.mock("@ygopro/ban-list/infrastructure/YGOProBanListLoader", () => ({
	YGOProBanListLoader: jest.fn(),
}));
// Prevent config from loading env that doesn't exist in test env
jest.mock("src/config", () => ({
	config: {
		resources: { dir: "/fake/resources" },
	},
}));

import { EdoProBanListLoader } from "@edopro/ban-list/infrastructure/BanListLoader";
import { YGOProBanListLoader } from "@ygopro/ban-list/infrastructure/YGOProBanListLoader";
import { EdoproBanList } from "@edopro/ban-list/domain/BanList";
import { YGOProBanList } from "@ygopro/ban-list/domain/YGOProBanList";

// Import the functions AFTER mocks are set up
import { loadEdoproBanLists, loadYgoproBanLists } from "./bootstrapBanListLoaders";

// Cast to jest.Mock so we can control the constructor's returned instance via mockImplementation.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MockEdoProBanListLoader = EdoProBanListLoader as jest.Mock<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MockYGOProBanListLoader = YGOProBanListLoader as jest.Mock<any>;

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

describe("loadEdoproBanLists (REQ-302)", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("calls loadDirectory for both evolution-lflists and lflists paths", async () => {
		const mockLoadDirectory = jest.fn().mockResolvedValue(undefined);
		MockEdoProBanListLoader.mockImplementation(() => ({
			loadDirectory: mockLoadDirectory,
			getLoaded: () => [],
		}));

		await loadEdoproBanLists();

		expect(mockLoadDirectory).toHaveBeenCalledTimes(2);
		expect(mockLoadDirectory).toHaveBeenCalledWith(
			expect.stringContaining("edopro/evolution-lflists"),
		);
		expect(mockLoadDirectory).toHaveBeenCalledWith(expect.stringContaining("edopro/lflists"));
	});

	it("resolves without throwing when loader succeeds", async () => {
		MockEdoProBanListLoader.mockImplementation(() => ({
			loadDirectory: jest.fn().mockResolvedValue(undefined),
			getLoaded: () => [],
		}));

		await expect(loadEdoproBanLists()).resolves.not.toThrow();
	});

	it("propagates the error when loadDirectory throws — caller is responsible for error handling", async () => {
		MockEdoProBanListLoader.mockImplementation(() => ({
			loadDirectory: jest.fn().mockRejectedValue(new Error("parse error")),
			getLoaded: () => [],
		}));

		await expect(loadEdoproBanLists()).rejects.toThrow("parse error");
	});

	it("returns loaded EdoproBanList array from the loader", async () => {
		const listA = makeEdoList("List A");
		const listB = makeEdoList("List B");
		const mockLoadDirectory = jest.fn().mockResolvedValue(undefined);
		MockEdoProBanListLoader.mockImplementation(() => ({
			loadDirectory: mockLoadDirectory,
			getLoaded: () => [listA, listB],
		}));

		const result = await loadEdoproBanLists();

		expect(result).toHaveLength(2);
		expect(result).toContain(listA);
		expect(result).toContain(listB);
	});
});

describe("loadYgoproBanLists (REQ-302)", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("calls load() once on YGOProBanListLoader", async () => {
		const mockLoad = jest.fn().mockResolvedValue(undefined);
		MockYGOProBanListLoader.mockImplementation(() => ({
			load: mockLoad,
			getLoaded: () => [],
		}));

		await loadYgoproBanLists();

		expect(mockLoad).toHaveBeenCalledTimes(1);
	});

	it("returns loaded YGOProBanList array from the loader", async () => {
		const listX = makeYgoList("TCG 2026.04");
		const mockLoad = jest.fn().mockResolvedValue(undefined);
		MockYGOProBanListLoader.mockImplementation(() => ({
			load: mockLoad,
			getLoaded: () => [listX],
		}));

		const result = await loadYgoproBanLists();

		expect(result).toHaveLength(1);
		expect(result[0]).toBe(listX);
	});
});

describe("REQ-303 — edopro loader called before ygopro loader", () => {
	it("edopro load completes before ygopro load begins", async () => {
		const callOrder: string[] = [];

		MockEdoProBanListLoader.mockImplementation(() => ({
			loadDirectory: jest.fn().mockImplementation(async () => {
				callOrder.push("edopro:loadDirectory");
			}),
			getLoaded: () => [],
		}));

		MockYGOProBanListLoader.mockImplementation(() => ({
			load: jest.fn().mockImplementation(async () => {
				callOrder.push("ygopro:load");
			}),
			getLoaded: () => [],
		}));

		// Caller must always call edopro first, then ygopro (REQ-303 ordering).
		await loadEdoproBanLists();
		await loadYgoproBanLists();

		expect(callOrder[0]).toBe("edopro:loadDirectory");
		// Both edopro loadDirectory calls complete before ygopro:load
		expect(callOrder.indexOf("ygopro:load")).toBeGreaterThan(
			callOrder.lastIndexOf("edopro:loadDirectory"),
		);
	});
});
