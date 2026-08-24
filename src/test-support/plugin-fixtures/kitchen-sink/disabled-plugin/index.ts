import { makeTestPlugin } from "../../makeTestPlugin";

export default makeTestPlugin({
	name: "disabled-plugin",
	enabled: () => false,
	register: () => {
		throw new Error("disabled-plugin: register() must never be called when enabled() is false");
	},
});
