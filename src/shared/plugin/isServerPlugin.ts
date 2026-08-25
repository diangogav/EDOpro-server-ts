import { DUEL_EVENT_KINDS } from "@shared/room/domain/duel-events/DuelEvents";

import { ServerPlugin } from "./ServerPlugin";

// Runtime guard used by bootstrapPlugins() to reject any dynamically-imported
// module whose default export does not match the ServerPlugin contract.
export function isServerPlugin(value: unknown): value is ServerPlugin {
	if (typeof value !== "object" || value === null) {
		return false;
	}

	const candidate = value as Record<string, unknown>;

	return (
		typeof candidate.name === "string" &&
		typeof candidate.enabled === "function" &&
		typeof candidate.register === "function" &&
		hasValidDuelEventsDeclaration(candidate.duelEvents)
	);
}

function hasValidDuelEventsDeclaration(duelEvents: unknown): boolean {
	if (duelEvents === undefined) {
		return true;
	}

	return (
		Array.isArray(duelEvents) &&
		duelEvents.every((kind) => (DUEL_EVENT_KINDS as readonly string[]).includes(kind as string))
	);
}
