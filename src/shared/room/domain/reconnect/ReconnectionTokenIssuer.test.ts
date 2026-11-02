import { ReconnectionTokenClientMessage } from "@shared/messages/server-to-client/ReconnectionTokenClientMessage";
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
		clearReconnectionToken: jest.fn(() => {
			token = null;
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

	describe("resend", () => {
		it("re-sends the same token and keeps it registered", () => {
			const client = makeClient();
			ReconnectionTokenIssuer.issue(client, 7);
			const token = client.reconnectionToken!;

			const frame = ReconnectionTokenIssuer.resend(client, 7);

			expect(frame).toEqual(ReconnectionTokenClientMessage.create(token));
			expect(client.reconnectionToken).toBe(token);
			expect(TokenIndex.getInstance().find(token)).toEqual({
				client,
				roomId: 7,
			});
		});

		it("returns the same frame on every call", () => {
			const client = makeClient();
			ReconnectionTokenIssuer.issue(client, 7);

			expect(ReconnectionTokenIssuer.resend(client, 7)).toEqual(
				ReconnectionTokenIssuer.resend(client, 7),
			);
		});

		it("issues when the client has no token yet", () => {
			const client = makeClient();

			ReconnectionTokenIssuer.resend(client, 3);

			expect(client.reconnectionToken).toMatch(/^[0-9a-f]{32}$/);
			expect(TokenIndex.getInstance().find(client.reconnectionToken!)).toEqual({
				client,
				roomId: 3,
			});
		});
	});

	describe("revoke", () => {
		it("unregisters the client's token from the index and clears it on the client", () => {
			const client = makeClient();
			ReconnectionTokenIssuer.issue(client, 5);
			const token = client.reconnectionToken!;
			expect(TokenIndex.getInstance().find(token)).toBeDefined();

			ReconnectionTokenIssuer.revoke(client);

			expect(TokenIndex.getInstance().find(token)).toBeUndefined();
			expect(client.reconnectionToken).toBeNull();
		});

		it("is a no-op when the client has no token", () => {
			const client = makeClient();

			expect(() => ReconnectionTokenIssuer.revoke(client)).not.toThrow();
			expect(client.reconnectionToken).toBeNull();
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
