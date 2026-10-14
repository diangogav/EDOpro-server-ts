import { lobbyMetadata } from "./LobbyMetadata";

describe("lobbyMetadata", () => {
	it("encodes only the version and public instance identity", () => {
		const frame = lobbyMetadata("AbCd0123-_efGH45");
		expect(frame).toEqual(
			Buffer.concat([Buffer.from([18, 0, 0xf2, 1]), Buffer.from("AbCd0123-_efGH45")]),
		);
	});
	it.each([
		"",
		"short",
		"a".repeat(17),
		"a".repeat(15) + "#",
	])("rejects invalid identity %j", (id) => {
		expect(() => lobbyMetadata(id)).toThrow();
	});
});
