/**
 * Tests for windbot-specific flags added to YGOProRoom in PR-4 and PR-5.
 * REQ-ROOM-501: noHost, noReconnect, windbot? flags.
 * REQ-HTTP-402 (PR-5): finalizing flag — defaults false, flips true on teardown.
 */

import { EventEmitter } from "stream";

import { YGOProRoom } from "./YGOProRoom";

const makeLogger = () => ({
	child: jest.fn().mockReturnThis(),
	info: jest.fn(),
	warn: jest.fn(),
	error: jest.fn(),
	debug: jest.fn(),
});

const makeMessageRepo = () => ({
	joinGameMessage: jest.fn().mockReturnValue(Buffer.alloc(0)),
	typeChangeMessage: jest.fn().mockReturnValue(Buffer.alloc(0)),
	playerEnterMessage: jest.fn().mockReturnValue(Buffer.alloc(0)),
	playerChangeMessage: jest.fn().mockReturnValue(Buffer.alloc(0)),
	spectatorCountMessage: jest.fn().mockReturnValue(Buffer.alloc(0)),
	errorMessage: jest.fn().mockReturnValue(Buffer.alloc(0)),
});

const createRoom = (): YGOProRoom =>
	YGOProRoom.create(
		1,
		"TESTROOM",
		makeLogger() as never,
		new EventEmitter(),
		{ name: "TestPlayer", password: "", previousMessage: Buffer.alloc(0) } as never,
		"sock-test",
		makeMessageRepo() as never,
	);

describe("YGOProRoom windbot flags", () => {
	describe("defaults (non-windbot rooms)", () => {
		it("noHost defaults to false", () => {
			const room = createRoom();
			expect(room.noHost).toBe(false);
		});

		it("noReconnect defaults to false", () => {
			const room = createRoom();
			expect(room.noReconnect).toBe(false);
		});

		it("windbot is undefined by default", () => {
			const room = createRoom();
			expect(room.windbot).toBeUndefined();
		});
	});

	describe("setters", () => {
		it("noHost can be set to true", () => {
			const room = createRoom();
			room.noHost = true;
			expect(room.noHost).toBe(true);
		});

		it("noReconnect can be set to true", () => {
			const room = createRoom();
			room.noReconnect = true;
			expect(room.noReconnect).toBe(true);
		});

		it("windbot can be set with name and deck", () => {
			const room = createRoom();
			room.windbot = { name: "Anna", deck: "Anna.ydk" };
			expect(room.windbot?.name).toBe("Anna");
			expect(room.windbot?.deck).toBe("Anna.ydk");
		});
	});

	describe("finalizing (PR-5 — REQ-HTTP-402)", () => {
		it("finalizing defaults to false", () => {
			const room = createRoom();
			expect(room.finalizing).toBe(false);
		});

		it("finalizing can be set to true", () => {
			const room = createRoom();
			room.finalizing = true;
			expect(room.finalizing).toBe(true);
		});
	});
});
