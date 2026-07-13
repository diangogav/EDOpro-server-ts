/**
 * RFD-007 — whole-chain integration test
 *
 * Fixture tree is built in-memory during beforeAll (SQLite .cdb files are
 * gitignored so they cannot be committed; lflist.conf files are plain text
 * and could be committed, but keeping everything generated keeps the test
 * fully self-contained and avoids .gitignore edge cases).
 *
 * Chain: ResourcePoolResolver -> YGOProResourceLoader -> CardStorage
 *
 * Fixture layout under a tmp directory:
 *   ygopro/
 *     base/                 ← served, card 1001 (dedup base wins)
 *       cards.cdb
 *       lflist.conf
 *     formats/ocg/          ← served, card 2001, lflist.conf
 *       cards.cdb
 *       lflist.conf
 *     formats/goat/         ← assembled-but-NOT-served (omitted from runtime)
 *       cards.cdb           (card 3001 — must NOT appear in any pool)
 *       lflist.conf
 *     extensions/prereleases/  ← extended only, card 4001
 *       cards.cdb
 *       lflist.conf         (extensions carry no lflist in production, but
 *                            we put one here to verify it is NOT loaded via
 *                            getLFLists, which only iterates ygoproPaths)
 */

import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { YGOProCdb, CardDataEntry } from "ygopro-cdb-encode";
import initSqlJs from "sql.js";
import { resolvePools } from "./ResourcePoolResolver";
import { CardStorage } from "./card-storage";
import LoggerFactory from "src/shared/logger/infrastructure/LoggerFactory";

// ---------------------------------------------------------------------------
// Card code constants (arbitrary unique IDs for fixture cards)
// ---------------------------------------------------------------------------
const CODE_BASE = 1001;
const CODE_BASE_DUPLICATE = 1001; // same code placed in ocg to test dedup
const CODE_OCG = 2001;
const CODE_GOAT = 3001; // omitted format — must never appear
const CODE_PRERELEASE = 4001; // extension — only in extended

// ---------------------------------------------------------------------------
// Fixture manifest
// ---------------------------------------------------------------------------
const FIXTURE_MANIFEST = {
	sources: [{ id: "s", type: "git", url: "https://example.com" }],
	assembly: [{ target: "t", from: "s" }],
	runtime: {
		ygopro: {
			// standard: base + ocg only (goat intentionally omitted)
			standard: ["base", "formats/ocg"],
			// extended delta: prereleases only
			extended: ["extensions/prereleases"],
		},
	},
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCard(code: number, name: string): CardDataEntry {
	const card = new CardDataEntry();
	card.code = code;
	card.ot = 1;
	card.name = name;
	card.strings = [];
	return card;
}

async function writeCdb(
	SQL: Awaited<ReturnType<typeof initSqlJs>>,
	dir: string,
	...cards: CardDataEntry[]
): Promise<void> {
	const cdb = new YGOProCdb(SQL);
	for (const card of cards) {
		cdb.addCard(card);
	}
	const buf = Buffer.from(cdb.export());
	fs.writeFileSync(path.join(dir, "cards.cdb"), buf);
}

function writeLflist(dir: string, content: string): void {
	fs.writeFileSync(path.join(dir, "lflist.conf"), content, "utf-8");
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("ResourcePoolResolver integration — RFD-007", () => {
	let tmpDir: string;
	let manifestPath: string;
	let SQL: Awaited<ReturnType<typeof initSqlJs>>;

	beforeAll(async () => {
		SQL = await initSqlJs();
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rfd-007-"));

		// Build fixture tree
		const ygoproDir = path.join(tmpDir, "ygopro");
		const baseDir = path.join(ygoproDir, "base");
		const ocgDir = path.join(ygoproDir, "formats", "ocg");
		const goatDir = path.join(ygoproDir, "formats", "goat");
		const prerelDir = path.join(ygoproDir, "extensions", "prereleases");

		for (const d of [baseDir, ocgDir, goatDir, prerelDir]) {
			fs.mkdirSync(d, { recursive: true });
		}

		// base: card 1001 + a duplicate of 1001 to verify FIRST-occurrence dedup
		await writeCdb(SQL, baseDir, makeCard(CODE_BASE, "Base Card"));
		writeLflist(baseDir, `#[Base OCG]\n!Base OCG\n1001 0\n`);

		// formats/ocg: card 2001 + code 1001 duplicate (should be deduped, base wins)
		await writeCdb(
			SQL,
			ocgDir,
			makeCard(CODE_OCG, "OCG Card"),
			makeCard(CODE_BASE_DUPLICATE, "OCG Duplicate Should Not Win"),
		);
		writeLflist(ocgDir, `#[OCG]\n!OCG\n2001 0\n`);

		// formats/goat: card 3001 (NOT in runtime.standard — must be absent from both pools)
		await writeCdb(SQL, goatDir, makeCard(CODE_GOAT, "Goat Card SHOULD NOT APPEAR"));
		writeLflist(goatDir, `#[Goat]\n!GOAT\n3001 0\n`);

		// extensions/prereleases: card 4001 (extended only)
		await writeCdb(SQL, prerelDir, makeCard(CODE_PRERELEASE, "Prerelease Card"));
		writeLflist(prerelDir, `#[Prereleases]\n!Prereleases\n4001 0\n`);

		// Write manifest
		manifestPath = path.join(tmpDir, "resources.manifest.json");
		fs.writeFileSync(manifestPath, JSON.stringify(FIXTURE_MANIFEST, null, 2), "utf-8");
	});

	afterAll(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	// -------------------------------------------------------------------------
	// Pool derivation assertions (resolver layer)
	// -------------------------------------------------------------------------

	describe("pool derivation", () => {
		it("standard pool contains base and ocg but not goat or prereleases", () => {
			const { standard } = resolvePools({
				manifestPath,
				resourcesDir: tmpDir,
				env: {},
				logger: LoggerFactory.getLogger(),
			});

			const baseExpected = path.join(path.resolve(tmpDir), "ygopro", "base");
			const ocgExpected = path.join(path.resolve(tmpDir), "ygopro", "formats", "ocg");
			const goatNotExpected = path.join(path.resolve(tmpDir), "ygopro", "formats", "goat");
			const prerelNotExpected = path.join(
				path.resolve(tmpDir),
				"ygopro",
				"extensions",
				"prereleases",
			);

			expect(standard).toContain(baseExpected);
			expect(standard).toContain(ocgExpected);
			expect(standard).not.toContain(goatNotExpected);
			expect(standard).not.toContain(prerelNotExpected);
		});

		it("extended pool contains base, ocg, and prereleases but not goat", () => {
			const { extended } = resolvePools({
				manifestPath,
				resourcesDir: tmpDir,
				env: {},
				logger: LoggerFactory.getLogger(),
			});

			const baseExpected = path.join(path.resolve(tmpDir), "ygopro", "base");
			const ocgExpected = path.join(path.resolve(tmpDir), "ygopro", "formats", "ocg");
			const prerelExpected = path.join(path.resolve(tmpDir), "ygopro", "extensions", "prereleases");
			const goatNotExpected = path.join(path.resolve(tmpDir), "ygopro", "formats", "goat");

			expect(extended).toContain(baseExpected);
			expect(extended).toContain(ocgExpected);
			expect(extended).toContain(prerelExpected);
			expect(extended).not.toContain(goatNotExpected);
		});

		it("base appears before ocg in both pools (dedup order preserved)", () => {
			const { standard, extended } = resolvePools({
				manifestPath,
				resourcesDir: tmpDir,
				env: {},
				logger: LoggerFactory.getLogger(),
			});

			const baseExpected = path.join(path.resolve(tmpDir), "ygopro", "base");
			const ocgExpected = path.join(path.resolve(tmpDir), "ygopro", "formats", "ocg");

			expect(standard.indexOf(baseExpected)).toBeLessThan(standard.indexOf(ocgExpected));
			expect(extended.indexOf(baseExpected)).toBeLessThan(extended.indexOf(ocgExpected));
		});
	});

	// -------------------------------------------------------------------------
	// Card storage assertions (CardLoadWorker logic inlined for Jest compatibility)
	//
	// YGOProResourceLoader uses runInWorker() which launches a Node.js worker
	// thread — unsupported in Jest. Instead, we replicate the card-load logic
	// directly (sql.js -> YGOProCdb.step() -> FIRST-occurrence dedup ->
	// CardStorage.fromCards()) to verify the derivation + load chain.
	// -------------------------------------------------------------------------

	async function loadCardsFromPaths(paths: string[]): Promise<CardStorage> {
		const { searchYGOProResource } = await import("koishipro-core.js");
		const cards: CardDataEntry[] = [];
		const seen = new Set<number>();
		for await (const file of searchYGOProResource(...paths)) {
			if (!file.path.endsWith(".cdb")) continue;
			const cdbBody = await file.read();
			const cdb = new YGOProCdb(new SQL.Database(cdbBody)).noTexts();
			for (const card of cdb.step()) {
				const cardId = (card.code ?? 0) >>> 0;
				if (cardId === 0 || seen.has(cardId)) continue;
				seen.add(cardId);
				cards.push(card);
			}
			cdb.finalize();
		}
		return CardStorage.fromCards(cards);
	}

	/**
	 * Same dedup logic as loadCardsFromPaths, but loads WITH texts so that
	 * CardDataEntry.name is populated. Used only to assert content (which wins).
	 */
	async function loadCardsWithNames(paths: string[]): Promise<CardDataEntry[]> {
		const { searchYGOProResource } = await import("koishipro-core.js");
		const cards: CardDataEntry[] = [];
		const seen = new Set<number>();
		for await (const file of searchYGOProResource(...paths)) {
			if (!file.path.endsWith(".cdb")) continue;
			const cdbBody = await file.read();
			// No .noTexts() — load text columns so .name is available
			const cdb = new YGOProCdb(new SQL.Database(cdbBody));
			for (const card of cdb.step()) {
				const cardId = (card.code ?? 0) >>> 0;
				if (cardId === 0 || seen.has(cardId)) continue;
				seen.add(cardId);
				cards.push(card);
			}
			cdb.finalize();
		}
		return cards;
	}

	describe("card loading (inlined CardLoadWorker logic)", () => {
		it("standard pool loads base card and ocg card", async () => {
			const { standard } = resolvePools({
				manifestPath,
				resourcesDir: tmpDir,
				env: {},
				logger: LoggerFactory.getLogger(),
			});

			const storage = await loadCardsFromPaths(standard);

			expect(storage.size).toBeGreaterThanOrEqual(2);
			expect(storage.readCard(CODE_BASE)).toBeDefined();
			expect(storage.readCard(CODE_OCG)).toBeDefined();
		});

		it("goat card is absent from standard pool", async () => {
			const { standard } = resolvePools({
				manifestPath,
				resourcesDir: tmpDir,
				env: {},
				logger: LoggerFactory.getLogger(),
			});

			const storage = await loadCardsFromPaths(standard);

			expect(storage.readCard(CODE_GOAT)).toBeUndefined();
		});

		it("base card wins over ocg duplicate (FIRST-occurrence dedup)", async () => {
			const { standard } = resolvePools({
				manifestPath,
				resourcesDir: tmpDir,
				env: {},
				logger: LoggerFactory.getLogger(),
			});

			const storage = await loadCardsFromPaths(standard);

			// Only 2 unique cards: 1001 (base) and 2001 (ocg). The duplicate 1001 in ocg is dropped.
			expect(storage.readCard(CODE_BASE)).toBeDefined();
			expect(storage.size).toBe(2);

			// The FIRST-occurrence (base) must win by content: load with texts and assert name.
			const cards = await loadCardsWithNames(standard);
			const baseCard = cards.find((c) => (c.code ?? 0) >>> 0 === CODE_BASE);
			expect(baseCard).toBeDefined();
			expect(baseCard?.name).toBe("Base Card");
		});

		it("prerelease card is absent from standard but present in extended pool", async () => {
			const { standard, extended } = resolvePools({
				manifestPath,
				resourcesDir: tmpDir,
				env: {},
				logger: LoggerFactory.getLogger(),
			});

			const standardStorage = await loadCardsFromPaths(standard);
			expect(standardStorage.readCard(CODE_PRERELEASE)).toBeUndefined();

			const extendedStorage = await loadCardsFromPaths(extended);
			expect(extendedStorage.readCard(CODE_PRERELEASE)).toBeDefined();
		});
	});

	// -------------------------------------------------------------------------
	// LFList assertions (getLFLists only reads ygoproPaths = standard)
	// -------------------------------------------------------------------------

	describe("lflist discovery (standard pool only)", () => {
		async function collectLFLists(paths: string[]): Promise<string[]> {
			// Build a minimal loader-like iterator using searchYGOProResource
			const { searchYGOProResource } = await import("koishipro-core.js");
			const { YGOProLFList } = await import("ygopro-lflist-encode");
			const names: string[] = [];
			for await (const file of searchYGOProResource(...paths)) {
				if (path.basename(file.path) !== "lflist.conf") continue;
				const buf = await file.read();
				const text = Buffer.from(buf).toString("utf-8");
				const lflist = new YGOProLFList().fromText(text);
				for (const item of lflist.items) {
					if (item.name) names.push(item.name);
				}
			}
			return names;
		}

		it("standard pool yields base and ocg lflists but not goat or prerelease", async () => {
			const { standard } = resolvePools({
				manifestPath,
				resourcesDir: tmpDir,
				env: {},
				logger: LoggerFactory.getLogger(),
			});

			const names = await collectLFLists(standard);
			expect(names).toContain("Base OCG");
			expect(names).toContain("OCG");
			expect(names).not.toContain("GOAT");
			expect(names).not.toContain("Prereleases");
		});
	});
});
