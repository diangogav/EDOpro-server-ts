import { makeTestPlugin } from "../../makeTestPlugin";
import { registerCalls } from "./capture";

export default makeTestPlugin({
	name: "valid-plugin",
	register: (bus, deps) => {
		registerCalls.push({ bus, deps });
		bus.subscribe("PLUGIN_FIXTURE_EVENT", { handle: () => undefined });
	},
});
