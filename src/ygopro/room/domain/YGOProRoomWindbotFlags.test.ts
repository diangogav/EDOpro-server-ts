/**
 * Tests for windbot-specific flags added to YGOProRoom.
 * noHost, noReconnect, windbot? flags.
 * finalizing flag — defaults false, flips true on teardown.
 */

import { YGOProRoomMother } from "@test-support/mothers/room/YGOProRoomMother";

const createRoom = () => YGOProRoomMother.create();

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

	describe("finalizing (REQ-HTTP-402)", () => {
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
