import { RankGroupDefinition } from "./RankGroupConfig";
import {
	currentListsFor,
	memberMatches,
	parseBanListDatePrefix,
	resolveAlias,
	resolveGroupsFor,
} from "./RankGroupResolution";

const aliases = {
	JTP: "JTP (Original)",
	"2011.09 Tengu Plant": "2011.09 Tengu",
};

describe("resolveAlias", () => {
	it("maps an aliased name to its canonical rank name", () => {
		expect(resolveAlias("JTP", aliases)).toBe("JTP (Original)");
		expect(resolveAlias("2011.09 Tengu Plant", aliases)).toBe("2011.09 Tengu");
	});

	it("passes an unmapped name through unchanged", () => {
		expect(resolveAlias("2026.05 TCG", aliases)).toBe("2026.05 TCG");
		expect(resolveAlias("RD", aliases)).toBe("RD");
	});

	it("passes everything through when there are no aliases", () => {
		expect(resolveAlias("JTP", {})).toBe("JTP");
	});
});

describe("memberMatches", () => {
	it('matches a "* X" member against any name ending in " X"', () => {
		expect(memberMatches("2026.05 TCG", "* TCG")).toBe(true);
		expect(memberMatches("2025.10 Rush Duel", "* Rush Duel")).toBe(true);
	});

	it('does not match "* X" against the bare suffix without a preceding space', () => {
		expect(memberMatches("TCG", "* TCG")).toBe(false);
	});

	it('does not match "* X" against a different suffix', () => {
		expect(memberMatches("2026.05 OCG", "* TCG")).toBe(false);
		expect(memberMatches("2026.05 TCG Beta", "* TCG")).toBe(false);
	});

	it("matches a plain member only exactly", () => {
		expect(memberMatches("RD", "RD")).toBe(true);
		expect(memberMatches("2025.10 RD", "RD")).toBe(false);
		expect(memberMatches("RD Extra", "RD")).toBe(false);
	});
});

describe("parseBanListDatePrefix", () => {
	it("parses a leading YYYY.MM prefix, defaulting the day to 1", () => {
		expect(parseBanListDatePrefix("2026.05 TCG")).toEqual({ year: 2026, month: 5, day: 1 });
	});

	it("parses a leading YYYY.MM.DD prefix", () => {
		expect(parseBanListDatePrefix("2010.03.15 Edison")).toEqual({
			year: 2010,
			month: 3,
			day: 15,
		});
	});

	it("parses a name that is only a date", () => {
		expect(parseBanListDatePrefix("2026.05")).toEqual({ year: 2026, month: 5, day: 1 });
	});

	it("returns null for a name without a date prefix", () => {
		expect(parseBanListDatePrefix("RD")).toBeNull();
		expect(parseBanListDatePrefix("JTP (Original)")).toBeNull();
	});

	it("returns null when the date prefix is not followed by a break", () => {
		expect(parseBanListDatePrefix("2026.05TCG")).toBeNull();
	});

	it("returns null when the prefix is not zero-padded to the expected width", () => {
		expect(parseBanListDatePrefix("2026.5 TCG")).toBeNull();
	});
});

describe("resolveGroupsFor", () => {
	const groups: RankGroupDefinition[] = [
		{ name: "TCG", enabled: true, onlyCurrent: true, members: ["* TCG"] },
		{ name: "Rush", enabled: true, onlyCurrent: true, members: ["* Rush Duel", "RD"] },
		{ name: "Edison Forever", enabled: true, onlyCurrent: false, members: ["* Edison"] },
		{ name: "Disabled TCG", enabled: false, onlyCurrent: false, members: ["* TCG"] },
	];
	const loaded = [
		"2025.04 TCG",
		"2026.05 TCG",
		"2026.10 TCG",
		"2026.05 OCG",
		"RD",
		"2010.03 Edison",
		"2005.04 Edison",
	];
	const today = new Date(Date.UTC(2026, 5, 1)); // 2026-06-01

	it("resolves the current dated list of an onlyCurrent group, ignoring future-dated siblings", () => {
		expect(resolveGroupsFor("2026.05 TCG", groups, loaded, today)).toEqual(["TCG"]);
	});

	it("does not resolve a retro list into an onlyCurrent group", () => {
		expect(resolveGroupsFor("2025.04 TCG", groups, loaded, today)).toEqual([]);
	});

	it("does not resolve a future-dated list into an onlyCurrent group", () => {
		expect(resolveGroupsFor("2026.10 TCG", groups, loaded, today)).toEqual([]);
	});

	it("treats a dateless matching name as always current", () => {
		expect(resolveGroupsFor("RD", groups, loaded, today)).toEqual(["Rush"]);
	});

	it("resolves any matching member into a group that is not onlyCurrent", () => {
		expect(resolveGroupsFor("2010.03 Edison", groups, loaded, today)).toEqual(["Edison Forever"]);
		expect(resolveGroupsFor("2005.04 Edison", groups, loaded, today)).toEqual(["Edison Forever"]);
	});

	it("never resolves a disabled group", () => {
		const resolved = resolveGroupsFor("2026.05 TCG", groups, loaded, today);
		expect(resolved).not.toContain("Disabled TCG");
	});

	it('never resolves "N/A" or "Global" into any group', () => {
		expect(resolveGroupsFor("N/A", groups, loaded, today)).toEqual([]);
		expect(resolveGroupsFor("Global", groups, loaded, today)).toEqual([]);
	});

	it("resolves nothing for a name no member matches", () => {
		expect(resolveGroupsFor("JTP (Original)", groups, loaded, today)).toEqual([]);
	});

	it("treats a played list newer than every loaded sibling as current even if not loaded itself", () => {
		expect(resolveGroupsFor("2026.06 TCG", groups, loaded, today)).toEqual(["TCG"]);
	});

	it("treats a list dated exactly today as current", () => {
		const firstOfMay = new Date(Date.UTC(2026, 4, 1)); // 2026-05-01
		expect(resolveGroupsFor("2026.05 TCG", groups, loaded, firstOfMay)).toEqual(["TCG"]);
	});

	it("can resolve several groups at once", () => {
		const multi: RankGroupDefinition[] = [
			{ name: "TCG", enabled: true, onlyCurrent: true, members: ["* TCG"] },
			{ name: "All Formats", enabled: true, onlyCurrent: false, members: ["* TCG", "* OCG"] },
		];
		expect(resolveGroupsFor("2026.05 TCG", multi, loaded, today)).toEqual(["TCG", "All Formats"]);
	});
});

describe("currentListsFor", () => {
	const tcg: RankGroupDefinition = {
		name: "TCG",
		enabled: true,
		onlyCurrent: true,
		members: ["* TCG"],
	};
	const rush: RankGroupDefinition = {
		name: "Rush",
		enabled: true,
		onlyCurrent: true,
		members: ["* Rush Duel", "RD"],
	};
	const loaded = [
		"2025.04 TCG",
		"2026.05 TCG",
		"2026.10 TCG",
		"2026.05 OCG",
		"2026.07.01 Rush Duel",
		"RD",
	];
	const today = new Date(Date.UTC(2026, 7, 1)); // 2026-08-01

	it("collects every loaded name matching a member as matched", () => {
		expect(currentListsFor(tcg, loaded, today).matched).toEqual([
			"2025.04 TCG",
			"2026.05 TCG",
			"2026.10 TCG",
		]);
	});

	it("marks only the max-dated match not after today as current", () => {
		expect(currentListsFor(tcg, loaded, today).current).toEqual(["2026.05 TCG"]);
	});

	it("keeps a future-dated match out of current while still matched", () => {
		const { matched, current } = currentListsFor(tcg, loaded, today);
		expect(matched).toContain("2026.10 TCG");
		expect(current).not.toContain("2026.10 TCG");
	});

	it("treats every dateless match as current alongside the max-dated one", () => {
		expect(currentListsFor(rush, loaded, today)).toEqual({
			matched: ["2026.07.01 Rush Duel", "RD"],
			current: ["2026.07.01 Rush Duel", "RD"],
		});
	});

	it("returns empty sets when nothing loaded matches the group", () => {
		const speed: RankGroupDefinition = {
			name: "Speed",
			enabled: true,
			onlyCurrent: false,
			members: ["* Speed Duel"],
		};
		expect(currentListsFor(speed, loaded, today)).toEqual({ matched: [], current: [] });
	});

	it("leaves current empty when every dated match is in the future", () => {
		const early = new Date(Date.UTC(2024, 0, 1));
		expect(currentListsFor(tcg, loaded, early)).toEqual({
			matched: ["2025.04 TCG", "2026.05 TCG", "2026.10 TCG"],
			current: [],
		});
	});

	it("includes a list dated exactly today as current", () => {
		const firstOfMay = new Date(Date.UTC(2026, 4, 1)); // 2026-05-01
		expect(currentListsFor(tcg, loaded, firstOfMay).current).toEqual(["2026.05 TCG"]);
	});

	it("keeps every tied max-dated match current, consistently with resolveGroupsFor", () => {
		const tied = ["2026.05 TCG", "2026.05.01 Extra TCG"];
		const { current } = currentListsFor(tcg, tied, today);
		expect(current).toEqual(tied);
		for (const name of tied) {
			expect(resolveGroupsFor(name, [tcg], tied, today)).toEqual(["TCG"]);
		}
	});

	it("never reports a non-groupable name as current", () => {
		const global: RankGroupDefinition = {
			name: "Everything",
			enabled: true,
			onlyCurrent: false,
			members: ["Global"],
		};
		expect(currentListsFor(global, ["Global"], today)).toEqual({
			matched: ["Global"],
			current: [],
		});
	});
});
