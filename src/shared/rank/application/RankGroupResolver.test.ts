import { LoadedBanListNamesProvider } from "../domain/LoadedBanListNamesProvider";
import { RankGroupsConfig } from "../domain/RankGroupConfig";
import { RankGroupResolver } from "./RankGroupResolver";

function makeResolver(
	config: RankGroupsConfig,
	loadedNames: string[],
	now: Date,
): RankGroupResolver {
	const provider: LoadedBanListNamesProvider = { names: () => loadedNames };

	return new RankGroupResolver(
		() => config,
		provider,
		() => now,
	);
}

describe("RankGroupResolver", () => {
	const today = new Date(Date.UTC(2026, 7, 1)); // 2026-08-01

	it("resolves aliases from the bound config", () => {
		const resolver = makeResolver({ aliases: { JTP: "JTP (Original)" }, groups: [] }, [], today);

		expect(resolver.resolveAlias("JTP")).toBe("JTP (Original)");
		expect(resolver.resolveAlias("2026.05 TCG")).toBe("2026.05 TCG");
	});

	it("resolves groups against the live loaded banlist names", () => {
		const resolver = makeResolver(
			{
				aliases: {},
				groups: [{ name: "TCG", enabled: true, onlyCurrent: true, members: ["* TCG"] }],
			},
			["2026.05 TCG", "2025.04 TCG"],
			today,
		);

		expect(resolver.groupsFor("2026.05 TCG")).toEqual(["TCG"]);
		expect(resolver.groupsFor("2025.04 TCG")).toEqual([]);
	});

	it("alias-resolves loaded names so a renamed header competes for currency canonically", () => {
		const resolver = makeResolver(
			{
				aliases: { "2026.07 TCG Header": "2026.07 TCG" },
				groups: [{ name: "TCG", enabled: true, onlyCurrent: true, members: ["* TCG"] }],
			},
			["2026.05 TCG", "2026.07 TCG Header"],
			today,
		);

		// The aliased loaded name is the newer current TCG list, so the
		// older played list must not resolve as current.
		expect(resolver.groupsFor("2026.05 TCG")).toEqual([]);
		expect(resolver.groupsFor("2026.07 TCG")).toEqual(["TCG"]);
	});

	it("re-reads loaded names on every call so a hot reload is reflected", () => {
		const names = ["2026.05 TCG"];
		const provider: LoadedBanListNamesProvider = { names: () => [...names] };
		const resolver = new RankGroupResolver(
			() => ({
				aliases: {},
				groups: [{ name: "TCG", enabled: true, onlyCurrent: true, members: ["* TCG"] }],
			}),
			provider,
			() => today,
		);

		expect(resolver.groupsFor("2026.05 TCG")).toEqual(["TCG"]);

		names.push("2026.07 TCG");
		expect(resolver.groupsFor("2026.05 TCG")).toEqual([]);
	});
});
