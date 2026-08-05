import { createHash } from "crypto";
import { readFile } from "fs/promises";
import path from "path";

import { Logger } from "@shared/logger/domain/Logger";
import { config } from "src/config";

// The forked ocgcore WASM the server loads. It is the evolution fork from
// github.com/diangogav/evolution-ygopro-core (release v1.0.0-edison), which
// implements pre-errata / legacy-era rulings (Edison, GOAT, HAT, ...) behind
// duel_rule gates, so it behaves like the stock core in modern formats. It is
// delivered as a runtime add-on through the resources manifest (assembly target
// ygopro/core/ocgcore-worker) rather than baked into the image. Integrity is
// guaranteed here, at boot. When bumping the fork, update the release URL in
// resources.manifest.json and this hash together.
export const EXPECTED_OCGCORE_FORK_SHA256 =
	"4272eb0d077702fea3e9fb1e5255653a99079ec82e06d45448aa438c6a302f23";

// Path within the assembled resource tree — mirrors the manifest assembly rule.
export const OCGCORE_RESOURCE_PATH = "ygopro/core/ocgcore-worker";

export function ocgcoreForkPath(): string {
	return path.resolve(config.resources.dir, OCGCORE_RESOURCE_PATH);
}

// Verifies the forked ocgcore binary is present and matches the expected build.
// koishipro-core.js silently falls back to its bundled STOCK WASM when
// ./ocgcore-worker is absent, so without this check legacy-format rooms could
// run the unpatched core with no signal. Logs loudly by default; set
// OCGCORE_FORK_REQUIRED=true to make a missing/mismatched core a fatal boot error.
export async function verifyOcgcoreFork(logger: Logger): Promise<void> {
	const required = process.env.OCGCORE_FORK_REQUIRED === "true";
	const file = ocgcoreForkPath();

	let actual: string;
	try {
		actual = createHash("sha256")
			.update(await readFile(file))
			.digest("hex");
	} catch {
		const message = `ocgcore fork not found at ${file} — legacy-format rooms will run the STOCK core (koishipro-core.js fallback).`;
		if (required) {
			throw new Error(message);
		}
		logger.warn(`⚠️  ${message} Set OCGCORE_FORK_REQUIRED=true to make this fatal.`);
		return;
	}

	if (actual === EXPECTED_OCGCORE_FORK_SHA256) {
		logger.info(`🧩 ocgcore fork active (sha256 ${actual.slice(0, 12)}…).`);
		return;
	}

	const message = `ocgcore fork at ${file} has sha256 ${actual} but expected ${EXPECTED_OCGCORE_FORK_SHA256} — refusing to trust it.`;
	if (required) {
		throw new Error(message);
	}
	logger.warn(`⚠️  ${message} Legacy-format rooms may not behave as expected.`);
}
