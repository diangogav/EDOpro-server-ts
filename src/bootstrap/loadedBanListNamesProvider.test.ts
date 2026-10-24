import edoproBanListMemoryRepository from "src/edopro/ban-list/infrastructure/BanListMemoryRepository";
import { EdoproBanList } from "src/edopro/ban-list/domain/BanList";
import ygoproBanListMemoryRepository from "src/ygopro/ban-list/infrastructure/YGOProBanListMemoryRepository";
import { YGOProBanList } from "src/ygopro/ban-list/domain/YGOProBanList";

import { createLoadedBanListNamesProvider } from "./loadedBanListNamesProvider";

function edoproList(name: string): EdoproBanList {
	const banList = new EdoproBanList();
	banList.setName(name);

	return banList;
}

function ygoproList(name?: string): YGOProBanList {
	const banList = new YGOProBanList();
	if (name !== undefined) {
		banList.setName(name);
	}

	return banList;
}

describe("createLoadedBanListNamesProvider", () => {
	const provider = createLoadedBanListNamesProvider();

	afterEach(() => {
		edoproBanListMemoryRepository.replaceAll([]);
		ygoproBanListMemoryRepository.replaceAll([]);
	});

	it("keeps each server's loaded names in its own set, EDOPro first", () => {
		edoproBanListMemoryRepository.replaceAll([edoproList("2026.05 TCG")]);
		ygoproBanListMemoryRepository.replaceAll([ygoproList("2026.05 OCG")]);

		expect(provider.nameSets()).toEqual([["2026.05 TCG"], ["2026.05 OCG"]]);
	});

	it("keeps a name loaded on both sides in both sets and skips nameless lists", () => {
		edoproBanListMemoryRepository.replaceAll([edoproList("2026.05 TCG")]);
		ygoproBanListMemoryRepository.replaceAll([ygoproList("2026.05 TCG"), ygoproList()]);

		expect(provider.nameSets()).toEqual([["2026.05 TCG"], ["2026.05 TCG"]]);
	});

	it("dedupes a name repeated within one server", () => {
		edoproBanListMemoryRepository.replaceAll([]);
		ygoproBanListMemoryRepository.replaceAll([
			ygoproList("2026.09 TCG"),
			ygoproList("2026.09 TCG"),
		]);

		expect(provider.nameSets()).toEqual([[], ["2026.09 TCG"]]);
	});

	it("reflects a hot reload on the next call", () => {
		edoproBanListMemoryRepository.replaceAll([edoproList("2026.05 TCG")]);
		ygoproBanListMemoryRepository.replaceAll([]);

		expect(provider.nameSets()).toEqual([["2026.05 TCG"], []]);

		edoproBanListMemoryRepository.replaceAll([edoproList("2026.07 TCG")]);
		expect(provider.nameSets()).toEqual([["2026.07 TCG"], []]);
	});
});
