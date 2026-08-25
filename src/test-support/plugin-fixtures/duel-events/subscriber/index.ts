import { makeTestPlugin } from "../../makeTestPlugin";
import { receivedEvents } from "./capture";

// Declares duel.damage and subscribes to it through the scoped deps surface.
export default makeTestPlugin({
	name: "subscriber",
	duelEvents: ["duel.damage"],
	register: (_bus, deps) => {
		deps.duelEvents?.subscribe("duel.damage", (event) => {
			receivedEvents.push(event);
		});
	},
});
