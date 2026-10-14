import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import initSqlJs from "sql.js";
import { CardDataEntry, YGOProCdb } from "ygopro-cdb-encode";

let rushCards: string[] = [];

jest.mock("yuzuthread", () => {
	const actual = jest.requireActual("yuzuthread");
	return {
		...actual,
		// Worker threads are unavailable under Jest: run the same loader in-process.
		runInWorker: async (
			WorkerClass: new (...args: unknown[]) => { load(): Promise<unknown> },
			_run: unknown,
			...args: unknown[]
		) => new WorkerClass(...args).load(),
	};
});
jest.mock("./ResourcePoolResolver", () => ({
	resolvePools: () => ({
		standard: [],
		extended: [],
		named: {
			rush: {
				scripts: [],
				get cards() {
					return rushCards;
				},
			},
		},
	}),
}));
jest.mock("./ocgcoreFork", () => ({ resolveForkCorePath: () => undefined }));

import { YGOProResourceLoader } from "./YGOProResourceLoader";

type Reloadable = { reloadIfChanged(): Promise<void> };

function card(code: number): CardDataEntry {
	const entry = new CardDataEntry();
	entry.code = code;
	entry.ot = 1;
	entry.name = `Card ${code}`;
	entry.strings = [];
	return entry;
}

describe("YGOProResourceLoader periodic reload of named pools", () => {
	let dir: string;
	let SQL: Awaited<ReturnType<typeof initSqlJs>>;
	let intervalSpy: jest.SpyInstance;

	const writeCdb = (...codes: number[]) => {
		const cdb = new YGOProCdb(SQL);
		for (const code of codes) {
			cdb.addCard(card(code));
		}
		fs.writeFileSync(path.join(dir, "rush.cdb"), Buffer.from(cdb.export()));
	};

	beforeAll(async () => {
		SQL = await initSqlJs();
	});

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), "named-pool-reload-"));
		rushCards = [dir];
		intervalSpy = jest.spyOn(global, "setInterval").mockReturnValue(0 as never);
	});

	afterEach(() => {
		intervalSpy.mockRestore();
		fs.rmSync(dir, { recursive: true, force: true });
	});

	it("replaces a loaded named pool when its cdb changed on disk", async () => {
		writeCdb(1001);
		const loader = new YGOProResourceLoader();
		const before = await loader.getPoolCardStorage("rush");
		expect(before.size).toBe(1);

		writeCdb(1001, 1002);
		await (loader as unknown as Reloadable).reloadIfChanged();

		const after = await loader.getPoolCardStorage("rush");
		expect(after).not.toBe(before);
		expect(after.size).toBe(2);
	});

	it("keeps the same storage instance when the cdb is unchanged", async () => {
		writeCdb(1001);
		const loader = new YGOProResourceLoader();
		const before = await loader.getPoolCardStorage("rush");

		await (loader as unknown as Reloadable).reloadIfChanged();

		expect(await loader.getPoolCardStorage("rush")).toBe(before);
	});

	it("does not load a named pool nobody requested", async () => {
		writeCdb(1001);
		const loader = new YGOProResourceLoader();

		await (loader as unknown as Reloadable).reloadIfChanged();

		expect(
			(loader as unknown as { namedPoolStorages: Map<string, unknown> }).namedPoolStorages.size,
		).toBe(0);
	});
});
