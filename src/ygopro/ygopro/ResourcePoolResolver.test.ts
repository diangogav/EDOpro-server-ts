import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import {
	resolvePools,
	__resetResolverWarnings,
	type ResourcePoolResolverOptions,
} from "./ResourcePoolResolver";
import type { Logger } from "src/shared/logger/domain/Logger";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLogger(): jest.Mocked<Logger> {
	return {
		debug: jest.fn(),
		error: jest.fn(),
		info: jest.fn(),
		warn: jest.fn(),
		child: jest.fn().mockReturnThis(),
	};
}

/** Write a manifest JSON file into a temp directory and return the path. */
function writeManifest(dir: string, data: unknown, filename = "resources.manifest.json"): string {
	const p = path.join(dir, filename);
	fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf-8");
	return p;
}

/** Build a ResourcePoolResolverOptions object with defaults filled in. */
function opts(
	overrides: Partial<ResourcePoolResolverOptions> & { manifestPath: string; resourcesDir: string },
): ResourcePoolResolverOptions {
	return {
		env: {},
		logger: makeLogger(),
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const STANDARD_LEAVES = [
	"base",
	"formats/ocg",
	"formats/edison",
	"formats/genesys",
	"formats/hat",
	"formats/jtp",
	"formats/md",
	"formats/tengu",
	"formats/world",
];

const EXTENDED_LEAVES = ["extensions/prereleases", "extensions/cards-art"];

const VALID_MANIFEST = {
	sources: [{ id: "s", type: "git", url: "https://example.com" }],
	assembly: [{ target: "t", from: "s" }],
	runtime: {
		ygopro: {
			standard: STANDARD_LEAVES,
			extended: EXTENDED_LEAVES,
		},
	},
};

// ---------------------------------------------------------------------------
// RFD-003 — standard pool, extended pool, ordering
// ---------------------------------------------------------------------------

describe("ResourcePoolResolver — RFD-003 (ordering and pools)", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rfd-003-"));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("derives standard pool in exact manifest order (base first)", () => {
		const manifestPath = writeManifest(tmpDir, VALID_MANIFEST);
		const resourcesDir = "/test/resources/current";

		const { standard } = resolvePools(opts({ manifestPath, resourcesDir }));

		const expected = STANDARD_LEAVES.map((leaf) =>
			path.join(path.resolve(resourcesDir), "ygopro", leaf),
		);
		expect(standard).toEqual(expected);
	});

	it("derives extended pool as standard + extension leaves appended", () => {
		const manifestPath = writeManifest(tmpDir, VALID_MANIFEST);
		const resourcesDir = "/test/resources/current";

		const { standard, extended } = resolvePools(opts({ manifestPath, resourcesDir }));

		const extensionPaths = EXTENDED_LEAVES.map((leaf) =>
			path.join(path.resolve(resourcesDir), "ygopro", leaf),
		);
		expect(extended).toEqual([...standard, ...extensionPaths]);
	});

	it("standard pool has base as first element", () => {
		const manifestPath = writeManifest(tmpDir, VALID_MANIFEST);
		const resourcesDir = "/test/resources/current";

		const { standard } = resolvePools(opts({ manifestPath, resourcesDir }));

		expect(standard[0]).toBe(path.join(path.resolve(resourcesDir), "ygopro", "base"));
	});

	it("omitted formats are absent from both pools", () => {
		const manifestPath = writeManifest(tmpDir, VALID_MANIFEST);
		const resourcesDir = "/test/resources/current";

		const { standard, extended } = resolvePools(opts({ manifestPath, resourcesDir }));

		const omitted = ["goat", "rush", "speed", "gx", "mdc"];
		for (const format of omitted) {
			for (const pool of [standard, extended]) {
				for (const p of pool) {
					expect(p).not.toContain(format);
				}
			}
		}
	});

	it("extensions are absent from standard pool but present in extended pool", () => {
		const manifestPath = writeManifest(tmpDir, VALID_MANIFEST);
		const resourcesDir = "/test/resources/current";

		const { standard, extended } = resolvePools(opts({ manifestPath, resourcesDir }));

		const extPaths = EXTENDED_LEAVES.map((leaf) =>
			path.join(path.resolve(resourcesDir), "ygopro", leaf),
		);
		for (const ep of extPaths) {
			expect(standard).not.toContain(ep);
			expect(extended).toContain(ep);
		}
	});
});

// ---------------------------------------------------------------------------
// RFD-004 — env override wins, deprecation warning
// ---------------------------------------------------------------------------

describe("ResourcePoolResolver — RFD-004 (env override)", () => {
	let tmpDir: string;
	let logger: jest.Mocked<Logger>;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rfd-004-"));
		logger = makeLogger();
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("YGOPRO_FOLDERS override is used as-is and emits one warn", () => {
		const manifestPath = writeManifest(tmpDir, VALID_MANIFEST);
		const envFolders = "/override/standard/a,/override/standard/b";

		const { standard } = resolvePools(
			opts({
				manifestPath,
				resourcesDir: "/ignored",
				env: { YGOPRO_FOLDERS: envFolders },
				logger,
			}),
		);

		expect(standard).toEqual(["/override/standard/a", "/override/standard/b"]);
		// Must emit exactly one deprecation warning for YGOPRO_FOLDERS
		const warnCalls = logger.warn.mock.calls;
		const foldersWarnings = warnCalls.filter((args) => String(args[0]).includes("YGOPRO_FOLDERS"));
		expect(foldersWarnings).toHaveLength(1);
	});

	it("YGOPRO_EXTRA_FOLDERS override is used as-is and emits one warn", () => {
		const manifestPath = writeManifest(tmpDir, VALID_MANIFEST);
		const envExtra = "/override/ext/pre,/override/ext/art";

		const { standard, extended } = resolvePools(
			opts({
				manifestPath,
				resourcesDir: "/test/resources/current",
				env: { YGOPRO_EXTRA_FOLDERS: envExtra },
				logger,
			}),
		);

		// standard is derived (no YGOPRO_FOLDERS set)
		const expectedStandard = STANDARD_LEAVES.map((leaf) =>
			path.join(path.resolve("/test/resources/current"), "ygopro", leaf),
		);
		expect(standard).toEqual(expectedStandard);

		// extended = derived standard + overridden extra
		expect(extended).toEqual([...expectedStandard, "/override/ext/pre", "/override/ext/art"]);

		const warnCalls = logger.warn.mock.calls;
		const extraWarnings = warnCalls.filter((args) =>
			String(args[0]).includes("YGOPRO_EXTRA_FOLDERS"),
		);
		expect(extraWarnings).toHaveLength(1);
	});

	it("derivation default: no env-deprecation warnings when env vars are unset", () => {
		const manifestPath = writeManifest(tmpDir, VALID_MANIFEST);

		resolvePools(
			opts({
				manifestPath,
				resourcesDir: "/test/resources/current",
				env: {},
				logger,
			}),
		);

		// No deprecation warnings for env overrides (diagnostic warns for missing dirs are separate)
		const warnCalls = logger.warn.mock.calls;
		const deprecationWarnings = warnCalls.filter(
			(args) =>
				String(args[0]).includes("YGOPRO_FOLDERS") ||
				String(args[0]).includes("YGOPRO_EXTRA_FOLDERS"),
		);
		expect(deprecationWarnings).toHaveLength(0);
	});

	it("mixed: YGOPRO_FOLDERS set, YGOPRO_EXTRA_FOLDERS empty => standard from env, extended from derivation", () => {
		const manifestPath = writeManifest(tmpDir, VALID_MANIFEST);
		const envFolders = "/manual/base,/manual/formats/ocg";

		const { standard, extended } = resolvePools(
			opts({
				manifestPath,
				resourcesDir: "/test/resources/current",
				env: { YGOPRO_FOLDERS: envFolders },
				logger,
			}),
		);

		expect(standard).toEqual(["/manual/base", "/manual/formats/ocg"]);

		// extended = overridden standard + derived extended leaves
		const derivedExtLeafPaths = EXTENDED_LEAVES.map((leaf) =>
			path.join(path.resolve("/test/resources/current"), "ygopro", leaf),
		);
		expect(extended).toEqual([...standard, ...derivedExtLeafPaths]);

		const warnCalls = logger.warn.mock.calls;
		const foldersWarnings = warnCalls.filter((args) => String(args[0]).includes("YGOPRO_FOLDERS"));
		expect(foldersWarnings).toHaveLength(1);
		// No warning for YGOPRO_EXTRA_FOLDERS since it was not set
		const extraWarnings = warnCalls.filter((args) =>
			String(args[0]).includes("YGOPRO_EXTRA_FOLDERS"),
		);
		expect(extraWarnings).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// RFD-005 — failure modes keep the server up
// ---------------------------------------------------------------------------

describe("ResourcePoolResolver — RFD-005 (failure modes)", () => {
	let tmpDir: string;
	let logger: jest.Mocked<Logger>;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rfd-005-"));
		logger = makeLogger();
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("manifest file missing: logs error, returns empty pools, does not throw", () => {
		const manifestPath = path.join(tmpDir, "does-not-exist.json");

		const result = resolvePools(opts({ manifestPath, resourcesDir: "/test", logger }));

		expect(result.standard).toEqual([]);
		expect(result.extended).toEqual([]);
		const errorCalls = logger.error.mock.calls;
		expect(errorCalls.length).toBeGreaterThanOrEqual(1);
		const errorMessages = errorCalls.map((c) => String(c[0]));
		expect(errorMessages.some((m) => m.includes(manifestPath))).toBe(true);
	});

	it("malformed JSON: logs error, returns empty pools, does not throw", () => {
		const manifestPath = path.join(tmpDir, "bad.json");
		fs.writeFileSync(manifestPath, "{ this is not json ", "utf-8");

		const result = resolvePools(opts({ manifestPath, resourcesDir: "/test", logger }));

		expect(result.standard).toEqual([]);
		expect(result.extended).toEqual([]);
		expect(logger.error).toHaveBeenCalled();
	});

	it("valid JSON but missing runtime.ygopro.standard: logs error, empty standard", () => {
		const manifestPath = writeManifest(tmpDir, {
			sources: [{ id: "s", type: "git", url: "https://example.com" }],
			assembly: [{ target: "t", from: "s" }],
		});

		const result = resolvePools(opts({ manifestPath, resourcesDir: "/test", logger }));

		expect(result.standard).toEqual([]);
		expect(result.extended).toEqual([]);
		expect(logger.error).toHaveBeenCalled();
	});

	it("runtime.ygopro.extended missing: standard derived normally, extended falls back to standard", () => {
		const manifestPath = writeManifest(tmpDir, {
			sources: [{ id: "s", type: "git", url: "https://example.com" }],
			assembly: [{ target: "t", from: "s" }],
			runtime: {
				ygopro: {
					standard: STANDARD_LEAVES,
					// extended intentionally absent
				},
			},
		});
		const resourcesDir = "/test/resources/current";

		const { standard, extended } = resolvePools(opts({ manifestPath, resourcesDir, logger }));

		const expectedStandard = STANDARD_LEAVES.map((leaf) =>
			path.join(path.resolve(resourcesDir), "ygopro", leaf),
		);
		expect(standard).toEqual(expectedStandard);
		expect(extended).toEqual(expectedStandard);
		// No error for just-missing extended (graceful fallback)
		expect(logger.error).not.toHaveBeenCalled();
	});

	it("malformed extended with valid standard: standard pool is valid, extended falls back to standard", () => {
		const manifestPath = writeManifest(tmpDir, {
			sources: [{ id: "s", type: "git", url: "https://example.com" }],
			assembly: [{ target: "t", from: "s" }],
			runtime: {
				ygopro: {
					standard: STANDARD_LEAVES,
					extended: "not-an-array",
				},
			},
		});
		const resourcesDir = "/test/resources/current";

		const { standard, extended } = resolvePools(opts({ manifestPath, resourcesDir, logger }));

		const expectedStandard = STANDARD_LEAVES.map((leaf) =>
			path.join(path.resolve(resourcesDir), "ygopro", leaf),
		);
		expect(standard).toEqual(expectedStandard);
		expect(extended).toEqual(expectedStandard);
	});
});

// ---------------------------------------------------------------------------
// RFD-DX1 — Diagnostic: warn on manifest-derived pool paths that do not exist
// ---------------------------------------------------------------------------

describe("ResourcePoolResolver — Diagnostic 1 (missing pool dir warn)", () => {
	let tmpDir: string;
	let logger: jest.Mocked<Logger>;

	beforeEach(() => {
		__resetResolverWarnings();
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rfd-dx1-"));
		logger = makeLogger();
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("warns with leaf+path when a manifest-derived standard path does not exist on disk", () => {
		const manifestPath = writeManifest(tmpDir, {
			runtime: { ygopro: { standard: ["jtp"], extended: [] } },
		});
		// resourcesDir is tmpDir but we do NOT create the ygopro/jtp subdirectory

		resolvePools(opts({ manifestPath, resourcesDir: tmpDir, logger }));

		const warnCalls = logger.warn.mock.calls;
		const missingWarns = warnCalls.filter((args) => String(args[0]).includes("does not exist"));
		expect(missingWarns).toHaveLength(1);
		expect(String(missingWarns[0][0])).toContain('"jtp"');
		expect(String(missingWarns[0][0])).toContain(path.join(path.resolve(tmpDir), "ygopro", "jtp"));
	});

	it("does not warn when all manifest-derived standard paths exist on disk", () => {
		// Create the actual directory tree
		const ygoproDir = path.join(tmpDir, "ygopro");
		const leafDir = path.join(ygoproDir, "base");
		fs.mkdirSync(leafDir, { recursive: true });

		const manifestPath = writeManifest(tmpDir, {
			runtime: { ygopro: { standard: ["base"], extended: [] } },
		});

		resolvePools(opts({ manifestPath, resourcesDir: tmpDir, logger }));

		const warnCalls = logger.warn.mock.calls;
		const missingWarns = warnCalls.filter((args) => String(args[0]).includes("does not exist"));
		expect(missingWarns).toHaveLength(0);
	});

	it("warns for each missing path individually", () => {
		const manifestPath = writeManifest(tmpDir, {
			runtime: { ygopro: { standard: ["base", "formats/ocg"], extended: [] } },
		});
		// Neither directory exists

		resolvePools(opts({ manifestPath, resourcesDir: tmpDir, logger }));

		const warnCalls = logger.warn.mock.calls;
		const missingWarns = warnCalls.filter((args) => String(args[0]).includes("does not exist"));
		expect(missingWarns).toHaveLength(2);
	});

	it("does NOT warn for env-override standard paths that do not exist (env path is caller's responsibility)", () => {
		const manifestPath = writeManifest(tmpDir, {
			runtime: { ygopro: { standard: ["base"], extended: [] } },
		});
		const envFolders = "/nonexistent/override/a,/nonexistent/override/b";

		resolvePools(
			opts({
				manifestPath,
				resourcesDir: tmpDir,
				env: { YGOPRO_FOLDERS: envFolders },
				logger,
			}),
		);

		const warnCalls = logger.warn.mock.calls;
		const missingWarns = warnCalls.filter((args) => String(args[0]).includes("does not exist"));
		expect(missingWarns).toHaveLength(0);
	});

	it("returns the path even when the directory is missing (non-fatal)", () => {
		const manifestPath = writeManifest(tmpDir, {
			runtime: { ygopro: { standard: ["jtp"], extended: [] } },
		});

		const { standard } = resolvePools(opts({ manifestPath, resourcesDir: tmpDir, logger }));

		expect(standard).toEqual([path.join(path.resolve(tmpDir), "ygopro", "jtp")]);
	});
});

// ---------------------------------------------------------------------------
// RFD-DX2 — Diagnostic: warn on duplicate .cdb basenames across pool folders
// ---------------------------------------------------------------------------

describe("ResourcePoolResolver — Diagnostic 2 (duplicate cdb basename warn)", () => {
	let tmpDir: string;
	let logger: jest.Mocked<Logger>;

	beforeEach(() => {
		__resetResolverWarnings();
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rfd-dx2-"));
		logger = makeLogger();
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	/** Create a directory and write empty .cdb files in it. */
	function createPoolDir(base: string, leaf: string, cdbNames: string[]): string {
		const dir = path.join(base, "ygopro", leaf);
		fs.mkdirSync(dir, { recursive: true });
		for (const name of cdbNames) {
			fs.writeFileSync(path.join(dir, name), "", "utf-8");
		}
		return dir;
	}

	it("warns when two pool folders share the same .cdb basename", () => {
		createPoolDir(tmpDir, "classic", ["cards.cdb"]);
		createPoolDir(tmpDir, "base", ["cards.cdb"]);

		const manifestPath = writeManifest(tmpDir, {
			runtime: { ygopro: { standard: ["classic", "base"], extended: [] } },
		});

		resolvePools(opts({ manifestPath, resourcesDir: tmpDir, logger }));

		const warnCalls = logger.warn.mock.calls;
		const dupWarns = warnCalls.filter((args) => String(args[0]).includes("duplicate cdb basename"));
		expect(dupWarns).toHaveLength(1);
		expect(String(dupWarns[0][0])).toContain('"cards.cdb"');
	});

	it("does not warn when all .cdb basenames are distinct across pool folders", () => {
		createPoolDir(tmpDir, "classic", ["classic.cdb"]);
		createPoolDir(tmpDir, "base", ["base.cdb"]);

		const manifestPath = writeManifest(tmpDir, {
			runtime: { ygopro: { standard: ["classic", "base"], extended: [] } },
		});

		resolvePools(opts({ manifestPath, resourcesDir: tmpDir, logger }));

		const warnCalls = logger.warn.mock.calls;
		const dupWarns = warnCalls.filter((args) => String(args[0]).includes("duplicate cdb basename"));
		expect(dupWarns).toHaveLength(0);
	});

	it("warns once per duplicate basename (not once per pair)", () => {
		createPoolDir(tmpDir, "a", ["cards.cdb", "extra.cdb"]);
		createPoolDir(tmpDir, "b", ["cards.cdb", "extra.cdb"]);
		createPoolDir(tmpDir, "c", ["cards.cdb"]);

		const manifestPath = writeManifest(tmpDir, {
			runtime: { ygopro: { standard: ["a", "b", "c"], extended: [] } },
		});

		resolvePools(opts({ manifestPath, resourcesDir: tmpDir, logger }));

		const warnCalls = logger.warn.mock.calls;
		const dupWarns = warnCalls.filter((args) => String(args[0]).includes("duplicate cdb basename"));
		// One warn for "cards.cdb", one warn for "extra.cdb"
		expect(dupWarns).toHaveLength(2);
	});

	it("skips unreadable pool folder silently (does not throw)", () => {
		createPoolDir(tmpDir, "base", ["base.cdb"]);

		const manifestPath = writeManifest(tmpDir, {
			runtime: {
				ygopro: {
					standard: ["base", "nonexistent-dir"],
					extended: [],
				},
			},
		});

		expect(() => resolvePools(opts({ manifestPath, resourcesDir: tmpDir, logger }))).not.toThrow();
	});

	it("warns naming both folders that share the basename", () => {
		createPoolDir(tmpDir, "classic", ["cards.cdb"]);
		createPoolDir(tmpDir, "base", ["cards.cdb"]);

		const manifestPath = writeManifest(tmpDir, {
			runtime: { ygopro: { standard: ["classic", "base"], extended: [] } },
		});

		resolvePools(opts({ manifestPath, resourcesDir: tmpDir, logger }));

		const warnCalls = logger.warn.mock.calls;
		const dupWarns = warnCalls.filter((args) => String(args[0]).includes("duplicate cdb basename"));
		const msg = String(dupWarns[0][0]);
		expect(msg).toContain(path.join(path.resolve(tmpDir), "ygopro", "classic"));
		expect(msg).toContain(path.join(path.resolve(tmpDir), "ygopro", "base"));
	});
});

// ---------------------------------------------------------------------------
// One-shot diagnostics — warnings must fire exactly once across repeated calls
// ---------------------------------------------------------------------------

describe("ResourcePoolResolver — one-shot diagnostics", () => {
	let tmpDir: string;

	beforeEach(() => {
		__resetResolverWarnings();
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rfd-oneshot-"));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("missing-dir warn fires exactly once when resolvePools is called twice with the same absent path", () => {
		const logger = makeLogger();
		const manifestPath = writeManifest(tmpDir, {
			runtime: { ygopro: { standard: ["jtp"], extended: [] } },
		});

		resolvePools(opts({ manifestPath, resourcesDir: tmpDir, logger }));
		resolvePools(opts({ manifestPath, resourcesDir: tmpDir, logger }));

		const missingWarns = logger.warn.mock.calls.filter((args) =>
			String(args[0]).includes("does not exist"),
		);
		expect(missingWarns).toHaveLength(1);
	});

	it("missing-dir warn still fires for a DIFFERENT absent path on a subsequent call", () => {
		const logger = makeLogger();

		// First call — "jtp" is absent
		const manifestPath1 = writeManifest(tmpDir, {
			runtime: { ygopro: { standard: ["jtp"], extended: [] } },
		});
		resolvePools(opts({ manifestPath: manifestPath1, resourcesDir: tmpDir, logger }));

		// Second call — "world" is absent (different path, different key)
		const manifestPath2 = writeManifest(tmpDir, {
			runtime: { ygopro: { standard: ["world"], extended: [] } },
		});
		resolvePools(opts({ manifestPath: manifestPath2, resourcesDir: tmpDir, logger }));

		const missingWarns = logger.warn.mock.calls.filter((args) =>
			String(args[0]).includes("does not exist"),
		);
		// Both "jtp" and "world" must have warned (one each, different keys)
		expect(missingWarns).toHaveLength(2);
	});

	it("duplicate-basename warn fires exactly once when resolvePools is called twice with the same dup", () => {
		const logger = makeLogger();

		// Create two pool dirs with the same .cdb basename
		const classicDir = path.join(tmpDir, "ygopro", "classic");
		const baseDir = path.join(tmpDir, "ygopro", "base");
		fs.mkdirSync(classicDir, { recursive: true });
		fs.mkdirSync(baseDir, { recursive: true });
		fs.writeFileSync(path.join(classicDir, "cards.cdb"), "", "utf-8");
		fs.writeFileSync(path.join(baseDir, "cards.cdb"), "", "utf-8");

		const manifestPath = writeManifest(tmpDir, {
			runtime: { ygopro: { standard: ["classic", "base"], extended: [] } },
		});

		resolvePools(opts({ manifestPath, resourcesDir: tmpDir, logger }));
		resolvePools(opts({ manifestPath, resourcesDir: tmpDir, logger }));

		const dupWarns = logger.warn.mock.calls.filter((args) =>
			String(args[0]).includes("duplicate cdb basename"),
		);
		expect(dupWarns).toHaveLength(1);
	});
});
