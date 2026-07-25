import { ISocket } from "../../socket/domain/ISocket";
import { YgoClient } from "./YgoClient";

// YgoClient has no abstract members — a trivial concrete subclass is enough to
// exercise the emote rate-limit gate.
class TestClient extends YgoClient {}

function makeClient(): TestClient {
	const socket = { remoteAddress: "::1" } as unknown as ISocket;
	return new TestClient({ name: "P", position: 0, team: 0, socket, host: true, id: null });
}

describe("YgoClient.tryEmote — rate limit", () => {
	const COOLDOWN = 2500;

	it("allows the first emote", () => {
		expect(makeClient().tryEmote(1000, COOLDOWN)).toBe(true);
	});

	it("blocks a second emote inside the cooldown window", () => {
		const client = makeClient();
		expect(client.tryEmote(1000, COOLDOWN)).toBe(true);
		expect(client.tryEmote(1000 + COOLDOWN - 1, COOLDOWN)).toBe(false);
	});

	it("allows again once the cooldown has elapsed", () => {
		const client = makeClient();
		expect(client.tryEmote(1000, COOLDOWN)).toBe(true);
		expect(client.tryEmote(1000 + COOLDOWN, COOLDOWN)).toBe(true);
	});

	it("does not advance the window on a blocked attempt", () => {
		const client = makeClient();
		expect(client.tryEmote(1000, COOLDOWN)).toBe(true);
		// Blocked at t=2000 must NOT reset the clock; t=3500 is still >= 1000+2500.
		expect(client.tryEmote(2000, COOLDOWN)).toBe(false);
		expect(client.tryEmote(3500, COOLDOWN)).toBe(true);
	});
});
