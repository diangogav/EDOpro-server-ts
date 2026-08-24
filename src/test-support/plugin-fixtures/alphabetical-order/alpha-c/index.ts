import { makeTestPlugin } from "../../makeTestPlugin";
import { registrationOrder } from "../order";

export default makeTestPlugin({
	name: "alpha-c",
	register: () => {
		registrationOrder.push("alpha-c");
	},
});
