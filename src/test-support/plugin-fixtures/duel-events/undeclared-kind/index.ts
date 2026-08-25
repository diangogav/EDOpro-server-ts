import { makeTestPlugin } from "../../makeTestPlugin";

// Declares only duel.damage but subscribes to duel.turn-start: the scoped
// subscription surface must reject it and the loader must report the plugin
// as failed.
export default makeTestPlugin({
	name: "undeclared-kind",
	duelEvents: ["duel.damage"],
	register: (_bus, deps) => {
		deps.duelEvents?.subscribe("duel.turn-start", () => undefined);
	},
});
