import { rename, rm } from "node:fs/promises";
import type { DataSource } from "typeorm";

import { CARD_DB_FILE } from "@shared/db/sqlite/infrastructure/data-source";

import { EdoProCardDbPorts } from "./EdoProCardDbPorts";
import type { EdoProSQLiteTypeORM } from "./EdoProSQLiteTypeORM";

jest.mock("node:fs/promises", () => ({
	rename: jest.fn(async () => undefined),
	rm: jest.fn(async () => undefined),
	readdir: jest.fn(async () => []),
	stat: jest.fn(async () => ({ size: 0, mtimeMs: 0 })),
}));

const renameMock = rename as jest.Mock;
const rmMock = rm as jest.Mock;

const fakeOrm = (build: jest.Mock): EdoProSQLiteTypeORM =>
	({ build }) as unknown as EdoProSQLiteTypeORM;

describe("EdoProCardDbPorts", () => {
	beforeEach(() => {
		renameMock.mockClear();
		renameMock.mockResolvedValue(undefined);
		rmMock.mockClear();
		rmMock.mockResolvedValue(undefined);
	});

	it("builds into a temp file then renames it onto the canonical evolution_cards.db", async () => {
		const builtDs = { isInitialized: true } as unknown as DataSource;
		const build = jest.fn((_file: string) => Promise.resolve(builtDs));
		const ports = new EdoProCardDbPorts(fakeOrm(build), "dir");

		const result = await ports.build();

		expect(build).toHaveBeenCalledTimes(1);
		const tempFile = build.mock.calls[0][0] as string;
		expect(tempFile).not.toBe(CARD_DB_FILE);
		expect(renameMock).toHaveBeenCalledWith(tempFile, CARD_DB_FILE);
		expect(result).toBe(builtDs);
	});

	it("propagates an orm.build failure and never renames a failed build onto the canonical file", async () => {
		const build = jest.fn((_file: string) => Promise.reject(new Error("merge failed")));
		const ports = new EdoProCardDbPorts(fakeOrm(build), "dir");

		await expect(ports.build()).rejects.toThrow("merge failed");
		expect(renameMock).not.toHaveBeenCalled();
	});

	it("never deletes the canonical file when disposing the previous datasource", async () => {
		jest.useFakeTimers();
		const previous = { destroy: jest.fn(async () => undefined) } as unknown as DataSource;
		const ports = new EdoProCardDbPorts(fakeOrm(jest.fn()), "dir", 1000);

		await ports.destroy(previous);
		expect(previous.destroy).not.toHaveBeenCalled(); // deferred by the grace

		await jest.advanceTimersByTimeAsync(1000);

		expect(previous.destroy).toHaveBeenCalledTimes(1);
		expect(rmMock).not.toHaveBeenCalled(); // the C++ core depends on evolution_cards.db
		jest.useRealTimers();
	});

	it("cleans up the temp and rethrows if the rename fails, leaving the canonical file untouched", async () => {
		const builtDs = {
			isInitialized: true,
			destroy: jest.fn(async () => undefined),
		} as unknown as DataSource;
		const build = jest.fn((_file: string) => Promise.resolve(builtDs));
		renameMock.mockRejectedValueOnce(new Error("EXDEV"));
		const ports = new EdoProCardDbPorts(fakeOrm(build), "dir");

		await expect(ports.build()).rejects.toThrow("EXDEV");

		const tempFile = build.mock.calls[0][0] as string;
		expect(builtDs.destroy).toHaveBeenCalledTimes(1);
		expect(rmMock).toHaveBeenCalledWith(tempFile, { force: true });
		expect(rmMock).not.toHaveBeenCalledWith(CARD_DB_FILE, expect.anything());
	});
});
