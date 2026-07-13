import fs from "node:fs";
import path from "node:path";
import type { Logger } from "src/shared/logger/domain/Logger";

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
