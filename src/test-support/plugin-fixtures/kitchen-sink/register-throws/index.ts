import { makeTestPlugin } from "../../makeTestPlugin";

export default makeTestPlugin({
	name: "register-throws",
	register: () => {
		throw new Error("register-throws: simulated register() failure");
	},
});
