import { parseBanListEntry } from "./parseBanListEntry";

describe("parseBanListEntry", () => {
	it("parses a standard two-column entry", () => {
		expect(parseBanListEntry("88264978 0")).toEqual({
			code: 88264978,
			limit: 0,
			points: undefined,
		});
	});

	it("parses a Genesys three-column entry with points", () => {
		expect(parseBanListEntry("21044178 3 100")).toEqual({
			code: 21044178,
			limit: 3,
			points: 100,
		});
	});

	it("ignores a trailing name comment as points", () => {
		expect(parseBanListEntry("21044178 0 --Abyss Dweller")).toEqual({
			code: 21044178,
			limit: 0,
			points: undefined,
		});
	});

	it("tolerates extra whitespace between columns", () => {
		expect(parseBanListEntry("  21044178   3   50  ")).toEqual({
			code: 21044178,
			limit: 3,
			points: 50,
		});
	});

	it.each([
		"",
		"   ",
		"#comment",
		"!Genesys",
		"$whitelist",
		"-12345 0",
	])("returns null for non-entry line %p", (line) => {
		expect(parseBanListEntry(line)).toBeNull();
	});
});
