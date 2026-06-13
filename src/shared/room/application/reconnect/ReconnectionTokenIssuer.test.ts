import { ReconnectionTokenIssuer } from "./ReconnectionTokenIssuer";
import { TokenIndex } from "@shared/room/domain/TokenIndex";
import { YgoClient } from "@shared/client/domain/YgoClient";

const makeClient = (name = "P"): YgoClient => {
	let token: string | null = null;
	return {
		name,
		setReconnectionToken: jest.fn((value: string) => {
			token = value;
		}),
		get reconnectionToken() {
			return token;
		},
	} as unknown as YgoClient;
};

describe("ReconnectionTokenIssuer", () => {
	beforeEach(() => TokenIndex.getInstance().clear());
	afterEach(() => TokenIndex.getInstance().clear());

	describe("issue", () => {
		it("mints a 32-hex token, stores it on the client and registers it", () => {
			const client = makeClient("Alice");

			ReconnectionTokenIssuer.issue(client, 42);

			const token = client.reconnectionToken!;
			expect(token).toMatch(/^[0-9a-f]{32}$/);
			expect(client.setReconnectionToken).toHaveBeenCalledWith(token);
			expect(TokenIndex.getInstance().find(token)).toEqual({
				client,
				roomId: 42,
			});
		});

		it("returns a valid ReconnectionTokenClientMessage frame", () => {
			const client = makeClient();

			const message = ReconnectionTokenIssuer.issue(client, 1);

			const token = client.reconnectionToken!;
			expect(message.readUInt8(2)).toBe(0xfd);
			expect(message.subarray(3).toString("utf8")).toBe(token);
		});
	});

	describe("rotate", () => {
		it("invalidates the previous token and registers a fresh one", () => {
			const client = makeClient();
			ReconnectionTokenIssuer.issue(client, 7);
			const oldToken = client.reconnectionToken!;

			ReconnectionTokenIssuer.rotate(client, 7);
			const newToken = client.reconnectionToken!;

			expect(newToken).not.toBe(oldToken);
			expect(TokenIndex.getInstance().find(oldToken)).toBeUndefined();
			expect(TokenIndex.getInstance().find(newToken)).toEqual({
				client,
				roomId: 7,
			});
		});

		it("issues even when the client has no previous token", () => {
			const client = makeClient();

			ReconnectionTokenIssuer.rotate(client, 3);

			expect(client.reconnectionToken).toMatch(/^[0-9a-f]{32}$/);
		});
	});

	describe("resolve", () => {
		const guardTrue = () => true;

		it("returns the client for a matching token + room + guard", () => {
			const client = makeClient();
			ReconnectionTokenIssuer.issue(client, 9);
			const token = client.reconnectionToken!;

			expect(ReconnectionTokenIssuer.resolve(token, 9, guardTrue)).toBe(client);
		});

		it("returns null for an unknown token", () => {
			expect(ReconnectionTokenIssuer.resolve("ghost", 1, guardTrue)).toBeNull();
		});

		it("returns null when the room id does not match", () => {
			const client = makeClient();
			ReconnectionTokenIssuer.issue(client, 9);
			const token = client.reconnectionToken!;

			expect(ReconnectionTokenIssuer.resolve(token, 10, guardTrue)).toBeNull();
		});

		it("returns null when the client-type guard rejects", () => {
			const client = makeClient();
			ReconnectionTokenIssuer.issue(client, 9);
			const token = client.reconnectionToken!;

			expect(ReconnectionTokenIssuer.resolve(token, 9, () => false)).toBeNull();
		});
	});
});
