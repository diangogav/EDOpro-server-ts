import { EventBus } from "@shared/event-bus/EventBus";
import { Logger } from "@shared/logger/domain/Logger";

import { config } from "src/config";

// Type-only import of the composition-root config shape — zero runtime coupling
// to src/config, so a plugin file never drags the real env-parsing module in.
export type AppConfig = typeof config;

export interface PluginDeps {
	readonly logger: Logger;
	readonly config: AppConfig;
}

/**
 * Contract every module under src/plugins/<name>/index.ts must export as its
 * default export. bootstrapPlugins() dynamically imports each plugin folder,
 * validates the module's default export with isServerPlugin(), gates on
 * enabled(config), and calls register(bus, deps) only when enabled.
 */
export interface ServerPlugin {
	readonly name: string;
	enabled(config: AppConfig): boolean;
	register(bus: EventBus, deps: PluginDeps): void | Promise<void>;
}
