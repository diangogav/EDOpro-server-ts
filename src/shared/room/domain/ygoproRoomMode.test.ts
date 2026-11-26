import { ygoproRoomMode } from "@shared/room/domain/ygoproRoomMode";

describe("ygoproRoomMode", () => {
	it("reads a 1v1 room of one duel as a single duel", () => {
		expect(ygoproRoomMode(1, 1, 1)).toBe(0);
	});

	it("reads a 1v1 best-of-three room as a match", () => {
		expect(ygoproRoomMode(1, 1, 3)).toBe(1);
	});

	it("reads a room with two duelists per team as tag, whatever its best of", () => {
		expect(ygoproRoomMode(2, 2, 1)).toBe(2);
		expect(ygoproRoomMode(2, 2, 3)).toBe(2);
	});
});
