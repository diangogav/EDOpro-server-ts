import fs from "node:fs/promises";
import path from "node:path";

import { EventBus } from "@shared/event-bus/EventBus";
import { isServerPlugin } from "@shared/plugin/isServerPlugin";
import { PluginDeps } from "@shared/plugin/ServerPlugin";

export interface PluginBootstrapReport {
	loaded: string[];
	skipped: string[];
	failed: string[];
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && "code" in error;
}

// Discovers and registers plugins from pluginsRoot (D5/D8): only direct
// child directories are scanned (no recursion), dot/underscore-prefixed
// names are skipped, ordering is deterministic, and every per-entry failure
// is caught so one broken plugin never blocks the rest. A missing or
// unreadable root degrades to an empty report instead of aborting boot.
export async function bootstrapPlugins(
	bus: EventBus,
	deps: PluginDeps,
	pluginsRoot: string = path.join(__dirname, "..", "plugins"),
): Promise<PluginBootstrapReport> {
	const report: PluginBootstrapReport = { loaded: [], skipped: [], failed: [] };

	let entries: import("node:fs").Dirent[];
	try {
		entries = await fs.readdir(pluginsRoot, { withFileTypes: true, encoding: "utf8" });
	} catch (error) {
		if (isErrnoException(error) && error.code === "ENOENT") {
			return report;
		}
		deps.logger.error(error instanceof Error ? error : String(error), { pluginsRoot });
		return report;
	}

	const dirNames = entries
		.filter(
			(entry) => entry.isDirectory() && !entry.name.startsWith(".") && !entry.name.startsWith("_"),
		)
		.map((entry) => entry.name)
		.sort((a, b) => a.localeCompare(b));

	const seenNames = new Set<string>();

	for (const dirName of dirNames) {
		try {
			const modulePath = path.join(pluginsRoot, dirName);
			const imported = await import(modulePath);
			const candidate = imported?.default;

			if (!isServerPlugin(candidate)) {
				deps.logger.warn(`Plugin folder "${dirName}" does not export a conformant ServerPlugin`, {
					dirName,
				});
				report.skipped.push(dirName);
				continue;
			}

			if (seenNames.has(candidate.name)) {
				deps.logger.warn(
					`Duplicate plugin name "${candidate.name}" — skipping folder "${dirName}"`,
					{
						dirName,
						name: candidate.name,
					},
				);
				report.skipped.push(dirName);
				continue;
			}
			seenNames.add(candidate.name);

			if (!candidate.enabled(deps.config)) {
				report.skipped.push(candidate.name);
				continue;
			}

			await candidate.register(bus, deps);
			report.loaded.push(candidate.name);
		} catch (error) {
			deps.logger.error(error instanceof Error ? error : String(error), { dirName });
			report.failed.push(dirName);
		}
	}

	return report;
}
