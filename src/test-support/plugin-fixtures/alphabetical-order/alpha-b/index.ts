import { makeTestPlugin } from "../../makeTestPlugin";
import { registrationOrder } from "../order";

export default makeTestPlugin({
	name: "alpha-b",
	register: () => {
		registrationOrder.push("alpha-b");
	},
});
