import { LoadedBanListNamesSource } from "@shared/rank/domain/LoadedBanListNamesSource";

import { CompositeLoadedBanListNamesProvider } from "./CompositeLoadedBanListNamesProvider";

function makeSource(names: string[]): LoadedBanListNamesSource {
	return { names: () => names };
}

describe("CompositeLoadedBanListNamesProvider", () => {
	it("returns one name set per source, in source order", () => {
		const provider = new CompositeLoadedBanListNamesProvider([
			makeSource(["2026.05 TCG"]),
			makeSource(["2026.05 OCG"]),
		]);

		expect(provider.nameSets()).toEqual([["2026.05 TCG"], ["2026.05 OCG"]]);
	});

	it("dedupes names within a source but not across sources", () => {
		const provider = new CompositeLoadedBanListNamesProvider([
			makeSource(["2026.05 TCG", "2026.05 TCG"]),
			makeSource(["2026.05 TCG"]),
		]);

		expect(provider.nameSets()).toEqual([["2026.05 TCG"], ["2026.05 TCG"]]);
	});

	it("reads the sources on every call", () => {
		let names = ["2026.05 TCG"];
		const provider = new CompositeLoadedBanListNamesProvider([{ names: () => names }]);

		expect(provider.nameSets()).toEqual([["2026.05 TCG"]]);
		names = ["2026.07 TCG"];
		expect(provider.nameSets()).toEqual([["2026.07 TCG"]]);
	});
});
