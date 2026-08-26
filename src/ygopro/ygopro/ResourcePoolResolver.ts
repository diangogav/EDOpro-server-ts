import fs from "node:fs";
import path from "node:path";
import type { Logger } from "src/shared/logger/domain/Logger";

/**
 * Diagnostics already emitted, so repeated resolvePools calls in one process
 * report each problem once. Keys are namespaced by diagnostic kind.
 */
const _warnedKeys = new Set<string>();

/** Test-only helper — resets one-shot warning state between test cases. */
export function __resetResolverWarnings(): void {
	_warnedKeys.clear();
}

/** Shape of the runtime.ygopro section inside resources.manifest.json. */
interface ManifestRuntimeYGOPro {
	standard?: unknown;
	extended?: unknown;
	pools?: unknown;
}

interface ManifestRuntime {
	ygopro?: ManifestRuntimeYGOPro;
}

interface Manifest {
	runtime?: ManifestRuntime;
}

export interface ResourcePoolResolverOptions {
	/** Absolute or relative path to resources.manifest.json. */
	manifestPath: string;
	/** Absolute or relative path to RESOURCES_DIR (e.g. ./resources/current). */
	resourcesDir: string;
	/** Logger for error reporting and diagnostic warnings. */
	logger: Logger;
}

/**
 * A named pool keeps its script search path separate from its card pool.
 *
 * A script pack needs both to differ: Rush scripts need `base` on the search
 * path for utility.lua and constant.lua, while its card pool must exclude base
 * because OCG cards are not part of the format.
 */
export interface NamedPool {
	/** Ordered absolute paths searched for Lua scripts. */
	scripts: string[];
	/** Ordered absolute paths whose .cdb files form the card pool. */
	cards: string[];
}

export interface ResolvedPools {
	/** Ordered absolute paths for the standard (served formats) pool. */
	standard: string[];
	/** Ordered absolute paths for the extended pool (standard + extensions). */
	extended: string[];
	/** Named pools from runtime.ygopro.pools, keyed by pool name. */
	named: Record<string, NamedPool>;
}

/**
 * Derive ordered absolute-path pools from the manifest runtime section.
 *
 * The manifest is the sole source of pool membership: an unreadable manifest or
 * a missing `standard` is an error and yields empty pools. A missing `extended`
 * is not — extended then equals standard.
 */
export function resolvePools(options: ResourcePoolResolverOptions): ResolvedPools {
	const { manifestPath, resourcesDir, logger } = options;

	const resolvedResourcesDir = path.resolve(resourcesDir);
	const ygoproBase = path.join(resolvedResourcesDir, "ygopro");

	const manifest = readManifest(manifestPath, logger);
	const standard = deriveStandard(manifest, ygoproBase, manifestPath, logger);
	const extended = [...standard, ...deriveExtended(manifest, ygoproBase)];
	const named = deriveNamedPools(manifest, ygoproBase, manifestPath, logger);

	warnMissingPoolDirs(standard, logger);
	for (const pool of Object.values(named)) {
		warnMissingPoolDirs([...pool.scripts, ...pool.cards], logger);
	}
	errorOnEmptyNamedPools(named, logger);
	warnDuplicateCdbBasenames(standard, logger);

	return { standard, extended, named };
}

function readManifest(manifestPath: string, logger: Logger): Manifest | null {
	let raw: string;
	try {
		raw = fs.readFileSync(manifestPath, "utf-8");
	} catch (err) {
		logger.error(
			`ResourcePoolResolver: failed to read manifest at "${manifestPath}": ${String(err)}`,
		);
		return null;
	}

	try {
		return JSON.parse(raw) as Manifest;
	} catch (err) {
		logger.error(
			`ResourcePoolResolver: failed to parse manifest at "${manifestPath}": ${String(err)}`,
		);
		return null;
	}
}

function deriveStandard(
	manifest: Manifest | null,
	ygoproBase: string,
	manifestPath: string,
	logger: Logger,
): string[] {
	if (manifest === null) {
		// readManifest already reported why.
		return [];
	}

	const standardLeaves = manifest?.runtime?.ygopro?.standard;

	if (!Array.isArray(standardLeaves)) {
		logger.error(
			`ResourcePoolResolver: manifest at "${manifestPath}" has no runtime.ygopro.standard array; ` +
				`falling back to empty standard pool.`,
		);
		return [];
	}

	return toAbsoluteLeaves(standardLeaves, ygoproBase);
}

/** An absent `extended` is not an error: the empty delta leaves extended equal to standard. */
function deriveExtended(manifest: Manifest | null, ygoproBase: string): string[] {
	const extendedLeaves = manifest?.runtime?.ygopro?.extended;

	if (!Array.isArray(extendedLeaves)) {
		return [];
	}

	return toAbsoluteLeaves(extendedLeaves, ygoproBase);
}

/**
 * Derive named pools from runtime.ygopro.pools.
 *
 * Absent `pools` is normal. A declared but malformed entry is an error —
 * dropping it silently would boot a server whose format looks configured and
 * resolves to nothing. Invalid entries are skipped one by one.
 */
function deriveNamedPools(
	manifest: Manifest | null,
	ygoproBase: string,
	manifestPath: string,
	logger: Logger,
): Record<string, NamedPool> {
	const pools = manifest?.runtime?.ygopro?.pools;

	if (pools === undefined || pools === null) {
		return {};
	}

	if (typeof pools !== "object" || Array.isArray(pools)) {
		logger.error(
			`ResourcePoolResolver: manifest at "${manifestPath}" has runtime.ygopro.pools that is not ` +
				`an object; ignoring all named pools.`,
		);
		return {};
	}

	const resolved: Record<string, NamedPool> = {};

	for (const [name, entry] of Object.entries(pools as Record<string, unknown>)) {
		if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
			logger.error(
				`ResourcePoolResolver: named pool "${name}" in "${manifestPath}" must be an object with ` +
					`"scripts" and "cards" arrays; skipping it.`,
			);
			continue;
		}

		const { scripts, cards } = entry as { scripts?: unknown; cards?: unknown };

		if (!Array.isArray(scripts) || !Array.isArray(cards)) {
			logger.error(
				`ResourcePoolResolver: named pool "${name}" in "${manifestPath}" is missing a "scripts" or ` +
					`"cards" array; skipping it.`,
			);
			continue;
		}

		resolved[name] = {
			scripts: toAbsoluteLeaves(scripts, ygoproBase),
			cards: toAbsoluteLeaves(cards, ygoproBase),
		};
	}

	return resolved;
}

function toAbsoluteLeaves(leaves: unknown[], ygoproBase: string): string[] {
	return leaves
		.filter((leaf): leaf is string => typeof leaf === "string" && leaf.length > 0)
		.map((leaf) => path.join(ygoproBase, leaf));
}

/**
 * A named pool whose directories exist but hold no .cdb — the assembly step
 * half-ran. Error rather than warn: unlike a missing folder there is no benign
 * reading, since the pool is declared. Pools missing outright are left to
 * warnMissingPoolDirs.
 */
function errorOnEmptyNamedPools(named: Record<string, NamedPool>, logger: Logger): void {
	for (const [name, pool] of Object.entries(named)) {
		const present = pool.cards.filter(
			(dir) => fs.existsSync(dir) && fs.statSync(dir).isDirectory(),
		);
		if (present.length === 0) {
			continue;
		}

		const hasCdb = present.some((dir) => {
			try {
				return fs.readdirSync(dir).some((entry) => entry.toLowerCase().endsWith(".cdb"));
			} catch {
				return false;
			}
		});
		if (hasCdb) {
			continue;
		}

		const key = `emptypool:${name}`;
		if (_warnedKeys.has(key)) {
			continue;
		}
		_warnedKeys.add(key);

		logger.error(
			`ResourcePoolResolver: named pool "${name}" has no card database in [${present.join(", ")}]` +
				` — rooms on this format will boot with an empty card pool and reject every deck.` +
				` Check that the assembly step published its .cdb files.`,
		);
	}
}

/** A manifest-derived pool path that is not a directory on disk. Non-fatal: the path is still returned. */
function warnMissingPoolDirs(pools: string[], logger: Logger): void {
	for (const absPath of pools) {
		if (!fs.existsSync(absPath) || !fs.statSync(absPath).isDirectory()) {
			const key = `missing:${absPath}`;
			if (_warnedKeys.has(key)) {
				continue;
			}
			_warnedKeys.add(key);

			// Report the manifest leaf — whatever follows /ygopro/ — so the message
			// names what the operator actually wrote.
			const ygoproMarker = `${path.sep}ygopro${path.sep}`;
			const markerIdx = absPath.indexOf(ygoproMarker);
			const leaf = markerIdx >= 0 ? absPath.slice(markerIdx + ygoproMarker.length) : absPath;
			logger.warn(
				`ResourcePoolResolver: pool entry "${leaf}" resolves to "${absPath}" which does not exist` +
					` — check the runtime.ygopro entry matches an assembled directory (e.g. "formats/<name>")`,
			);
		}
	}
}

/**
 * Two pool folders holding a .cdb of the same basename: the databases listing is
 * keyed by filename, so they merge into one entry and one source goes invisible.
 *
 * Scans top-level .cdb files only, matching how the engine reads them, and only
 * the standard pool — extended is standard plus a delta, so scanning both would
 * double-count. Unreadable folders are skipped.
 */
function warnDuplicateCdbBasenames(pools: string[], logger: Logger): void {
	const basenameToFolders = new Map<string, string[]>();

	for (const folder of pools) {
		let entries: string[];
		try {
			entries = fs.readdirSync(folder);
		} catch {
			continue;
		}

		for (const entry of entries) {
			if (!entry.endsWith(".cdb")) {
				continue;
			}
			const existing = basenameToFolders.get(entry) ?? [];
			existing.push(folder);
			basenameToFolders.set(entry, existing);
		}
	}

	for (const [basename, folders] of basenameToFolders) {
		if (folders.length >= 2) {
			const key = `dup:${basename}`;
			if (_warnedKeys.has(key)) {
				continue;
			}
			_warnedKeys.add(key);

			logger.warn(
				`ResourcePoolResolver: duplicate cdb basename "${basename}" in pool folders` +
					` [${folders.join(", ")}]` +
					` — they merge into one entry in the databases listing;` +
					` rename one (e.g. ${basename.replace(".cdb", "")}-classic.cdb) to list them separately`,
			);
		}
	}
}
