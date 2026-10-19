import { PREVIOUS_TOKEN_OVERLAP_MS, ReconnectionTokenIssuer } from "./ReconnectionTokenIssuer";
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
	beforeEach(() => {
		jest.useFakeTimers();
		TokenIndex.getInstance().clear();
	});
	afterEach(() => {
		jest.useRealTimers();
		TokenIndex.getInstance().clear();
	});

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
		it("registers a fresh token and keeps the previous one resolvable", () => {
			const client = makeClient();
			ReconnectionTokenIssuer.issue(client, 7);
			const oldToken = client.reconnectionToken!;

			ReconnectionTokenIssuer.rotate(client, 7);
			const newToken = client.reconnectionToken!;

			expect(newToken).not.toBe(oldToken);
			expect(TokenIndex.getInstance().find(newToken)).toEqual({
				client,
				roomId: 7,
			});
		});

		it("keeps the previous token resolvable to the same client and room during the overlap", () => {
			const client = makeClient();
			ReconnectionTokenIssuer.issue(client, 7);
			const oldToken = client.reconnectionToken!;

			ReconnectionTokenIssuer.rotate(client, 7);
			jest.advanceTimersByTime(PREVIOUS_TOKEN_OVERLAP_MS - 1);

			expect(ReconnectionTokenIssuer.resolve(oldToken, 7, () => true)).toBe(client);
		});

		it("unregisters the previous token once the overlap elapses", () => {
			const client = makeClient();
			ReconnectionTokenIssuer.issue(client, 7);
			const oldToken = client.reconnectionToken!;
			ReconnectionTokenIssuer.rotate(client, 7);
			const newToken = client.reconnectionToken!;

			jest.advanceTimersByTime(PREVIOUS_TOKEN_OVERLAP_MS);

			expect(TokenIndex.getInstance().find(oldToken)).toBeUndefined();
			expect(TokenIndex.getInstance().find(newToken)).toBeDefined();
			expect(jest.getTimerCount()).toBe(0);
		});

		it("keeps only the latest demoted token as previous when rotating twice", () => {
			const client = makeClient();
			ReconnectionTokenIssuer.issue(client, 7);
			const first = client.reconnectionToken!;
			ReconnectionTokenIssuer.rotate(client, 7);
			const second = client.reconnectionToken!;
			ReconnectionTokenIssuer.rotate(client, 7);
			const third = client.reconnectionToken!;

			expect(TokenIndex.getInstance().find(first)).toBeUndefined();
			expect(TokenIndex.getInstance().find(second)).toBeDefined();
			expect(TokenIndex.getInstance().find(third)).toBeDefined();
			expect(jest.getTimerCount()).toBe(1);

			jest.advanceTimersByTime(PREVIOUS_TOKEN_OVERLAP_MS);

			expect(TokenIndex.getInstance().find(second)).toBeUndefined();
			expect(TokenIndex.getInstance().find(third)).toBeDefined();
			expect(jest.getTimerCount()).toBe(0);
		});

		it("cancels the superseded overlap timer so it cannot fire later", () => {
			const client = makeClient();
			ReconnectionTokenIssuer.issue(client, 7);
			ReconnectionTokenIssuer.rotate(client, 7);
			const demoted = client.reconnectionToken!;
			jest.advanceTimersByTime(PREVIOUS_TOKEN_OVERLAP_MS / 2);
			ReconnectionTokenIssuer.rotate(client, 7);
			const current = client.reconnectionToken!;

			expect(jest.getTimerCount()).toBe(1);

			jest.advanceTimersByTime(PREVIOUS_TOKEN_OVERLAP_MS / 2);

			expect(TokenIndex.getInstance().find(current)).toBeDefined();
			expect(TokenIndex.getInstance().find(demoted)).toBeDefined();
			expect(jest.getTimerCount()).toBe(1);

			jest.advanceTimersByTime(PREVIOUS_TOKEN_OVERLAP_MS / 2);

			expect(TokenIndex.getInstance().find(demoted)).toBeUndefined();
			expect(jest.getTimerCount()).toBe(0);
		});

		describe("when the client presents the overlapping previous token", () => {
			const setup = () => {
				const client = makeClient();
				ReconnectionTokenIssuer.issue(client, 7);
				const held = client.reconnectionToken!;
				ReconnectionTokenIssuer.rotate(client, 7, held);
				const undelivered = client.reconnectionToken!;
				return { client, held, undelivered };
			};

			it("keeps the presented token as previous and drops the undelivered current one", () => {
				const { client, held, undelivered } = setup();

				ReconnectionTokenIssuer.rotate(client, 7, held);
				const fresh = client.reconnectionToken!;

				expect(fresh).not.toBe(undelivered);
				expect(TokenIndex.getInstance().find(held)).toEqual({ client, roomId: 7 });
				expect(TokenIndex.getInstance().find(undelivered)).toBeUndefined();
				expect(TokenIndex.getInstance().find(fresh)).toEqual({ client, roomId: 7 });
				expect(jest.getTimerCount()).toBe(1);
			});

			it("restarts the overlap window for the presented token", () => {
				const { client, held } = setup();
				jest.advanceTimersByTime(PREVIOUS_TOKEN_OVERLAP_MS - 1);

				ReconnectionTokenIssuer.rotate(client, 7, held);
				jest.advanceTimersByTime(PREVIOUS_TOKEN_OVERLAP_MS - 1);

				expect(ReconnectionTokenIssuer.resolve(held, 7, () => true)).toBe(client);

				jest.advanceTimersByTime(1);

				expect(TokenIndex.getInstance().find(held)).toBeUndefined();
				expect(jest.getTimerCount()).toBe(0);
			});

			it("survives a second drop before the fresh token is delivered", () => {
				const { client, held } = setup();
				ReconnectionTokenIssuer.rotate(client, 7, held);

				expect(ReconnectionTokenIssuer.resolve(held, 7, () => true)).toBe(client);
			});

			it("revoke still drops everything", () => {
				const { client, held } = setup();
				ReconnectionTokenIssuer.rotate(client, 7, held);
				const fresh = client.reconnectionToken!;

				ReconnectionTokenIssuer.revoke(client);

				expect(TokenIndex.getInstance().find(held)).toBeUndefined();
				expect(TokenIndex.getInstance().find(fresh)).toBeUndefined();
				expect(jest.getTimerCount()).toBe(0);
			});
		});

		it("demotes the current token when the presented one is the current token", () => {
			const client = makeClient();
			ReconnectionTokenIssuer.issue(client, 7);
			const current = client.reconnectionToken!;

			ReconnectionTokenIssuer.rotate(client, 7, current);

			expect(TokenIndex.getInstance().find(current)).toBeDefined();
			expect(client.reconnectionToken).not.toBe(current);
			expect(jest.getTimerCount()).toBe(1);
		});

		it("issues even when the client has no previous token", () => {
			const client = makeClient();

			ReconnectionTokenIssuer.rotate(client, 3);

			expect(client.reconnectionToken).toMatch(/^[0-9a-f]{32}$/);
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

		it("also unregisters an overlapping previous token and cancels its timer", () => {
			const client = makeClient();
			ReconnectionTokenIssuer.issue(client, 5);
			const oldToken = client.reconnectionToken!;
			ReconnectionTokenIssuer.rotate(client, 5);
			const newToken = client.reconnectionToken!;

			ReconnectionTokenIssuer.revoke(client);

			expect(TokenIndex.getInstance().find(oldToken)).toBeUndefined();
			expect(TokenIndex.getInstance().find(newToken)).toBeUndefined();
			expect(jest.getTimerCount()).toBe(0);
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
