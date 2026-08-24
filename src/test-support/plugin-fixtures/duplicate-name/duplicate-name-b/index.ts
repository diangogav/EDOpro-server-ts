import { makeTestPlugin } from "../../makeTestPlugin";

// Alphabetically second of the two folders sharing the name "dup-name" —
// bootstrapPlugins must skip this one (a private clone must not shadow a
// public plugin).
export default makeTestPlugin({
	name: "dup-name",
	register: () => {
		throw new Error("duplicate-name-b: register() must never be called — it must be skipped");
	},
});
