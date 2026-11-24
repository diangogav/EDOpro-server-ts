import { ISocket } from "../../socket/domain/ISocket";
import { YgoClient } from "./YgoClient";

class TestClient extends YgoClient {}

function makeClient(): TestClient {
	const socket = { remoteAddress: "::1" } as unknown as ISocket;
	return new TestClient({ name: "P", position: 0, team: 0, socket, host: true, id: null });
}

describe("YgoClient.accountVerification", () => {
	it("resolves false until a verification is set", async () => {
		await expect(makeClient().accountVerification).resolves.toBe(false);
	});

	it("resolves the value of the verification set at admission", async () => {
		const client = makeClient();

		client.setAccountVerification(Promise.resolve(true));

		await expect(client.accountVerification).resolves.toBe(true);
	});

	it("keeps the client id unchanged", () => {
		const client = makeClient();

		client.setAccountVerification(Promise.resolve(true));

		expect(client.id).toBeNull();
	});
});
