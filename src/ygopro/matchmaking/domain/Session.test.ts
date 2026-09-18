import { faker } from "@faker-js/faker";
import { SocketMock } from "@test-support/mocks/socket/SocketMock";

import { Session } from "./Session";

describe("Session", () => {
	describe("authenticate", () => {
		it("stamps the socket's resolvedUserId and becomes authenticated", () => {
			const socket = new SocketMock();
			const session = new Session(socket);
			const userId = faker.string.uuid();

			session.authenticate(userId);

			expect(socket.resolvedUserId).toBe(userId);
			expect(session.isAuthenticated).toBe(true);
		});

		it("rejects a second authenticate call and keeps the first identity", () => {
			const socket = new SocketMock();
			const session = new Session(socket);
			const firstUserId = faker.string.uuid();
			const secondUserId = faker.string.uuid();

			session.authenticate(firstUserId);

			expect(() => session.authenticate(secondUserId)).toThrow();
			expect(socket.resolvedUserId).toBe(firstUserId);
		});
	});

	describe("displayName", () => {
		it("is null before authentication", () => {
			const session = new Session(new SocketMock());

			expect(session.displayName).toBeNull();
		});

		it("exposes the display name resolved at authentication", () => {
			const session = new Session(new SocketMock());
			const userId = faker.string.uuid();
			const displayName = faker.person.firstName();

			session.authenticate(userId, displayName);

			expect(session.displayName).toBe(displayName);
		});

		it("stays null when authenticated with no resolvable display name", () => {
			const session = new Session(new SocketMock());

			session.authenticate(faker.string.uuid());

			expect(session.displayName).toBeNull();
		});
	});

	describe("playerInfo", () => {
		it("is null before any PLAYER_INFO body is captured", () => {
			const session = new Session(new SocketMock());

			expect(session.playerInfo).toBeNull();
		});

		it("exposes the parsed name from the captured PLAYER_INFO body", () => {
			const session = new Session(new SocketMock());
			const body = Buffer.from("Player1", "utf16le");

			session.capturePlayerInfo(body);

			expect(session.playerInfo?.name).toBe("Player1");
		});
	});

	describe("capturePlayerInfo", () => {
		it("stores an independent copy, unaffected by later mutation of the source buffer", () => {
			const session = new Session(new SocketMock());
			const body = Buffer.from("Player1", "utf16le");

			session.capturePlayerInfo(body);
			body.fill(0);

			expect(session.playerInfo?.name).toBe("Player1");
		});
	});

	describe("queueState", () => {
		it("defaults to idle", () => {
			const session = new Session(new SocketMock());

			expect(session.queueState).toBe("idle");
		});
	});
});
