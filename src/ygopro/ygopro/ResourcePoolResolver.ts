import fs from "node:fs";
import path from "node:path";
import type { Logger } from "src/shared/logger/domain/Logger";

// ---------------------------------------------------------------------------
// One-shot diagnostic dedup state
// Keys: absPath for missing-dir warns; "dup:<basename>" for cdb-dup warns.
// Module-level so repeated resolvePools calls within the same process stay silent
// after the first occurrence. __resetResolverWarnings() is exported for tests only.
// ---------------------------------------------------------------------------
const _warnedKeys = new Set<string>();

/** Test-only helper — resets one-shot warning state between test cases. */
export function __resetResolverWarnings(): void {
	_warnedKeys.clear();
}

/** Shape of the runtime.ygopro section inside resources.manifest.json. */
interface ManifestRuntimeYGOPro {
	standard?: unknown;
	extended?: unknown;
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
	/**
	 * Environment variable bag. In production pass `process.env`.
	 * Injected as a parameter so tests can override without touching globals.
	 */
	env: NodeJS.ProcessEnv | Record<string, string | undefined>;
	/** Logger for deprecation warnings and error reporting. */
	logger: Logger;
}

export interface ResolvedPools {
	/** Ordered absolute paths for the standard (served formats) pool. */
	standard: string[];
	/** Ordered absolute paths for the extended pool (standard + extensions). */
	extended: string[];
}

/**
 * Derive ordered absolute-path pools from the manifest runtime section.
 *
 * Resolution rules (per RFD-003, RFD-004, RFD-005):
 * 1. If YGOPRO_FOLDERS is set and non-empty: use it as-is for standard + warn.
 * 2. If YGOPRO_EXTRA_FOLDERS is set and non-empty: use it as-is for extended delta + warn.
 * 3. Otherwise derive from manifest runtime.ygopro.standard / .extended.
 * 4. On any manifest read/parse error or missing standard: log error, return empty pools.
 * 5. Missing extended (but valid standard): extended falls back to standard (no error).
 */
export function resolvePools(options: ResourcePoolResolverOptions): ResolvedPools {
	const { manifestPath, resourcesDir, env, logger } = options;

	const resolvedResourcesDir = path.resolve(resourcesDir);
	const ygoproBase = path.join(resolvedResourcesDir, "ygopro");

	// --- Parse manifest (used only when env override is absent for that pool) ---
	let manifest: Manifest | null = null;

	const envFolders = env["YGOPRO_FOLDERS"];
	const envExtra = env["YGOPRO_EXTRA_FOLDERS"];

	const needsManifest =
		!envFolders || envFolders.trim() === "" || !envExtra || envExtra.trim() === "";

	if (needsManifest) {
		manifest = readManifest(manifestPath, logger);
	}

	// --- Standard pool ---
	let standard: string[];

	if (envFolders && envFolders.trim() !== "") {
		logger.warn(
			`YGOPRO_FOLDERS is set — using env value as-is instead of deriving from manifest. ` +
				`YGOPRO_FOLDERS is deprecated; derivation from runtime.ygopro.standard is the supported path.`,
		);
		standard = envFolders.split(",").filter((p) => p.length > 0);
	} else {
		standard = deriveStandard(manifest, ygoproBase, manifestPath, logger);
	}

	// --- Extended delta (extensions beyond standard) ---
	let extendedDelta: string[];

	if (envExtra && envExtra.trim() !== "") {
		logger.warn(
			`YGOPRO_EXTRA_FOLDERS is set — using env value as-is instead of deriving from manifest. ` +
				`YGOPRO_EXTRA_FOLDERS is deprecated; derivation from runtime.ygopro.extended is the supported path.`,
		);
		extendedDelta = envExtra.split(",").filter((p) => p.length > 0);
	} else {
		extendedDelta = deriveExtended(manifest, ygoproBase);
	}

	const extended = [...standard, ...extendedDelta];

	// --- Diagnostic 1: warn on manifest-derived paths that do not exist on disk ---
	// Only checked when derivation is used (not env-override), to avoid noise on the
	// deprecated escape hatch (those paths are the caller's responsibility).
	if (!envFolders || envFolders.trim() === "") {
		warnMissingPoolDirs(standard, logger);
	}

	// --- Diagnostic 2: warn on duplicate .cdb basenames across standard pool folders ---
	// Scanned on the standard pool (extended = standard + delta; scanning standard avoids
	// double-counting the overlapping directories). Best-effort: unreadable dirs skipped.
	warnDuplicateCdbBasenames(standard, logger);

	return { standard, extended };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

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
		// Error already logged in readManifest
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

	return standardLeaves
		.filter((leaf): leaf is string => typeof leaf === "string" && leaf.length > 0)
		.map((leaf) => path.join(ygoproBase, leaf));
}

function deriveExtended(manifest: Manifest | null, ygoproBase: string): string[] {
	if (manifest === null) {
		return [];
	}

	const extendedLeaves = manifest?.runtime?.ygopro?.extended;

	if (!Array.isArray(extendedLeaves)) {
		// Missing extended — fall back silently to empty delta (caller will use standard as extended)
		return [];
	}

	return extendedLeaves
		.filter((leaf): leaf is string => typeof leaf === "string" && leaf.length > 0)
		.map((leaf) => path.join(ygoproBase, leaf));
}

/**
 * Diagnostic 1 — warn for each manifest-derived pool path that does not exist as a
 * directory on disk. Non-fatal: the path is still returned to the caller.
 *
 * Decision: only applied to manifest-derived paths. Env-override paths (YGOPRO_FOLDERS /
 * YGOPRO_EXTRA_FOLDERS) are a deprecated escape hatch and are the caller's responsibility;
 * warning on them would add noise without actionable guidance.
 */
function warnMissingPoolDirs(pools: string[], logger: Logger): void {
	for (const absPath of pools) {
		if (!fs.existsSync(absPath) || !fs.statSync(absPath).isDirectory()) {
			// One-shot: emit this warning at most once per process per missing path.
			const key = `missing:${absPath}`;
			if (_warnedKeys.has(key)) {
				continue;
			}
			_warnedKeys.add(key);

			// Derive the leaf from the path for a friendlier message.
			// The leaf is whatever comes after /ygopro/ in the resolved path.
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
 * Diagnostic 2 — warn when two or more standard pool folders contain a .cdb file with the
 * same basename. Duplicate basenames cause the databases listing to merge them into a single
 * entry (keyed by filename), making one source invisible.
 *
 * Scan scope: top-level .cdb files in each pool directory (non-recursive). This matches how
 * the game engine reads cdbs. Best-effort: unreadable folders are silently skipped.
 *
 * Decision: scanned on the standard pool only (not extended), because extended = standard +
 * delta; scanning both would double-count the standard directories.
 */
function warnDuplicateCdbBasenames(pools: string[], logger: Logger): void {
	// Map: basename → list of pool dirs that contain it
	const basenameToFolders = new Map<string, string[]>();

	for (const folder of pools) {
		let entries: string[];
		try {
			entries = fs.readdirSync(folder);
		} catch {
			// Unreadable — skip silently
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
			// One-shot: emit this warning at most once per process per duplicate basename.
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
