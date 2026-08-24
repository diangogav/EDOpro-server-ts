import { ServerPlugin } from "@shared/plugin/ServerPlugin";

// Shared factory for plugin-fixture default exports — keeps every fixture
// under src/test-support/plugin-fixtures/ down to its one distinguishing
// field instead of repeating the full ServerPlugin object shape.
export function makeTestPlugin(
	overrides: Partial<ServerPlugin> & Pick<ServerPlugin, "name">,
): ServerPlugin {
	return {
		enabled: () => true,
		register: () => undefined,
		...overrides,
	};
}
