import { laddersForBanList } from "./laddersForBanList";

const resolver = (aliases: Record<string, string>, groups: Record<string, string[]>) => ({
	resolveAlias: (name: string) => aliases[name] ?? name,
	groupsFor: (name: string) => groups[name] ?? [],
});

describe("laddersForBanList", () => {
	it("returns no ladders for an empty or N/A list", () => {
		const r = resolver({}, {});

		expect(laddersForBanList(r, "")).toEqual([]);
		expect(laddersForBanList(r, "N/A")).toEqual([]);
	});

	it("returns the resolved canonical rank followed by its groups", () => {
		const r = resolver({ "2024.04 TCG": "TCG" }, { TCG: ["Global"] });

		expect(laddersForBanList(r, "2024.04 TCG")).toEqual(["TCG", "Global"]);
	});

	it("does not repeat a ladder that is also a group", () => {
		const r = resolver({}, { TCG: ["TCG", "Global"] });

		expect(laddersForBanList(r, "TCG")).toEqual(["TCG", "Global"]);
	});
});
