import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DirScriptReaderEx } from "koishipro-core.js";
import type { Logger } from "src/shared/logger/domain/Logger";
import type { ResolvedPools } from "./ResourcePoolResolver";
import { DEFAULT_POOL, EXTENDED_POOL, lflistScanPaths, selectPoolPaths } from "./PoolSelection";

function makeLogger(): jest.Mocked<Logger> {
	return {
		debug: jest.fn(),
		error: jest.fn(),
		info: jest.fn(),
		warn: jest.fn(),
		child: jest.fn().mockReturnThis(),
	};
}

const BASE = "/res/ygopro/base";
const OCG = "/res/ygopro/formats/ocg";
const PRERELEASES = "/res/ygopro/extensions/prereleases";
const RUSH = "/res/ygopro/formats/rush";

const POOLS: ResolvedPools = {
	standard: [BASE, OCG],
	extended: [BASE, OCG, PRERELEASES],
	named: {
		rush: { scripts: [BASE, RUSH], cards: [RUSH] },
	},
};

describe("selectPoolPaths", () => {
	it("maps the standard pool to the same paths for scripts and cards", () => {
		expect(selectPoolPaths(POOLS, DEFAULT_POOL, makeLogger())).toEqual({
			scripts: [BASE, OCG],
			cards: [BASE, OCG],
		});
	});

	it("searches the extensions delta first for extended scripts", () => {
		// The script reader returns the first match, and prereleases ship fixed
		// scripts for cards that already exist in base.
		expect(selectPoolPaths(POOLS, EXTENDED_POOL, makeLogger()).scripts).toEqual([
			PRERELEASES,
			BASE,
			OCG,
		]);
	});

	it("boots extended duels with the extensions copy of a script that base also has", async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "pool-selection-"));
		try {
			const base = path.join(root, "base");
			const prereleases = path.join(root, "prereleases");
			for (const [dir, body] of [
				[base, "-- base"],
				[prereleases, "-- fixed"],
			]) {
				fs.mkdirSync(path.join(dir, "script"), { recursive: true });
				fs.writeFileSync(path.join(dir, "script", "c39275698.lua"), body);
			}
			const pools: ResolvedPools = {
				standard: [base],
				extended: [base, prereleases],
				named: {},
			};

			const reader = await DirScriptReaderEx(
				...selectPoolPaths(pools, EXTENDED_POOL, makeLogger()).scripts,
			);

			expect(Buffer.from(reader("./script/c39275698.lua") ?? []).toString()).toBe("-- fixed");
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("searches the extensions delta first for extended cards", () => {
		// Prereleases ship updated rows (new set codes, categories) for existing cards.
		expect(selectPoolPaths(POOLS, EXTENDED_POOL, makeLogger()).cards).toEqual([
			PRERELEASES,
			BASE,
			OCG,
		]);
	});

	it("returns a named pool's independent script and card paths", () => {
		// Rush is the reason scripts and cards are separate: base is on the
		// script path for utility.lua, but its cards are not part of the format.
		expect(selectPoolPaths(POOLS, "rush", makeLogger())).toEqual({
			scripts: [BASE, RUSH],
			cards: [RUSH],
		});
	});

	it("falls back to the standard pool for an unknown name and logs an error", () => {
		const logger = makeLogger();

		const selected = selectPoolPaths(POOLS, "speed", logger);

		expect(selected).toEqual({ scripts: [BASE, OCG], cards: [BASE, OCG] });
		expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("speed"));
	});

	it("does not let an unknown name silently produce an empty pool", () => {
		// A duel booted with no cards and no scripts would fail in the engine with
		// an opaque error; falling back to standard keeps the room playable.
		const selected = selectPoolPaths(POOLS, "typo", makeLogger());

		expect(selected.cards.length).toBeGreaterThan(0);
		expect(selected.scripts.length).toBeGreaterThan(0);
	});
});

describe("lflistScanPaths", () => {
	it("starts with the standard pool, in order", () => {
		expect(lflistScanPaths(POOLS).slice(0, 2)).toEqual([BASE, OCG]);
	});

	it("includes named pool directories so their ban lists are discoverable", () => {
		// A named pool sits outside the standard pool by design, so without this
		// its lflist.conf is never scanned and the format's alias resolves to
		// whichever list happens to sit at the fallback index.
		expect(lflistScanPaths(POOLS)).toContain(RUSH);
	});

	it("does not scan a directory twice when a named pool reuses it", () => {
		// The rush pool lists BASE among its scripts; scanning it again would
		// load every base ban list a second time.
		expect(lflistScanPaths(POOLS).filter((p) => p === BASE)).toHaveLength(1);
	});

	it("omits the extensions delta, which carries no ban lists", () => {
		expect(lflistScanPaths(POOLS)).not.toContain(PRERELEASES);
	});
});
