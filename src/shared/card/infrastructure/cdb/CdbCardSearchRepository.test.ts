import initSqlJs from "sql.js";

import { CdbCardSearchRepository, CdbFile } from "./CdbCardSearchRepository";

interface CardRow {
	id: number;
	name: string;
}

const buildCdb = async (rows: CardRow[]): Promise<Uint8Array> => {
	const SQL = await initSqlJs();
	const db = new SQL.Database();
	db.run("CREATE TABLE texts (id INTEGER PRIMARY KEY, name TEXT)");
	for (const row of rows) {
		db.run("INSERT INTO texts (id, name) VALUES (?, ?)", [row.id, row.name]);
	}
	const data = db.export();
	db.close();

	return data;
};

const cdbFile = (path: string, body: Uint8Array): CdbFile => ({
	path,
	read: async () => body,
});

class InMemoryCdbRepository extends CdbCardSearchRepository {
	constructor(
		private readonly files: CdbFile[],
		lastSourceWins = false,
	) {
		super({ lastSourceWins });
	}

	protected async *cdbFiles(): AsyncIterable<CdbFile> {
		for (const file of this.files) {
			yield file;
		}
	}
}

describe("CdbCardSearchRepository", () => {
	it("indexes names and reports the source .cdb of each card", async () => {
		const body = await buildCdb([{ id: 46986414, name: "Dark Magician" }]);
		const repository = new InMemoryCdbRepository([cdbFile("/res/cards.cdb", body)]);

		expect(await repository.searchByName("dark", 10)).toEqual([
			{ id: 46986414, name: "Dark Magician", source: "cards.cdb" },
		]);
		expect(await repository.findById(46986414)).toEqual({
			id: 46986414,
			name: "Dark Magician",
			source: "cards.cdb",
		});
	});

	it("returns null for an unknown id", async () => {
		const body = await buildCdb([{ id: 1, name: "A" }]);
		const repository = new InMemoryCdbRepository([cdbFile("/res/cards.cdb", body)]);

		expect(await repository.findById(999)).toBeNull();
	});

	it("merges multiple .cdb files into a single index", async () => {
		const base = await buildCdb([{ id: 1, name: "Alpha" }]);
		const extra = await buildCdb([{ id: 2, name: "Beta" }]);
		const repository = new InMemoryCdbRepository([
			cdbFile("/folders/base.cdb", base),
			cdbFile("/extra/extra.cdb", extra),
		]);

		const results = await repository.searchByName("a", 10);

		expect(results).toEqual([
			{ id: 1, name: "Alpha", source: "base.cdb" },
			{ id: 2, name: "Beta", source: "extra.cdb" },
		]);
	});

	it("keeps a single entry per id and the first source wins on overlap", async () => {
		const base = await buildCdb([{ id: 1, name: "Card From Base" }]);
		const overlapping = await buildCdb([{ id: 1, name: "Card From Extra" }]);
		const repository = new InMemoryCdbRepository([
			cdbFile("/folders/base.cdb", base),
			cdbFile("/extra/overlap.cdb", overlapping),
		]);

		const results = await repository.searchByName("card", 10);

		expect(results).toHaveLength(1);
		expect(results[0].source).toBe("base.cdb");
	});

	it("lets the last source win when configured (merge override semantics)", async () => {
		const base = await buildCdb([{ id: 1, name: "Card From Base" }]);
		const overlapping = await buildCdb([{ id: 1, name: "Card From Extra" }]);
		const repository = new InMemoryCdbRepository(
			[cdbFile("/folders/base.cdb", base), cdbFile("/extra/overlap.cdb", overlapping)],
			true,
		);

		const result = await repository.findById(1);

		expect(result?.source).toBe("overlap.cdb");
	});

	it("lists each .cdb source with its card count", async () => {
		const base = await buildCdb([
			{ id: 1, name: "Alpha" },
			{ id: 2, name: "Beta" },
		]);
		const extra = await buildCdb([{ id: 3, name: "Gamma" }]);
		const repository = new InMemoryCdbRepository([
			cdbFile("/extra/zeta.cdb", extra),
			cdbFile("/folders/base.cdb", base),
		]);

		expect(await repository.listSources()).toEqual([
			{ source: "base.cdb", count: 2 },
			{ source: "zeta.cdb", count: 1 },
		]);
	});

	it("returns a paginated, name-sorted page of cards for a given source", async () => {
		const base = await buildCdb([
			{ id: 3, name: "Cards C" },
			{ id: 1, name: "Cards A" },
			{ id: 2, name: "Cards B" },
		]);
		const other = await buildCdb([{ id: 9, name: "Other" }]);
		const repository = new InMemoryCdbRepository([
			cdbFile("/folders/base.cdb", base),
			cdbFile("/extra/other.cdb", other),
		]);

		const page = await repository.findBySource("base.cdb", 2, 1);

		expect(page.total).toBe(3);
		expect(page.cards).toEqual([
			{ id: 2, name: "Cards B", source: "base.cdb" },
			{ id: 3, name: "Cards C", source: "base.cdb" },
		]);
	});

	it("skips an unreadable .cdb and still indexes the readable ones", async () => {
		const valid = await buildCdb([{ id: 1, name: "Alpha" }]);
		const corrupt = new Uint8Array([1, 2, 3, 4]);
		const repository = new InMemoryCdbRepository([
			cdbFile("/folders/valid.cdb", valid),
			cdbFile("/folders/broken.cdb", corrupt),
		]);

		const results = await repository.searchByName("a", 10);

		expect(results).toEqual([{ id: 1, name: "Alpha", source: "valid.cdb" }]);
	});

	it("resolves names for known ids and skips unknown ones", async () => {
		const base = await buildCdb([
			{ id: 1, name: "Alpha" },
			{ id: 2, name: "Beta" },
		]);
		const repository = new InMemoryCdbRepository([cdbFile("/folders/base.cdb", base)]);

		const names = await repository.resolveNames([1, 2, 999]);

		expect(names.get(1)).toBe("Alpha");
		expect(names.get(2)).toBe("Beta");
		expect(names.has(999)).toBe(false);
	});
});
