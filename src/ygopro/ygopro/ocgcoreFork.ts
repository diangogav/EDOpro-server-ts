import { existsSync } from "fs";
import path from "path";

import { Logger } from "@shared/logger/domain/Logger";
import { config } from "src/config";

// Path within the assembled resource tree where the forked ocgcore WASM lands
// (mirrors the manifest assembly rule). The fork is the evolution build from
// github.com/diangogav/evolution-ygopro-core; it implements pre-errata /
// legacy-era rulings (Edison, GOAT, HAT, ...) behind duel_rule gates, so it
// behaves like the stock core in modern formats. Delivered as a runtime add-on
// through the resources manifest rather than baked into the image.
export const OCGCORE_RESOURCE_PATH = "ygopro/core/ocgcore-worker";

export function ocgcoreForkPath(): string {
	return path.resolve(config.resources.dir, OCGCORE_RESOURCE_PATH);
}

// Explicit fork-vs-stock decision, logged when resolved (the loader resolves it
// once and caches). Returns the fork path when the binary is present, or undefined
// to let koishipro-core.js use its bundled STOCK WASM. Legacy-format rooms need the
// fork for correct rulings — running stock there is legal but wrong — so the warn is loud.
export function resolveForkCorePath(logger: Logger): string | undefined {
	const file = ocgcoreForkPath();
	if (existsSync(file)) {
		logger.info(`🧩 ocgcore fork active (${file}).`);
		return file;
	}
	logger.warn(
		`⚠️  ocgcore fork not found at ${file} — legacy-format rooms will run the STOCK core (koishipro-core.js fallback).`,
	);
	return undefined;
}
