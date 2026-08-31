import { makeTestPlugin } from "../../makeTestPlugin";
import { startedCalls } from "./capture";

// Declares one match lifecycle hook without subscribing to the event bus —
// proves bootstrapPlugins() wires ServerPlugin.lifecycleHooks into the
// shared MatchLifecycleHooks runner independently of register().
export default makeTestPlugin({
	name: "lifecycle-provider",
	lifecycleHooks: [
		{
			name: "lifecycle-provider-hook",
			onMatchStarted: async () => {
				startedCalls.push("started");
			},
		},
	],
});
