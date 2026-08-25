import { EventBus } from "@shared/event-bus/EventBus";
import { Logger } from "@shared/logger/domain/Logger";
import { DuelEventPayloads } from "@shared/room/domain/duel-events/DuelEventDispatcher";
import { DuelEventKind } from "@shared/room/domain/duel-events/DuelEvents";

import { config } from "src/config";

// Type-only import of the composition-root config shape — zero runtime coupling
// to src/config, so a plugin file never drags the real env-parsing module in.
export type AppConfig = typeof config;

/**
 * Subscription surface for the duel events a plugin declared in `duelEvents`.
 * Only present in the deps of a plugin that declares — the declaration is the
 * single source of what a plugin may observe, and subscribing to an undeclared
 * kind throws.
 */
export interface DuelEventSubscriptions {
	subscribe<K extends DuelEventKind>(
		kind: K,
		handler: (event: DuelEventPayloads[K]) => void | Promise<void>,
	): void;
}

export interface PluginDeps {
	readonly logger: Logger;
	readonly config: AppConfig;
	readonly duelEvents?: DuelEventSubscriptions;
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

	/**
	 * Duel-event kinds this plugin observes. Omit it and the plugin sees no
	 * duel events at all; declare it and deps.duelEvents.subscribe accepts
	 * exactly these kinds. Delivery is observe-only, queued off the duel's
	 * path, bounded, and disconnected per room on abuse (see
	 * DuelEventPluginHub).
	 */
	readonly duelEvents?: readonly DuelEventKind[];
}
