import { createHash } from "crypto";
import { readFile } from "fs/promises";
import path from "path";

import { Logger } from "@shared/logger/domain/Logger";
import { config } from "src/config";

// The YGOPro/WASM ocgcore path (Edison rooms) loads this binary. It is the Edison
// fork from github.com/diangogav/evolution-ygopro-core (release v1.0.0-edison),
// delivered as a runtime add-on through the resources manifest (source
// "edison-core" → assembly target ygopro/core/ocgcore-worker) rather than baked
// into the image. Integrity is guaranteed here, at boot. When bumping the fork,
// update the release URL in resources.manifest.json and this hash together.
export const EXPECTED_EDISON_CORE_SHA256 =
	"4272eb0d077702fea3e9fb1e5255653a99079ec82e06d45448aa438c6a302f23";

// Path within the assembled resource tree — mirrors the manifest assembly rule.
export const EDISON_CORE_RESOURCE_PATH = "ygopro/core/ocgcore-worker";

export function edisonCorePath(): string {
	return path.resolve(config.resources.dir, EDISON_CORE_RESOURCE_PATH);
}

// Verifies the Edison fork binary is present and matches the expected build.
// koishipro-core.js silently falls back to its bundled STOCK WASM when
// ./ocgcore-worker is absent, so without this check Edison rooms could run the
// unpatched core with no signal. Logs loudly by default; set
// EDISON_CORE_REQUIRED=true to make a missing/mismatched core a fatal boot error.
export async function verifyEdisonCore(logger: Logger): Promise<void> {
	const required = process.env.EDISON_CORE_REQUIRED === "true";
	const file = edisonCorePath();

	let actual: string;
	try {
		actual = createHash("sha256")
			.update(await readFile(file))
			.digest("hex");
	} catch {
		const message = `Edison ocgcore fork not found at ${file} — Edison rooms will run the STOCK core (koishipro-core.js fallback).`;
		if (required) {
			throw new Error(message);
		}
		logger.warn(`⚠️  ${message} Set EDISON_CORE_REQUIRED=true to make this fatal.`);
		return;
	}

	if (actual === EXPECTED_EDISON_CORE_SHA256) {
		logger.info(`🧩 Edison ocgcore fork active (sha256 ${actual.slice(0, 12)}…).`);
		return;
	}

	const message = `Edison ocgcore fork at ${file} has sha256 ${actual} but expected ${EXPECTED_EDISON_CORE_SHA256} — refusing to trust it.`;
	if (required) {
		throw new Error(message);
	}
	logger.warn(`⚠️  ${message} Edison rooms may not behave as expected.`);
}
