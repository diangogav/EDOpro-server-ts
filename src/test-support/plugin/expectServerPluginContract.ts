import { isServerPlugin } from "@shared/plugin/isServerPlugin";
import { ServerPlugin } from "@shared/plugin/ServerPlugin";

/**
 * Shared conformance assertion for plugin modules (src/plugins/<name>/index.ts).
 * Call this from a plugin's own test suite instead of hand-rolling shape
 * assertions — it fails the test with a jest assertion error when the plugin
 * does not conform to the ServerPlugin contract.
 */
export function expectServerPluginContract(plugin: unknown): asserts plugin is ServerPlugin {
	expect(isServerPlugin(plugin)).toBe(true);

	const candidate = plugin as ServerPlugin;
	expect(candidate.name.length).toBeGreaterThan(0);
}
