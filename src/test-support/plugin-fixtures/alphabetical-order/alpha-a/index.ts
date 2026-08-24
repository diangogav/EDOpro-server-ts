import { makeTestPlugin } from "../../makeTestPlugin";
import { registrationOrder } from "../order";

export default makeTestPlugin({
	name: "alpha-a",
	register: () => {
		registrationOrder.push("alpha-a");
	},
});
