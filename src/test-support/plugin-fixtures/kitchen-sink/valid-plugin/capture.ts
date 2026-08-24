import type { EventBus } from "@shared/event-bus/EventBus";
import type { PluginDeps } from "@shared/plugin/ServerPlugin";

interface RegisterCall {
	bus: EventBus;
	deps: PluginDeps;
}

// Records every register() invocation so the bootstrapPlugins test suite can
// assert the exact bus/deps identity it was called with.
export const registerCalls: RegisterCall[] = [];

export function resetRegisterCalls(): void {
	registerCalls.length = 0;
}
