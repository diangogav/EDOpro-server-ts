import { YgoClient } from "@shared/client/domain/YgoClient";

import { isNameTaken } from "./isNameTaken";

const player = (name: string): YgoClient => ({ name }) as unknown as YgoClient;

describe("isNameTaken", () => {
	it("is true when a player with that name is already in the room", () => {
		expect(isNameTaken([player("Jaden"), player("Yugi")], "Jaden")).toBe(true);
	});

	it("is false when no player has that name", () => {
		expect(isNameTaken([player("Yugi")], "Jaden")).toBe(false);
	});

	it("is false for an empty room", () => {
		expect(isNameTaken([], "Jaden")).toBe(false);
	});
});
