import type { Logger } from "src/shared/logger/domain/Logger";
import type { ResolvedPools } from "./ResourcePoolResolver";

/** Pool used by every format that does not ask for another one. */
export const DEFAULT_POOL = "standard";

/** Standard pool plus the extensions delta (prereleases, custom art). */
export const EXTENDED_POOL = "extended";

/** Must match the `runtime.ygopro.pools` key in resources.manifest.json. */
export const RUSH_POOL = "rush";

/** The script search path and card pool a duel boots with. */
export interface SelectedPoolPaths {
	scripts: string[];
	cards: string[];
}

/**
 * Directories to scan for lflist.conf files.
 *
 * The standard pool comes first and keeps its manifest order: ban list indices
 * are positional and clients address lists by index. Named pools are appended,
 * deduplicated (they usually list `base` among their scripts). The extensions
 * delta carries cards and art, not ban lists.
 */
export function lflistScanPaths(pools: ResolvedPools): string[] {
	const seen = new Set<string>(pools.standard);
	const paths = [...pools.standard];

	for (const pool of Object.values(pools.named)) {
		for (const dir of [...pool.cards, ...pool.scripts]) {
			if (seen.has(dir)) {
				continue;
			}
			seen.add(dir);
			paths.push(dir);
		}
	}

	return paths;
}

/**
 * Resolve a pool name to the paths a duel needs.
 *
 * An unknown name falls back to standard rather than to nothing: an empty pool
 * boots a duel with no cards and no scripts, which surfaces as an opaque engine
 * failure, while a room on the wrong pool is visible and recoverable.
 */
export function selectPoolPaths(
	pools: ResolvedPools,
	name: string,
	logger: Logger,
): SelectedPoolPaths {
	if (name === DEFAULT_POOL) {
		return { scripts: pools.standard, cards: pools.standard };
	}

	if (name === EXTENDED_POOL) {
		return { scripts: pools.extended, cards: pools.extended };
	}

	const named = pools.named[name];
	if (named) {
		return { scripts: named.scripts, cards: named.cards };
	}

	logger.error(
		`PoolSelection: unknown pool "${name}" — no runtime.ygopro.pools entry declares it. ` +
			`Falling back to the "${DEFAULT_POOL}" pool.`,
	);
	return { scripts: pools.standard, cards: pools.standard };
}
