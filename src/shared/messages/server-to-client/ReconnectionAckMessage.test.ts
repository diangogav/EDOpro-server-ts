import { ReconnectionAckMessage } from "./ReconnectionAckMessage";

// Pins the express-reconnect acknowledgement wire format: [2b size LE][0xfd][status].
describe("ReconnectionAckMessage", () => {
	it("builds the success frame [02 00 fd 00]", () => {
		expect(ReconnectionAckMessage.success().toString("hex")).toBe("0200fd00");
	});

	it("builds the failure frame [02 00 fd 01]", () => {
		expect(ReconnectionAckMessage.failure().toString("hex")).toBe("0200fd01");
	});
});
